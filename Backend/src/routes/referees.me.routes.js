// Entorno del cuerpo arbitral (Figma 05): la ficha y las designaciones de quien tiene la sesión.
//
// La persona se obtiene SIEMPRE del vínculo persons.user_id con la cuenta del token verificado;
// ninguna ruta acepta un id de persona del cliente. Además se exige el rol Arbitro en la cuenta y
// el rol ARBITRO activo en el padrón: si FECOVOL retira cualquiera de los dos, el acceso se corta.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { tieneRol, denegar, hoyCR, sumarDias, texto } = require('../utils/arbitraje');

const router = express.Router();
router.param('id', validateUuidParams);

const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const TELEFONO = /^[0-9 +()-]{7,20}$/;

const SELECT_ACREDITACION = `id, modality, valid_from, valid_until, status, created_at,
  funcion:catalog_values!referee_accreditations_function_value_id_fkey(code, value),
  nivel:catalog_values!referee_accreditations_level_value_id_fkey(code, value),
  categoria:catalog_values!referee_accreditations_category_value_id_fkey(code, value)`;

const SELECT_DESIGNACION = `id, status, notes, assigned_at, responded_at,
  puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value),
  partido:matches!fk_referee_assignments_match(id, match_number, scheduled_date, scheduled_time, status, acta_status, matchday,
    sede:catalog_values!fk_matches_venue(value),
    local:teams!matches_home_team_id_fkey(name, short_name),
    visitante:teams!matches_away_team_id_fkey(name, short_name),
    competencia:competitions!matches_competition_id_fkey(id, name))`;

async function cargarArbitro(req, res, next) {
  try {
    const scope = req.userScope || { isPublic: true };
    if (!req.auth || scope.isPublic) throw new HttpError(401, 'Se requiere iniciar sesión.');
    if (!tieneRol(scope, 'arbitro')) {
      await denegar(req, 'Intento de entrar al entorno del cuerpo arbitral sin el rol Arbitro', 'referee_assignments');
      throw new HttpError(403, 'Esta sección es para el cuerpo arbitral.');
    }

    const { data: persona, error } = await supabase
      .from('persons')
      .select(`id, first_name, last_name, document_number, province, email, phone, status, association_id,
        asociacion:associations(name, short_name), person_roles(role_type, is_active)`)
      .eq('user_id', req.auth.userId)
      .maybeSingle();
    if (error) throw new HttpError(500, 'No fue posible consultar su ficha.');
    if (!persona) {
      throw new HttpError(404, 'Su cuenta no está vinculada con una persona del padrón. Solicite a FECOVOL que la vincule.');
    }
    const esArbitro = (persona.person_roles || []).some((r) => r.role_type === 'ARBITRO' && r.is_active);
    if (persona.status !== 'ACTIVA' || !esArbitro) {
      await denegar(req, `Cuenta vinculada con una persona que no está activa en el cuerpo arbitral (${persona.id})`, 'referee_assignments');
      throw new HttpError(403, 'Su registro en el cuerpo arbitral no está activo. Comuníquese con FECOVOL.');
    }
    const { person_roles: _roles, ...datos } = persona;
    req.arbitro = datos;
    next();
  } catch (e) {
    next(e);
  }
}
router.use(cargarArbitro);

const ordenPartido = (d) => `${d.partido?.scheduled_date || ''} ${d.partido?.scheduled_time || ''}`;

function puedeResponder(d, hoy) {
  const p = d.partido;
  return d.status === 'PROPUESTA' && p && ['PROGRAMADO', 'REPROGRAMADO'].includes(p.status) && p.scheduled_date >= hoy;
}

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/me -> Mi ficha
   ---------------------------------------------------------------------------------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const persona = req.arbitro;
  const hoy = hoyCR();
  const anio = hoy.slice(0, 4);

  const [acreditaciones, cursos, abiertos, designaciones] = await Promise.all([
    supabase.from('referee_accreditations').select(SELECT_ACREDITACION).eq('person_id', persona.id).order('valid_from', { ascending: false }),
    supabase
      .from('referee_course_enrollments')
      .select('id, grade, result, created_at, curso:referee_courses!referee_course_enrollments_course_id_fkey(id, name, course_type, start_date, end_date, status)')
      .eq('person_id', persona.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('referee_courses')
      .select('id, name, course_type, format, start_date, end_date, venue, capacity, enrollment_opens, enrollment_closes, only_current_accreditation')
      .eq('status', 'PUBLICADO')
      .eq('enrollment_open', true)
      .gte('end_date', hoy)
      .order('start_date'),
    supabase
      .from('referee_assignments')
      .select('status, puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code), partido:matches!fk_referee_assignments_match!inner(scheduled_date, acta_status)')
      .eq('person_id', persona.id)
      .in('status', ['CONFIRMADA', 'CUMPLIDA'])
      .gte('partido.scheduled_date', `${anio}-01-01`)
      .lte('partido.scheduled_date', `${anio}-12-31`)
  ]);
  for (const r of [acreditaciones, cursos, abiertos, designaciones]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }

  const activa = (acreditaciones.data || []).find((a) => a.status === 'ACTIVA') || null;
  const vigente = Boolean(activa && activa.valid_until >= hoy);
  const inscritos = new Set((cursos.data || []).map((c) => c.curso?.id));
  const cursosAbiertos = (abiertos.data || []).filter((c) => !inscritos.has(c.id)
    && (!c.enrollment_opens || c.enrollment_opens <= hoy)
    && (!c.enrollment_closes || c.enrollment_closes >= hoy)
    && (!c.only_current_accreditation || vigente));

  const temporada = { anio: Number(anio), partidos: 0, por_puesto: {}, actas_validadas: 0 };
  for (const d of designaciones.data || []) {
    if (d.partido?.scheduled_date > hoy && d.status !== 'CUMPLIDA') continue; // aún por jugarse
    temporada.partidos += 1;
    const puesto = d.puesto?.code || 'OTRO';
    temporada.por_puesto[puesto] = (temporada.por_puesto[puesto] || 0) + 1;
    if (d.partido?.acta_status === 'VALIDADA') temporada.actas_validadas += 1;
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      persona,
      acreditacion: activa,
      acreditaciones: acreditaciones.data || [],
      cursos: cursos.data || [],
      cursos_abiertos: cursosAbiertos,
      temporada
    }
  });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/me/designaciones -> designaciones desde hace 4 meses y las próximas
   ---------------------------------------------------------------------------------------------- */
