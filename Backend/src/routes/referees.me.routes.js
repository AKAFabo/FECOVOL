// Entorno del cuerpo arbitral (Figma 05): la ficha y las designaciones de quien tiene la sesión.
//
// La persona se obtiene SIEMPRE del vínculo persons.user_id con la cuenta del token verificado;
// ninguna ruta acepta un id de persona del cliente. Además se exige el rol Arbitro en la cuenta y
// el rol ARBITRO activo en el padrón: si FECOVOL retira cualquiera de los dos, el acceso se corta.
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { normalizarTelefono } = require('../utils/telefono');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { tieneRol, denegar, hoyCR, sumarDias, texto } = require('../utils/arbitraje');
const { detectarTipo, nombreSeguro, limitesDeArchivos, TOPE_MB } = require('../utils/archivos');
const { RESULTADOS, TIPOS_EVIDENCIA, leerCierre } = require('../utils/cierreArbitral');

const router = express.Router();
router.param('id', validateUuidParams);

const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

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

function lanzarSiError(error) {
  const err = fromSupabase(error);
  if (err) throw err;
}

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
  let telefono;
  if (b.phone !== undefined) {
    const { valor, error } = normalizarTelefono(b.phone);
    if (error || !valor) throw new HttpError(400, error || 'Escriba el teléfono.');
    telefono = valor;
  }
  if (correo === undefined && telefono === undefined) throw new HttpError(400, 'Indique el correo o el teléfono.');
  if (correo !== undefined && !CORREO.test(correo)) throw new HttpError(400, 'El correo no es válido.');

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

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/me/actas -> actas de los partidos ya disputados en los que estuvo designado
   ---------------------------------------------------------------------------------------------- */
function estadoActa(partido, cierre) {
  if (partido.acta_status === 'VALIDADA') return 'VALIDADA';
  if (cierre?.status === 'DEVUELTO') return 'DEVUELTA';
  if (partido.acta_status === 'ENVIADA' || cierre?.status === 'ENVIADO') return 'EN_VALIDACION';
  return 'ABIERTA';
}

function marcadorDe(partido, cierre) {
  if (partido.acta_status === 'VALIDADA' && Number.isInteger(partido.home_sets_won)) return [partido.home_sets_won, partido.away_sets_won];
  const sets = Array.isArray(cierre?.sets) ? cierre.sets : [];
  if (!sets.length) return null;
  return sets.reduce(([l, v], st) => (st.home_points > st.away_points ? [l + 1, v] : [l, v + 1]), [0, 0]);
}

router.get('/actas', asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const anio = Number(req.query.anio) || Number(hoy.slice(0, 4));
  if (anio < 2000 || anio > 2100) throw new HttpError(400, 'Año no válido.');

  const { data: designaciones, error } = await supabase
    .from('referee_assignments')
    .select(`id, status,
      puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value),
      partido:matches!fk_referee_assignments_match!inner(id, match_number, matchday, scheduled_date, scheduled_time, status, acta_status,
        home_sets_won, away_sets_won,
        competencia:competitions!matches_competition_id_fkey(id, name),
        local:teams!matches_home_team_id_fkey(name, short_name),
        visitante:teams!matches_away_team_id_fkey(name, short_name))`)
    .eq('person_id', req.arbitro.id)
    .in('status', ['PROPUESTA', 'CONFIRMADA', 'CUMPLIDA'])
    .lte('partido.scheduled_date', hoy)
    .gte('partido.scheduled_date', `${anio}-01-01`)
    .lte('partido.scheduled_date', `${anio}-12-31`);
  lanzarSiError(error);

  const jugados = (designaciones || []).filter((d) => d.partido && d.partido.status !== 'CANCELADO');
  const ids = jugados.map((d) => d.partido.id);
  const [cierres, hojas] = ids.length
    ? await Promise.all([
        supabase.from('match_referee_reports').select('match_id, status, sets, return_reason, submitted_at').in('match_id', ids),
        supabase.from('match_evidence').select('match_id').in('match_id', ids).eq('file_type', 'HOJA_ANOTACION').is('replaced_by', null)
      ])
    : [{ data: [] }, { data: [] }];
  lanzarSiError(cierres.error);
  lanzarSiError(hojas.error);
  const cierrePor = new Map((cierres.data || []).map((c) => [c.match_id, c]));
  const conHoja = new Set((hojas.data || []).map((h) => h.match_id));

  const actas = jugados
    .map((d) => {
      const p = d.partido;
      const cierre = cierrePor.get(p.id) || null;
      const estado = estadoActa(p, cierre);
      return {
        partido: { id: p.id, match_number: p.match_number, matchday: p.matchday, scheduled_date: p.scheduled_date, scheduled_time: p.scheduled_time, competencia: p.competencia, local: p.local, visitante: p.visitante },
        puesto: d.puesto,
        estado,
        marcador: marcadorDe(p, cierre),
        hoja_adjuntada: conHoja.has(p.id),
        motivo_devolucion: estado === 'DEVUELTA' ? cierre.return_reason : null,
        enviado_en: cierre?.submitted_at || null,
        puede_cerrar: d.puesto?.code === 'PRI' && (estado === 'ABIERTA' || estado === 'DEVUELTA')
      };
    })
    .sort((a, b) => `${b.partido.scheduled_date} ${b.partido.scheduled_time || ''}`.localeCompare(`${a.partido.scheduled_date} ${a.partido.scheduled_time || ''}`));

  res.set('Cache-Control', 'no-store');
  res.json({ data: actas, anio, hoy });
}));

