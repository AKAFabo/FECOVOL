// Arbitraje para FECOVOL (RF-ARB-001..004): cuerpo arbitral, acreditaciones, cursos y oficiales
// disponibles para designar.
//
// Consultar: Administrador o Personal de competencias (este último designa en los partidos).
// Acreditar y gestionar cursos: solo Administración.
// El entorno del propio árbitro está en referees.me.routes.js.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const {
  UUID, CODIGO, OFICIALES_POR_PARTIDO, DESIGNACION_VIGENTE, esFecha, hoyCR, sumarDias, texto,
  limpiarBusqueda, filtroNombreOCedula, soloFecovol, soloAdministracion, valorCatalogo, oficialesVigentes
} = require('../utils/arbitraje');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('inscripcionId', validateUuidParams);

const POR_PAGINA = 20;
const ESTADOS_ACREDITACION = ['AL_DIA', 'POR_VENCER', 'VENCIDA', 'SIN_ACREDITACION'];
const MODALIDADES = ['SALA', 'PLAYA', 'SALA_PLAYA'];
const EVALUACIONES = ['APROBADA', 'REPROBADA', 'PENDIENTE'];
const TIPOS_CURSO = ['FORMACION_INICIAL', 'ACTUALIZACION_ANUAL', 'ASCENSO_NIVEL'];
const FORMATOS_CURSO = ['PRESENCIAL', 'VIRTUAL', 'MIXTO'];

const COLUMNAS_CUERPO = `person_id, first_name, last_name, document_number, province, association_id,
  asociacion_name, asociacion_short_name, tiene_cuenta, accreditation_id, funcion_code, funcion_value,
  nivel_code, nivel_value, modality, categoria_code, categoria_value, valid_from, valid_until, estado,
  partidos_temporada`;

const SELECT_ACREDITACION = `id, modality, valid_from, valid_until, status, practical_evaluation, physical_test,
  notes, created_by, created_at, course_enrollment_id, certificate_document_id, medical_document_id,
  funcion:catalog_values!referee_accreditations_function_value_id_fkey(code, value),
  nivel:catalog_values!referee_accreditations_level_value_id_fkey(code, value),
  categoria:catalog_values!referee_accreditations_category_value_id_fkey(code, value)`;

const SELECT_INSCRIPCION_PERSONA = `id, grade, result, created_at,
  curso:referee_courses!referee_course_enrollments_course_id_fkey(id, name, course_type, start_date, end_date, status, passing_grade)`;

const SELECT_DESIGNACION_PERSONA = `id, status, notes, assigned_at, responded_at,
  puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value),
  partido:matches!fk_referee_assignments_match(id, scheduled_date, scheduled_time, status, acta_status, matchday,
    local:teams!matches_home_team_id_fkey(name, short_name),
    visitante:teams!matches_away_team_id_fkey(name, short_name),
    competencia:competitions!matches_competition_id_fkey(id, name))`;

const SELECT_CURSO = `id, name, course_type, format, start_date, end_date, venue, capacity, passing_grade, content,
  enrollment_opens, enrollment_closes, enrollment_open, only_current_accreditation, status, created_at,
  modalidad:catalog_values!referee_courses_modality_value_id_fkey(code, value),
  instructor:persons!referee_courses_instructor_person_id_fkey(id, first_name, last_name)`;

const porFecha = (a, b) => `${a.partido?.scheduled_date} ${a.partido?.scheduled_time}`.localeCompare(`${b.partido?.scheduled_date} ${b.partido?.scheduled_time}`);

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/resumen -> cifras del cuerpo arbitral, cobertura de los próximos partidos y
   cursos por venir.
   ---------------------------------------------------------------------------------------------- */