router.get('/designaciones', asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const { data, error } = await supabase
    .from('referee_assignments')
    .select(SELECT_DESIGNACION.replace('partido:matches!fk_referee_assignments_match(', 'partido:matches!fk_referee_assignments_match!inner('))
    .eq('person_id', req.arbitro.id)
    .neq('status', 'ANULADA')
    .gte('partido.scheduled_date', sumarDias(hoy, -120));
  const err = fromSupabase(error);
  if (err) throw err;

  res.set('Cache-Control', 'no-store');
  res.json({
    data: (data || [])
      .map((d) => ({ ...d, puede_responder: puedeResponder(d, hoy) }))
      .sort((a, b) => ordenPartido(a).localeCompare(ordenPartido(b))),
    hoy
  });
}));

/* ------------------------------------------------------------------------------------------------
   PATCH /api/referees/me/designaciones/:id -> confirmar o rechazar (con motivo)
   ---------------------------------------------------------------------------------------------- */
router.patch('/designaciones/:id', asyncHandler(async (req, res) => {
  const estado = req.body?.status;
  if (!['CONFIRMADA', 'RECHAZADA'].includes(estado)) throw new HttpError(400, 'Responda CONFIRMADA o RECHAZADA.');
  const motivo = texto(req.body?.motivo, 500);
  if (estado === 'RECHAZADA' && motivo.length < 10) {
    throw new HttpError(400, 'Indique el motivo del rechazo (al menos 10 caracteres) para que FECOVOL designe a otra persona.');
  }

  const { error } = await supabase.rpc('sp_respond_referee_assignment', {
    p_id: req.params.id,
    p_person_id: req.arbitro.id,
    p_status: estado,
    p_notes: estado === 'RECHAZADA' ? `Rechazada por el árbitro: ${motivo}` : (motivo || null),
    p_user: req.currentUser
  });
  if (error) {
    if (error.code === 'P0001') throw new HttpError(409, 'Esta designación ya no se puede responder: puede que ya la haya respondido o que el partido cambió.');
    throw fromSupabase(error);
  }

  const { data } = await supabase.from('referee_assignments').select(SELECT_DESIGNACION).eq('id', req.params.id).eq('person_id', req.arbitro.id).maybeSingle();
  res.json({ data: data ? { ...data, puede_responder: false } : { id: req.params.id, status: estado } });
}));

/* ------------------------------------------------------------------------------------------------
   PATCH /api/referees/me/contacto -> correo y teléfono (los demás datos los corrige FECOVOL)
   ---------------------------------------------------------------------------------------------- */
router.patch('/contacto', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const correo = b.email === undefined ? undefined : texto(b.email, 254).toLowerCase();
  const telefono = b.phone === undefined ? undefined : texto(b.phone, 20);
  if (correo === undefined && telefono === undefined) throw new HttpError(400, 'Indique el correo o el teléfono.');
  if (correo !== undefined && !CORREO.test(correo)) throw new HttpError(400, 'El correo no es válido.');
  if (telefono !== undefined && !TELEFONO.test(telefono)) throw new HttpError(400, 'El teléfono no es válido.');

  const { error } = await supabase.rpc('sp_update_person', {
    p_id: req.arbitro.id,
    p_admin_user: req.currentUser,
    p_email: correo ?? null,
    p_phone: telefono ?? null
  });
  const err = fromSupabase(error, 'Persona');
  if (err) throw err;
  res.json({ data: { email: correo ?? req.arbitro.email, phone: telefono ?? req.arbitro.phone } });
}));

/* ------------------------------------------------------------------------------------------------
   POST /api/referees/me/cursos/:id/inscripcion -> inscribirse en un curso abierto
   ---------------------------------------------------------------------------------------------- */
router.post('/cursos/:id/inscripcion', asyncHandler(async (req, res) => {
  const { data: id, error } = await supabase.rpc('sp_enroll_referee_course', {
    p_course_id: req.params.id,
    p_person_id: req.arbitro.id,
    p_por_fecovol: false,
    p_admin_user: req.currentUser
  });
  const err = fromSupabase(error, 'Curso');
  if (err) throw err;
  res.status(201).json({ data: { id } });
}));

module.exports = router;