/* ================================================================================================
   PARTIDO DESIGNADO: información, nóminas, cierre y evidencias (RF-ARB-004, 005 y 006)
   ============================================================================================== */

const BUCKET_EVIDENCIAS = 'evidence';
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: TOPE_MB * 1024 * 1024, files: 1 } });

function recibirArchivo(req, res, next) {
  subida.single('archivo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? `El archivo supera el máximo de ${TOPE_MB} MB.` : 'No se pudo leer el archivo.'));
    }
    next(err);
  });
}

const SELECT_PARTIDO_ARBITRO = `id, match_number, matchday, scheduled_date, scheduled_time, status, acta_status, result_type,
  home_sets_won, away_sets_won, updated_at,
  sede:catalog_values!fk_matches_venue(value),
  competencia:competitions!matches_competition_id_fkey(id, name),
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name),
  oficiales:referee_assignments!fk_referee_assignments_match(id, status,
    persona:persons!referee_assignments_person_id_fkey(id, first_name, last_name),
    puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value))`;

const VIGENTES = ['PROPUESTA', 'CONFIRMADA', 'CUMPLIDA'];

// Designación que cuenta para un partido ya disputado: confirmada o cumplida, y también una que
// quedó propuesta sin responder, porque después de la fecha ya no se puede confirmar
// (sp_respond_referee_assignment) y quien estuvo en el partido debe poder cerrar el acta.
function cuentaParaPartidoJugado(propia, partido, hoy) {
  if (['CONFIRMADA', 'CUMPLIDA'].includes(propia.status)) return true;
  return propia.status === 'PROPUESTA' && Boolean(partido.scheduled_date) && partido.scheduled_date <= hoy;
}

/**
 * Carga el partido solo si la persona de la sesión está designada en él. El id del partido viene
 * de la URL, pero el acceso se decide con la designación de la persona del token.
 */
async function partidoDesignado(req, matchId) {
  const { data: partido, error } = await supabase.from('matches').select(SELECT_PARTIDO_ARBITRO).eq('id', matchId).maybeSingle();
  if (error) throw new HttpError(500, 'No fue posible consultar el partido.');
  const propia = (partido?.oficiales || []).find((o) => o.persona?.id === req.arbitro.id && VIGENTES.includes(o.status));
  if (!partido || !propia) {
    await denegar(req, `Intento de consultar un partido sin estar designado (${matchId})`, 'matches');
    throw new HttpError(404, 'No está designado en ese partido.');
  }
  return { partido, propia };
}

const nombreDe = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