router.get('/resumen', soloFecovol, asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const hasta = sumarDias(hoy, 14);

  const [cuerpo, partidos, cursos] = await Promise.all([
    supabase.from('v_cuerpo_arbitral').select('estado'),
    supabase
      .from('matches')
      .select('id, arbitraje:referee_assignments!fk_referee_assignments_match(status)')
      .in('status', ['PROGRAMADO', 'REPROGRAMADO'])
      .gte('scheduled_date', hoy)
      .lte('scheduled_date', hasta),
    supabase
      .from('referee_courses')
      .select('id, name, course_type, format, start_date, end_date, venue, status, enrollment_open, inscritos:referee_course_enrollments(count)')
      .eq('status', 'PUBLICADO')
      .gte('end_date', hoy)
      .order('start_date')
      .limit(5)
  ]);
  for (const r of [cuerpo, partidos, cursos]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }

  const estados = { AL_DIA: 0, POR_VENCER: 0, VENCIDA: 0, SIN_ACREDITACION: 0 };
  for (const f of cuerpo.data || []) if (f.estado in estados) estados[f.estado] += 1;

  const cobertura = { desde: hoy, hasta, partidos: 0, completos: 0, incompletos: 0, sin_oficiales: 0 };
  for (const m of partidos.data || []) {
    const n = oficialesVigentes(m.arbitraje).length;
    cobertura.partidos += 1;
    if (n >= OFICIALES_POR_PARTIDO) cobertura.completos += 1;
    else if (n > 0) cobertura.incompletos += 1;
    else cobertura.sin_oficiales += 1;
  }
  cobertura.porcentaje = cobertura.partidos ? Math.round((cobertura.completos / cobertura.partidos) * 100) : null;

  res.json({
    data: {
      acreditados: estados.AL_DIA + estados.POR_VENCER,
      total: (cuerpo.data || []).length,
      ...Object.fromEntries(Object.entries(estados).map(([k, v]) => [k.toLowerCase(), v])),
      cobertura,
      cursos: (cursos.data || []).map(({ inscritos, ...c }) => ({ ...c, inscritos: inscritos?.[0]?.count ?? 0 }))
    }
  });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/referees?estado=&nivel=&funcion=&provincia=&q=&pagina= -> cuerpo arbitral (paginado)
   ---------------------------------------------------------------------------------------------- */
router.get('/', soloFecovol, asyncHandler(async (req, res) => {
  const { estado, nivel, funcion, provincia } = req.query;
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(req.query.pagina, 10) || 1));
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';

  let query = supabase
    .from('v_cuerpo_arbitral')
    .select(COLUMNAS_CUERPO, { count: 'exact' })
    .order('last_name')
    .order('first_name')
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (estado) {
    if (!ESTADOS_ACREDITACION.includes(estado)) throw new HttpError(400, 'Estado de acreditación no válido.');
    query = query.eq('estado', estado);
  }
  if (nivel) {
    if (!CODIGO.test(nivel)) throw new HttpError(400, 'Nivel no válido.');
    query = query.eq('nivel_code', nivel);
  }
  if (funcion) {
    if (!CODIGO.test(funcion)) throw new HttpError(400, 'Función no válida.');
    query = query.eq('funcion_code', funcion);
  }
  if (provincia) query = query.eq('province', texto(provincia, 40));
  if (q) query = query.or(filtroNombreOCedula(q));

  const { data, error, count } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: count ?? data.length, pagina, por_pagina: POR_PAGINA });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/personas/:id -> ficha arbitral: datos, acreditaciones, cursos y partidos.
   También la usa "Acreditar árbitro" para cualquier persona del padrón.
   ---------------------------------------------------------------------------------------------- */
router.get('/personas/:id', soloFecovol, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [persona, acreditaciones, cursos, designaciones] = await Promise.all([
    supabase
      .from('persons')
      .select(`id, first_name, last_name, document_number, province, email, phone, status, association_id, user_id, created_at,
        asociacion:associations(id, name, short_name), person_roles(role_type, is_active)`)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('referee_accreditations').select(SELECT_ACREDITACION).eq('person_id', id).order('valid_from', { ascending: false }),
    supabase.from('referee_course_enrollments').select(SELECT_INSCRIPCION_PERSONA).eq('person_id', id).order('created_at', { ascending: false }),
    supabase.from('referee_assignments').select(SELECT_DESIGNACION_PERSONA).eq('person_id', id).neq('status', 'ANULADA')
  ]);
  for (const r of [persona, acreditaciones, cursos, designaciones]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }
  if (!persona.data) throw new HttpError(404, 'Persona no encontrada.');

  // El id de la cuenta no sale del backend: basta con saber si tiene acceso.
  const { user_id: cuenta, ...datos } = persona.data;
  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      persona: { ...datos, tiene_cuenta: Boolean(cuenta) },
      acreditacion: (acreditaciones.data || []).find((a) => a.status === 'ACTIVA') || null,
      acreditaciones: acreditaciones.data || [],
      cursos: cursos.data || [],
      designaciones: (designaciones.data || []).sort(porFecha).reverse()
    }
  });
}));

/* ------------------------------------------------------------------------------------------------
   POST /api/referees/acreditaciones -> acredita (o renueva) y da acceso al entorno arbitral.
   ---------------------------------------------------------------------------------------------- */
router.post('/acreditaciones', soloAdministracion, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!UUID.test(b.person_id || '')) throw new HttpError(400, 'Seleccione la persona del padrón.');
  if (!MODALIDADES.includes(b.modality)) throw new HttpError(400, 'Seleccione la modalidad.');
  if (!esFecha(b.valid_from) || !esFecha(b.valid_until)) throw new HttpError(400, 'Indique la vigencia (fechas AAAA-MM-DD).');
  if (b.valid_until <= b.valid_from) throw new HttpError(400, 'La fecha de vencimiento debe ser posterior a la de inicio.');
  if (b.valid_until < hoyCR()) throw new HttpError(400, 'La acreditación no puede registrarse ya vencida.');
  if (!UUID.test(b.course_enrollment_id || '')) throw new HttpError(400, 'Seleccione el curso aprobado.');
  if (!EVALUACIONES.includes(b.practical_evaluation) || !EVALUACIONES.includes(b.physical_test)) {
    throw new HttpError(400, 'Indique el resultado de la evaluación práctica y de la prueba física.');
  }
  if (b.practical_evaluation !== 'APROBADA' || b.physical_test !== 'APROBADA') {
    throw new HttpError(400, 'Para acreditar, la evaluación práctica y la prueba física deben estar aprobadas.');
  }
  for (const campo of ['certificate_document_id', 'medical_document_id']) {
    if (b[campo] && !UUID.test(b[campo])) throw new HttpError(400, 'El documento indicado no es válido.');
  }

  const [funcion, nivel, categoria] = await Promise.all([
    valorCatalogo('Tipos de oficial', b.function_code),
    valorCatalogo('Niveles arbitrales', b.level_code),
    b.category_code ? valorCatalogo('Categorías', b.category_code) : Promise.resolve(true)
  ]);
  if (!funcion) throw new HttpError(400, 'Seleccione la función.');
  if (!nivel) throw new HttpError(400, 'Seleccione el nivel.');
  if (!categoria) throw new HttpError(400, 'La categoría indicada no es válida.');

  const { data: id, error } = await supabase.rpc('sp_accredit_referee_v2', {
    p_person_id: b.person_id,
    p_function_code: b.function_code,
    p_level_code: b.level_code,
    p_modality: b.modality,
    p_category_code: b.category_code || null,
    p_valid_from: b.valid_from,
    p_valid_until: b.valid_until,
    p_course_enrollment_id: b.course_enrollment_id,
    p_practical_evaluation: b.practical_evaluation,
    p_physical_test: b.physical_test,
    p_certificate_document_id: b.certificate_document_id || null,
    p_medical_document_id: b.medical_document_id || null,
    p_notes: texto(b.notes, 500) || null,
    p_admin_user: req.currentUser
  });
  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  const acceso = await darAcceso(b.person_id, req.currentUser);
  res.status(201).json({ data: { id }, acceso });
}));

// Da acceso al entorno arbitral: si la persona ya tiene cuenta, el procedimiento de acreditación
// ya le dio el rol; si hay una cuenta con su correo, se vincula; si no, se le envía una invitación.
// Un fallo aquí no deshace la acreditación: se informa para resolverlo desde Usuarios y permisos.
async function darAcceso(personId, adminUser) {
  const { data: persona } = await supabase
    .from('persons')
    .select('id, first_name, last_name, email, user_id')
    .eq('id', personId)
    .maybeSingle();
  if (!persona) return { estado: 'SIN_PERSONA' };
  if (persona.user_id) return { estado: 'YA_TENIA' };
  const correo = typeof persona.email === 'string' ? persona.email.trim().toLowerCase() : '';
  if (!correo) return { estado: 'SIN_CORREO' };

  try {
    const { data: perfil } = await supabase.from('user_profiles').select('id').ilike('email', correo.replace(/[\\%_]/g, '\\$&')).maybeSingle();
    let userId = perfil?.id;
    let estado = 'VINCULADA';

    if (!userId) {
      const nombre = `${persona.first_name} ${persona.last_name}`.trim();
      // El enlace del correo lleva a la pantalla donde se define la contraseña.
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const { data: invitacion, error: errInvitacion } = await supabase.auth.admin.inviteUserByEmail(correo, {
        data: { full_name: nombre },
        redirectTo: `${frontendUrl}/restablecer-contrasena`
      });
      if (errInvitacion || !invitacion?.user?.id) throw new Error(errInvitacion?.message || 'sin usuario');
      userId = invitacion.user.id;
      const { data: rol } = await supabase.from('roles').select('id').eq('name', 'Arbitro').maybeSingle();
      const { error: errPerfil } = await supabase.from('user_profiles').upsert({
        id: userId,
        email: correo,
        full_name: nombre,
        role_id: rol?.id || null,
        organization_id: null,
        status: 'PENDIENTE_CONTRASENA',
        updated_at: new Date().toISOString()
      });
      if (errPerfil) throw new Error(errPerfil.message);
      estado = 'INVITACION_ENVIADA';
    }

    const { error } = await supabase.rpc('sp_link_referee_account', { p_person_id: personId, p_user_id: userId, p_admin_user: adminUser });
    if (error) return { estado: 'NO_VINCULADA', motivo: error.message };

    await supabase.from('audit_logs').insert([{
      usuario: adminUser,
      accion: 'INSERT',
      tabla: 'persons',
      registro_id: personId,
      registro_nuevo: { evento: 'Acceso al entorno del cuerpo arbitral', resultado: estado, correo, timestamp: new Date().toISOString() }
    }]);
    return { estado, correo };
  } catch (e) {
    console.error('[arbitraje] no se pudo dar acceso a la persona acreditada:', e?.message || e);
    return { estado: 'NO_VINCULADA', motivo: 'No fue posible crear o vincular la cuenta. Hágalo desde Usuarios y permisos.' };
  }
}