// Nómina de un equipo en la competencia, con los datos que necesita el arbitraje: nombre, número,
// función, habilitación e identidad verificada. Nunca cédulas, fechas de nacimiento ni contactos.
async function nominaParaArbitraje(competitionId, team) {
  const [integrantes, versiones] = await Promise.all([
    supabase
      .from('competition_rosters')
      .select('jersey_number, roster_role, is_habilitated, updated_at, persona:persons!competition_rosters_person_id_fkey(first_name, last_name, is_verified)')
      .eq('competition_id', competitionId)
      .eq('team_id', team.id)
      .eq('status', 'ACTIVO'),
    supabase
      .from('competition_roster_versions')
      .select('version_number, status, approved_at, created_at')
      .eq('competition_id', competitionId)
      .eq('team_id', team.id)
      .order('version_number', { ascending: false })
      .limit(1)
  ]);
  for (const r of [integrantes, versiones]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }
  const ultima = (versiones.data || [])[0] || null;
  const lista = (integrantes.data || [])
    .map((n) => ({
      name: nombreDe(n.persona),
      number: n.jersey_number ?? null,
      role: n.roster_role,
      habilitated: n.is_habilitated !== false,
      identity_verified: Boolean(n.persona?.is_verified)
    }))
    .sort((a, b) => (a.role === b.role ? (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'es') : a.role === 'JUGADOR' ? -1 : 1));
  const cambios = (integrantes.data || []).map((n) => n.updated_at).filter(Boolean).sort();
  return {
    team: { id: team.id, name: team.name, short_name: team.short_name },
    official: ultima?.status === 'OFICIALIZADA',
    version: ultima ? { number: ultima.version_number, status: ultima.status, approved_at: ultima.approved_at } : null,
    last_change: cambios.length ? cambios[cambios.length - 1] : null,
    members: lista
  };
}

async function evidenciasDe(matchId) {
  const { data, error } = await supabase
    .from('match_evidence')
    .select('id, file_url, file_name, file_type, description, uploaded_by, uploaded_by_person, replaced_by, replaced_at, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  const err = fromSupabase(error);
  if (err) throw err;
  return Promise.all((data || []).map(async ({ file_url: ruta, uploaded_by: correo, ...ev }) => {
    let url = null;
    if (ruta && !ruta.startsWith('http')) {
      const { data: firmado } = await supabase.storage.from(BUCKET_EVIDENCIAS).createSignedUrl(ruta, 600);
      url = firmado?.signedUrl || null;
    }
    // Quién cargó: se muestra como "FECOVOL" o "Cuerpo arbitral" para no exponer correos.
    return { ...ev, url, uploaded_by: ev.uploaded_by_person ? 'Cuerpo arbitral' : (correo ? 'FECOVOL' : null) };
  }));
}

function puedeCerrar(partido, propia, cierre, hoy) {
  return propia.puesto?.code === 'PRI'
    && cuentaParaPartidoJugado(propia, partido, hoy)
    && partido.status !== 'CANCELADO'
    && partido.acta_status !== 'VALIDADA'
    && Boolean(partido.scheduled_date) && partido.scheduled_date <= hoy
    && cierre?.status !== 'ENVIADO';
}

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/me/partidos/:id -> partido, nóminas, cierre y evidencias
   ---------------------------------------------------------------------------------------------- */
router.get('/partidos/:id', asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const { partido, propia } = await partidoDesignado(req, req.params.id);
  const confirmada = cuentaParaPartidoJugado(propia, partido, hoy);

  const [local, visitante, cierreR, evidencias] = await Promise.all([
    partido.local ? nominaParaArbitraje(partido.competencia.id, partido.local) : null,
    partido.visitante ? nominaParaArbitraje(partido.competencia.id, partido.visitante) : null,
    supabase.from('match_referee_reports').select('status, result_type, sets, observations, return_reason, submitted_at, returned_at, updated_at').eq('match_id', partido.id).maybeSingle(),
    confirmada ? evidenciasDe(partido.id) : []
  ]);
  const err = fromSupabase(cierreR.error);
  if (err) throw err;

  const { oficiales, ...datos } = partido;
  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      partido: datos,
      mi_puesto: propia.puesto,
      mi_estado: propia.status,
      oficiales: (oficiales || [])
        .filter((o) => VIGENTES.includes(o.status))
        .map((o) => ({ name: nombreDe(o.persona), puesto: o.puesto, status: o.status, propio: o.id === propia.id })),
      nominas: [local, visitante].filter(Boolean),
      cierre: cierreR.data || null,
      puede_cerrar: puedeCerrar(partido, propia, cierreR.data, hoy),
      puede_adjuntar: confirmada && partido.status !== 'CANCELADO' && partido.acta_status !== 'VALIDADA' && Boolean(partido.scheduled_date) && partido.scheduled_date <= hoy,
      evidencias,
      resultados: RESULTADOS,
      tipos_evidencia: TIPOS_EVIDENCIA,
      hoy
    }
  });
}));

/* ------------------------------------------------------------------------------------------------
   PUT /api/referees/me/partidos/:id/cierre -> guardar el borrador o enviarlo a FECOVOL
   ---------------------------------------------------------------------------------------------- */