/* ------------------------------------------------------------------------------------------------
   POST /api/referees/personas/:id/acceso -> da acceso al entorno arbitral a alguien ya acreditado
   (por ejemplo, si al acreditarlo no tenía correo en el padrón).
   ---------------------------------------------------------------------------------------------- */
router.post('/personas/:id/acceso', soloAdministracion, asyncHandler(async (req, res) => {
  const { data: roles } = await supabase
    .from('person_roles')
    .select('role_type, is_active')
    .eq('person_id', req.params.id)
    .eq('role_type', 'ARBITRO')
    .eq('is_active', true);
  if (!roles?.length) throw new HttpError(400, 'Solo se da acceso a personas del cuerpo arbitral. Acredítela primero.');

  const acceso = await darAcceso(req.params.id, req.currentUser);
  if (acceso.estado === 'SIN_PERSONA') throw new HttpError(404, 'Persona no encontrada.');
  res.json({ acceso });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/referees/disponibles?match_id= -> oficiales para designar en un partido, con lo que
   FECOVOL debe revisar: acreditación, otra designación ese día y conflicto de interés.
   ---------------------------------------------------------------------------------------------- */
router.get('/disponibles', soloFecovol, asyncHandler(async (req, res) => {
  const matchId = req.query.match_id;
  if (!UUID.test(matchId || '')) throw new HttpError(400, 'Indique el partido.');

  const { data: partido, error: errPartido } = await supabase
    .from('matches')
    .select(`id, scheduled_date, scheduled_time, status,
      local:teams!matches_home_team_id_fkey(id, name, association_id),
      visitante:teams!matches_away_team_id_fkey(id, name, association_id)`)
    .eq('id', matchId)
    .maybeSingle();
  if (errPartido) throw fromSupabase(errPartido);
  if (!partido) throw new HttpError(404, 'Partido no encontrado.');

  const [cuerpo, mismoDia] = await Promise.all([
    supabase.from('v_cuerpo_arbitral').select(COLUMNAS_CUERPO + ', persona_status').eq('persona_status', 'ACTIVA').order('last_name').limit(1000),
    supabase
      .from('referee_assignments')
      .select('person_id, match_id, status, partido:matches!fk_referee_assignments_match!inner(scheduled_date, scheduled_time)')
      .eq('partido.scheduled_date', partido.scheduled_date)
      .in('status', DESIGNACION_VIGENTE)
  ]);
  for (const r of [cuerpo, mismoDia]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }

  const fecha = partido.scheduled_date;
  const asociaciones = [partido.local?.association_id, partido.visitante?.association_id].filter(Boolean);
  const data = (cuerpo.data || []).map(({ persona_status, ...o }) => {
    const suyas = (mismoDia.data || []).filter((d) => d.person_id === o.person_id);
    const enEste = suyas.some((d) => d.match_id === partido.id);
    const otras = suyas.filter((d) => d.match_id !== partido.id);
    const mismaHora = otras.some((d) => d.partido?.scheduled_time === partido.scheduled_time);
    const vigente = o.accreditation_id && o.valid_from <= fecha && o.valid_until >= fecha;

    let bloqueo = null;
    if (!o.accreditation_id) bloqueo = 'Sin acreditación';
    else if (!vigente) bloqueo = o.valid_until < fecha ? 'Acreditación vencida para esa fecha' : 'Acreditación aún no vigente';
    else if (mismaHora) bloqueo = 'Designada en otro partido a la misma hora';

    const avisos = [];
    if (otras.length && !mismaHora) avisos.push('Ya designada ese día');
    if (o.estado === 'POR_VENCER') avisos.push('Acreditación por vencer');
    const conflicto = Boolean(o.association_id && asociaciones.includes(o.association_id));
    if (conflicto) avisos.push('Pertenece a la asociación de un equipo del partido');

    return { ...o, en_este_partido: enEste, bloqueo, avisos, conflicto_interes: conflicto };
  });

  const orden = (x) => (x.en_este_partido ? 3 : x.bloqueo ? 2 : x.avisos.length ? 1 : 0);
  data.sort((a, b) => orden(a) - orden(b) || a.last_name.localeCompare(b.last_name, 'es'));
  res.json({ data, partido: { id: partido.id, scheduled_date: fecha, scheduled_time: partido.scheduled_time } });
}));

/* ------------------------------------------------------------------------------------------------
   Cursos
   ---------------------------------------------------------------------------------------------- */
router.get('/cursos', soloFecovol, asyncHandler(async (req, res) => {
  let query = supabase
    .from('referee_courses')
    .select(`${SELECT_CURSO}, inscritos:referee_course_enrollments(count)`)
    .order('start_date', { ascending: false })
    .limit(200);
  if (req.query.estado) {
    if (!['PUBLICADO', 'CERRADO', 'CANCELADO'].includes(req.query.estado)) throw new HttpError(400, 'Estado de curso no válido.');
    query = query.eq('status', req.query.estado);
  }
  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;
  res.json({ data: data.map(({ inscritos, ...c }) => ({ ...c, inscritos: inscritos?.[0]?.count ?? 0 })) });
}));

router.get('/cursos/:id', soloFecovol, asyncHandler(async (req, res) => {
  const [curso, inscripciones] = await Promise.all([
    supabase.from('referee_courses').select(SELECT_CURSO).eq('id', req.params.id).maybeSingle(),
    supabase
      .from('referee_course_enrollments')
      .select('id, grade, result, created_at, persona:persons!referee_course_enrollments_person_id_fkey(id, first_name, last_name, document_number)')
      .eq('course_id', req.params.id)
      .order('created_at')
  ]);
  for (const r of [curso, inscripciones]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }
  if (!curso.data) throw new HttpError(404, 'Curso no encontrado.');
  res.json({ data: { ...curso.data, inscripciones: inscripciones.data || [] } });
}));

router.post('/cursos', soloAdministracion, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const nombre = texto(b.name, 150);
  if (nombre.length < 5) throw new HttpError(400, 'Escriba el nombre del curso (al menos 5 caracteres).');
  if (!TIPOS_CURSO.includes(b.course_type)) throw new HttpError(400, 'Seleccione el tipo de curso.');
  if (!FORMATOS_CURSO.includes(b.format)) throw new HttpError(400, 'Seleccione el formato.');
  if (!esFecha(b.start_date) || !esFecha(b.end_date)) throw new HttpError(400, 'Indique las fechas de inicio y cierre (AAAA-MM-DD).');
  if (b.end_date < b.start_date) throw new HttpError(400, 'La fecha de cierre no puede ser anterior a la de inicio.');
  for (const campo of ['enrollment_opens', 'enrollment_closes']) {
    if (b[campo] && !esFecha(b[campo])) throw new HttpError(400, 'Las fechas de inscripción no son válidas (AAAA-MM-DD).');
  }
  if (b.enrollment_opens && b.enrollment_closes && b.enrollment_closes < b.enrollment_opens) {
    throw new HttpError(400, 'La inscripción no puede cerrar antes de abrir.');
  }
  if (b.enrollment_closes && b.enrollment_closes > b.end_date) {
    throw new HttpError(400, 'La inscripción debe cerrar a más tardar el último día del curso.');
  }
  const cupo = b.capacity === undefined || b.capacity === null || b.capacity === '' ? null : Number(b.capacity);
  if (cupo !== null && (!Number.isInteger(cupo) || cupo < 1 || cupo > 1000)) throw new HttpError(400, 'El cupo debe ser un número entero entre 1 y 1000.');
  const nota = b.passing_grade === undefined || b.passing_grade === '' ? 70 : Number(b.passing_grade);
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw new HttpError(400, 'La nota mínima debe estar entre 0 y 100.');
  if (b.instructor_person_id && !UUID.test(b.instructor_person_id)) throw new HttpError(400, 'El instructor indicado no es válido.');
  if (b.modality_code && !(await valorCatalogo('Modalidades', b.modality_code))) throw new HttpError(400, 'La modalidad indicada no es válida.');

  const { data: id, error } = await supabase.rpc('sp_create_referee_course', {
    p_name: nombre,
    p_course_type: b.course_type,
    p_modality_code: b.modality_code || null,
    p_format: b.format,
    p_start_date: b.start_date,
    p_end_date: b.end_date,
    p_venue: texto(b.venue, 150) || null,
    p_capacity: cupo,
    p_instructor_person_id: b.instructor_person_id || null,
    p_passing_grade: nota,
    p_content: texto(b.content, 2000) || null,
    p_enrollment_opens: b.enrollment_opens || null,
    p_enrollment_closes: b.enrollment_closes || null,
    p_enrollment_open: b.enrollment_open !== false,
    p_only_current_accreditation: b.only_current_accreditation === true,
    p_admin_user: req.currentUser
  });
  const err = fromSupabase(error, 'Curso');
  if (err) throw err;

  const { data } = await supabase.from('referee_courses').select(SELECT_CURSO).eq('id', id).maybeSingle();
  res.status(201).json({ data: data || { id } });
}));

router.patch('/cursos/:id', soloAdministracion, asyncHandler(async (req, res) => {
  const estado = req.body?.status;
  if (!['PUBLICADO', 'CERRADO', 'CANCELADO'].includes(estado)) throw new HttpError(400, 'Estado de curso no válido.');
  const { error } = await supabase.rpc('sp_set_referee_course_status', { p_course_id: req.params.id, p_status: estado, p_admin_user: req.currentUser });
  const err = fromSupabase(error, 'Curso');
  if (err) throw err;
  res.json({ data: { id: req.params.id, status: estado } });
}));

router.post('/cursos/:id/inscripciones', soloAdministracion, asyncHandler(async (req, res) => {
  const personId = req.body?.person_id;
  if (!UUID.test(personId || '')) throw new HttpError(400, 'Seleccione la persona.');

  // Los cursos (incluida la formación inicial) son para quien tiene el rol de árbitro en el padrón.
  const { data: rol, error: errorRol } = await supabase
    .from('person_roles')
    .select('id')
    .eq('person_id', personId)
    .eq('role_type', 'ARBITRO')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  const errRol = fromSupabase(errorRol, 'Persona');
  if (errRol) throw errRol;
  if (!rol) throw new HttpError(409, 'La persona no tiene el rol de árbitro en el padrón. Asígnelo en Personas federadas antes de inscribirla.');

  const { data: id, error } = await supabase.rpc('sp_enroll_referee_course', {
    p_course_id: req.params.id,
    p_person_id: personId,
    p_por_fecovol: true,
    p_admin_user: req.currentUser
  });
  const err = fromSupabase(error, 'Curso');
  if (err) throw err;
  res.status(201).json({ data: { id } });
}));

router.patch('/cursos/:id/inscripciones/:inscripcionId', soloAdministracion, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const ausente = b.ausente === true;
  const nota = ausente ? null : Number(b.grade);
  if (!ausente && (b.grade === undefined || b.grade === null || b.grade === '' || !Number.isFinite(nota) || nota < 0 || nota > 100)) {
    throw new HttpError(400, 'La nota debe estar entre 0 y 100.');
  }

  // La inscripción tiene que ser de este curso (no se califica otra por la URL).
  const { data: inscripcion } = await supabase
    .from('referee_course_enrollments')
    .select('id, course_id')
    .eq('id', req.params.inscripcionId)
    .maybeSingle();
  if (!inscripcion || inscripcion.course_id !== req.params.id) throw new HttpError(404, 'Inscripción no encontrada en este curso.');

  const { error } = await supabase.rpc('sp_grade_referee_enrollment', {
    p_enrollment_id: inscripcion.id,
    p_grade: nota,
    p_absent: ausente,
    p_admin_user: req.currentUser
  });
  const err = fromSupabase(error, 'Inscripción');
  if (err) throw err;
  res.json({ data: { id: inscripcion.id } });
}));

module.exports = router;