router.put('/partidos/:id/cierre', asyncHandler(async (req, res) => {
  const enviar = req.body?.enviar === true;
  const { partido, propia } = await partidoDesignado(req, req.params.id);
  if (propia.puesto?.code !== 'PRI') {
    await denegar(req, `Intento de registrar el cierre sin ser el árbitro principal (${partido.id})`, 'match_referee_reports');
    throw new HttpError(403, 'El cierre lo registra el árbitro principal del partido.');
  }
  const { tipo, sets, observaciones } = leerCierre(req.body, enviar);

  const { data: estado, error } = await supabase.rpc('sp_save_referee_report', {
    p_match_id: partido.id,
    p_person_id: req.arbitro.id,
    p_result_type: tipo,
    p_sets: sets,
    p_observations: observaciones || null,
    p_enviar: enviar,
    p_user: req.currentUser
  });
  if (error) {
    if (error.code === 'P0001') throw new HttpError(409, error.message);
    throw fromSupabase(error);
  }
  res.json({ data: { status: estado, enviado: estado === 'ENVIADO' } });
}));

/* ------------------------------------------------------------------------------------------------
   POST /api/referees/me/partidos/:id/evidencias -> adjuntar (o sustituir) una evidencia
   ---------------------------------------------------------------------------------------------- */
router.post('/partidos/:id/evidencias', recibirArchivo, asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const { partido, propia } = await partidoDesignado(req, req.params.id);
  if (!cuentaParaPartidoJugado(propia, partido, hoy)) throw new HttpError(403, 'Su designación no está vigente para este partido.');
  if (partido.acta_status === 'VALIDADA') throw new HttpError(409, 'FECOVOL ya validó el acta; ya no se adjuntan evidencias.');
  if (partido.status === 'CANCELADO' || !partido.scheduled_date || partido.scheduled_date > hoy) {
    throw new HttpError(409, 'Las evidencias se adjuntan cuando el partido ya se disputó.');
  }

  const tipoDoc = String(req.body?.file_type || '');
  if (!TIPOS_EVIDENCIA[tipoDoc]) throw new HttpError(400, 'Indique el tipo de evidencia.');
  const descripcion = texto(req.body?.description, 500) || null;
  const sustituye = req.body?.replaces ? String(req.body.replaces) : null;
  if (!req.file?.buffer?.length) throw new HttpError(400, 'Adjunte el archivo.');

  const limites = await limitesDeArchivos();
  if (req.file.buffer.length > limites.maximoMb * 1024 * 1024) throw new HttpError(400, `El archivo supera el máximo de ${limites.maximoMb} MB.`);
  const tipo = detectarTipo(req.file.buffer);
  if (!tipo || !limites.formatos.includes(tipo.formato)) {
    throw new HttpError(400, `El archivo debe ser ${limites.formatos.join(', ')}. Su contenido no corresponde a ninguno de esos formatos.`);
  }

  let anterior = null;
  if (sustituye) {
    const { data } = await supabase.from('match_evidence').select('id, replaced_by').eq('id', sustituye).eq('match_id', partido.id).maybeSingle();
    if (!data) throw new HttpError(404, 'La evidencia que quiere sustituir no existe en este partido.');
    if (data.replaced_by) throw new HttpError(409, 'Esa evidencia ya fue sustituida.');
    anterior = data;
  }

  const nombre = nombreSeguro(req.file.originalname, tipo.extension);
  const ruta = `matches/${partido.id}/${crypto.randomUUID()}.${tipo.extension}`;
  const { error: errSubida } = await supabase.storage.from(BUCKET_EVIDENCIAS).upload(ruta, req.file.buffer, { contentType: tipo.mime, upsert: false });
  if (errSubida) throw new HttpError(502, 'No se pudo guardar el archivo. Intente de nuevo.');

  const { data: evidencia, error } = await supabase
    .from('match_evidence')
    .insert({
      match_id: partido.id,
      file_url: ruta,
      file_name: nombre,
      file_type: tipoDoc,
      description: descripcion,
      uploaded_by: req.currentUser,
      uploaded_by_person: req.arbitro.id
    })
    .select('id, file_name, file_type, description, created_at')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET_EVIDENCIAS).remove([ruta]).catch(() => {});
    throw fromSupabase(error);
  }
  if (anterior) {
    await supabase.from('match_evidence').update({ replaced_by: evidencia.id, replaced_at: new Date().toISOString() }).eq('id', anterior.id);
  }
  res.status(201).json({ data: evidencia });
}));

module.exports = router;
