const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { exigirFechaFutura } = require('../utils/fechasPartido');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { getMatchValidationChecklist } = require('../utils/validationChecklist');
const { detectarTipo } = require('../utils/archivos');
const reglasSanciones = require('../utils/sanciones');
const { hoyCR } = require('../utils/arbitraje');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('requestId', validateUuidParams);
router.param('evidenceId', validateUuidParams);

const SELECT_MATCH = `
  id, competition_id, match_number, matchday, venue_id, scheduled_date, scheduled_time,
  status, home_sets_won, away_sets_won, acta_status, validated_by, validated_at,
  result_type, resolution_notes,
  sede:catalog_values!fk_matches_venue(id, code, value),
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name),
  ganador:teams!matches_winner_team_id_fkey(id, name),
  arbitraje:referee_assignments!fk_referee_assignments_match(
    id, status, notes,
    arbitro:persons!referee_assignments_person_id_fkey(first_name, last_name),
    puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value)
  )
`;

const requireAuth = (req, res, next) => {
  if (req.userScope?.isPublic) return next(new HttpError(401, 'Se requiere autenticación.'));
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.userScope?.isAdmin) return next(new HttpError(403, 'Solo el personal de FECOVOL puede realizar esta acción.'));
  next();
};

// Mapa de resultados especiales y su efecto en sets y ganador. Fija el marcador para
// que la tabla de posiciones lo refleje aunque no existan sets cargados.
const RESULTADOS_ESPECIALES = {
  NO_PRESENTADO_LOCAL:          { ganaLocal: false, home_sets: 0, away_sets: 3 },
  NO_PRESENTADO_VISITANTE:      { ganaLocal: true,  home_sets: 3, away_sets: 0 },
  GANADO_POR_DEFECTO_LOCAL:     { ganaLocal: true,  home_sets: 3, away_sets: 0 },
  GANADO_POR_DEFECTO_VISITANTE: { ganaLocal: false, home_sets: 0, away_sets: 3 },
  SUSPENDIDO_DEFINITIVO:        { ganaLocal: null,  home_sets: null, away_sets: null }
};

// Configura multer en memoria para subir el buffer directo a Supabase Storage.
// Limita el tamaño a 10 MB y acepta solo PDF, JPG y PNG (coincide con la ERS).
const uploadEvidencia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const permitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!permitidos.includes(file.mimetype)) {
      return cb(new HttpError(400, 'Solo se aceptan archivos PDF, JPG o PNG.'));
    }
    cb(null, true);
  }
});

// Envuelve el middleware de multer para convertir los errores al formato HttpError.
const uploadEvidenciaMiddleware = (req, res, next) => {
  uploadEvidencia.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(400, 'El archivo supera el límite de 10 MB.'));
      }
      return next(new HttpError(400, `Error al subir el archivo: ${err.message}`));
    }
    if (err) return next(err);
    next();
  });
};

// Verifica que un venue_id pertenezca al catálogo "Sedes". Devuelve el id validado o null.
async function validarSede(venueId) {
  if (venueId === undefined || venueId === null || venueId === '') return null;
  const { data } = await supabase
    .from('catalog_values')
    .select('id, catalogs!inner(name)')
    .eq('id', venueId)
    .eq('catalogs.name', 'Sedes')
    .maybeSingle();
  if (!data) {
    throw new HttpError(400, 'La sede seleccionada no es válida o no pertenece al catálogo de sedes.');
  }
  return data.id;
}

// Devuelve el nombre legible de una sede (para guardarlo como snapshot histórico).
async function obtenerNombreSede(venueId) {
  if (!venueId) return null;
  const { data } = await supabase
    .from('catalog_values')
    .select('value')
    .eq('id', venueId)
    .maybeSingle();
  return data?.value || null;
}

// Verifica la inscripción de un equipo en la competencia. Devuelve el registro de competition_teams.
async function obtenerInscripcionValida(competition_id, team_id) {
  const { data } = await supabase
    .from('competition_teams')
    .select('team_id, status')
    .eq('competition_id', competition_id)
    .eq('team_id', team_id)
    .maybeSingle();
  return data;
}

// ==========================================
//    LISTADO Y CREACIÓN DE PARTIDOS
// ==========================================

router.get('/', asyncHandler(async (req, res) => {
  const { competition_id, matchday, team_id, status } = req.query;
  let query = supabase.from('matches').select(SELECT_MATCH).order('scheduled_date').order('scheduled_time');
  if (competition_id) query = query.eq('competition_id', competition_id);
  if (matchday) query = query.eq('matchday', matchday);
  if (status) query = query.eq('status', status);
  if (team_id) query = query.or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`);

  const { data, error } = await query;
  if (error) throw fromSupabase(error);
  res.json({ data });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { competition_id, match_number, matchday, home_team_id, away_team_id, scheduled_date, scheduled_time, venue_id } = req.body;

  if (!competition_id || !match_number || !matchday || !home_team_id || !away_team_id || !scheduled_date || !scheduled_time) {
    throw new HttpError(400, 'Faltan datos obligatorios para programar el partido.');
  }

  if (home_team_id === away_team_id) throw new HttpError(400, 'Un equipo no puede jugar contra sí mismo.');
  exigirFechaFutura(scheduled_date, scheduled_time);

  // Verifica la inscripción de ambos equipos en la competencia
  const [local, visitante] = await Promise.all([
    obtenerInscripcionValida(competition_id, home_team_id),
    obtenerInscripcionValida(competition_id, away_team_id)
  ]);

  if (!local) throw new HttpError(400, 'El equipo local no está inscrito en esta competencia.');
  if (!visitante) throw new HttpError(400, 'El equipo visitante no está inscrito en esta competencia.');
  if (local.status !== 'INSCRITO') {
    throw new HttpError(400, `El equipo local no tiene estado INSCRITO (estado actual: ${local.status}).`);
  }
  if (visitante.status !== 'INSCRITO') {
    throw new HttpError(400, `El equipo visitante no tiene estado INSCRITO (estado actual: ${visitante.status}).`);
  }

  // Valida la sede contra el catálogo
  const sedeValida = await validarSede(venue_id);

  // Valida que ninguno de los dos equipos tenga otro partido a la misma fecha y hora
  const { data: choque } = await supabase
    .from('matches')
    .select('id')
    .eq('scheduled_date', scheduled_date)
    .eq('scheduled_time', scheduled_time)
    .neq('status', 'CANCELADO')
    .or(`home_team_id.eq.${home_team_id},away_team_id.eq.${home_team_id},home_team_id.eq.${away_team_id},away_team_id.eq.${away_team_id}`)
    .maybeSingle();

  if (choque) throw new HttpError(400, 'Uno de los equipos ya tiene un partido programado en esta misma fecha y hora.');

  const { data: id, error } = await supabase.rpc('sp_schedule_match', {
    p_competition_id: competition_id,
    p_match_number: match_number,
    p_matchday: matchday,
    p_home_team_id: home_team_id,
    p_away_team_id: away_team_id,
    p_scheduled_date: scheduled_date,
    p_scheduled_time: scheduled_time,
    p_admin_user: req.currentUser,
    p_venue: null,
    p_venue_id: sedeValida
  });

  if (error) throw fromSupabase(error);

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', id).single();
  res.status(201).json({ data });
}));

// ==========================================
//    SOLICITUDES DE REPROGRAMACIÓN
// ==========================================

router.get('/reschedule-requests', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { competition_id } = req.query;

  let matchIdsFilter = null;
  if (competition_id) {
    const { data: matches } = await supabase.from('matches').select('id').eq('competition_id', competition_id);
    matchIdsFilter = (matches || []).map(m => m.id);
    if (matchIdsFilter.length === 0) return res.json({ data: [] });
  }

  let query = supabase
    .from('match_reschedulings')
    .select(`
      id, match_id, previous_date, previous_time, previous_venue, previous_venue_id,
      new_date, new_time, new_venue, new_venue_id,
      reason, status, requested_by, approved_by, approved_at, rejection_reason, created_at,
      partido:matches!match_reschedulings_match_id_fkey(
        id, match_number, matchday,
        local:teams!matches_home_team_id_fkey(name),
        visitante:teams!matches_away_team_id_fkey(name)
      )
    `)
    .eq('status', 'PENDIENTE')
    .order('created_at', { ascending: false });

  if (matchIdsFilter) query = query.in('match_id', matchIdsFilter);

  const { data, error } = await query;
  if (error) throw fromSupabase(error);
  res.json({ data: data || [] });
}));

router.patch('/reschedule-requests/:requestId/approve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data: request } = await supabase
    .from('match_reschedulings')
    .select('*')
    .eq('id', req.params.requestId)
    .eq('status', 'PENDIENTE')
    .single();

  if (!request) throw new HttpError(404, 'Solicitud no encontrada o ya fue procesada.');

  // Recupera el partido para validar estado y conflictos de horario
  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', request.match_id)
    .single();

  if (!match) throw new HttpError(404, 'Partido no encontrado.');

  if (match.status === 'FINALIZADO') {
    throw new HttpError(400, 'No se puede reprogramar un partido ya finalizado. Anula el resultado primero.');
  }
  // La solicitud pudo quedar pendiente hasta después de la fecha pedida.
  exigirFechaFutura(request.new_date, request.new_time, 'La fecha solicitada ya pasó: el partido');

  // Valida que ninguno de los dos equipos tenga otro partido en la nueva fecha y hora
  const { data: conflicts } = await supabase
    .from('matches')
    .select('id')
    .neq('id', request.match_id)
    .eq('scheduled_date', request.new_date)
    .eq('scheduled_time', request.new_time)
    .neq('status', 'CANCELADO')
    .or(`home_team_id.eq.${match.home_team_id},away_team_id.eq.${match.home_team_id},home_team_id.eq.${match.away_team_id},away_team_id.eq.${match.away_team_id}`);

  if (conflicts && conflicts.length > 0) {
    throw new HttpError(400, 'Uno de los equipos ya tiene un partido programado en la nueva fecha y hora.');
  }

  await supabase
    .from('match_reschedulings')
    .update({ status: 'APROBADA', approved_by: req.currentUser, approved_at: new Date().toISOString() })
    .eq('id', req.params.requestId);

  // Aplica el cambio al partido. new_venue_id puede ser UUID, null o venir ausente.
  const updateData = {
    scheduled_date: request.new_date,
    scheduled_time: request.new_time,
    status: 'REPROGRAMADO',
    updated_at: new Date().toISOString()
  };

  if (request.new_venue_id !== undefined && request.new_venue_id !== null) {
    updateData.venue_id = request.new_venue_id;
  } else if (request.new_venue_id === null) {
    updateData.venue_id = null;
  } else {
    updateData.venue_id = match.venue_id;
  }

  const { error: errMatch } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', request.match_id);

  if (errMatch) throw fromSupabase(errMatch);

  res.json({ data: { id: req.params.requestId, status: 'APROBADA' } });
}));

router.patch('/reschedule-requests/:requestId/reject', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { rejection_reason } = req.body;

  const { data: request } = await supabase
    .from('match_reschedulings')
    .select('id')
    .eq('id', req.params.requestId)
    .eq('status', 'PENDIENTE')
    .single();

  if (!request) throw new HttpError(404, 'Solicitud no encontrada o ya fue procesada.');

  const { error } = await supabase
    .from('match_reschedulings')
    .update({
      status: 'RECHAZADA',
      rejection_reason: rejection_reason || 'Sin motivo especificado',
      approved_by: req.currentUser,
      approved_at: new Date().toISOString()
    })
    .eq('id', req.params.requestId);

  if (error) throw fromSupabase(error);
  res.json({ data: { id: req.params.requestId, status: 'RECHAZADA' } });
}));

// ==========================================
//    DETALLE DE PARTIDO Y REPROGRAMACIÓN DIRECTA
// ==========================================

router.get('/:id', asyncHandler(async (req, res) => {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select(SELECT_MATCH)
    .eq('id', req.params.id)
    .single();

  if (matchError) throw fromSupabase(matchError, 'Partido');

  const { data: sets, error: setsError } = await supabase
    .from('match_sets')
    .select('id, set_number, home_points, away_points')
    .eq('match_id', req.params.id)
    .order('set_number');

  if (setsError) throw fromSupabase(setsError);

  res.json({ data: { ...match, sets: sets || [] } });
}));

router.patch('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { status, scheduled_date, scheduled_time, venue_id, reason } = req.body;

  const { data: actual } = await supabase.from('matches').select('*').eq('id', req.params.id).single();
  if (!actual) throw new HttpError(404, 'Partido no encontrado.');

  if (actual.status === 'FINALIZADO' && (scheduled_date || scheduled_time)) {
    throw new HttpError(400, 'No se puede reprogramar un partido que ya fue finalizado.');
  }

  const venueIdFinal = venue_id === undefined ? actual.venue_id : (venue_id === '' ? null : venue_id);
  const sedeValida = venue_id === undefined ? undefined : await validarSede(venueIdFinal);
  const huboSede = venue_id !== undefined && venueIdFinal !== actual.venue_id;

  const isReschedule =
    (scheduled_date && scheduled_date !== actual.scheduled_date) ||
    (scheduled_time && scheduled_time !== actual.scheduled_time) ||
    huboSede;

  if (isReschedule) {
    // Valida conflicto con otros partidos de los mismos equipos
    const newDate = scheduled_date || actual.scheduled_date;
    const newTime = scheduled_time || actual.scheduled_time;
    // Solo se exige un momento futuro cuando cambia la fecha o la hora (cambiar la sede de un
    // partido ya jugado no lo mueve en el tiempo).
    if ((scheduled_date && scheduled_date !== actual.scheduled_date) || (scheduled_time && scheduled_time !== actual.scheduled_time)) {
      exigirFechaFutura(newDate, newTime);
    }

    const { data: conflicts } = await supabase
      .from('matches')
      .select('id')
      .neq('id', req.params.id)
      .eq('scheduled_date', newDate)
      .eq('scheduled_time', newTime)
      .neq('status', 'CANCELADO')
      .or(`home_team_id.eq.${actual.home_team_id},away_team_id.eq.${actual.home_team_id},home_team_id.eq.${actual.away_team_id},away_team_id.eq.${actual.away_team_id}`);

    if (conflicts && conflicts.length > 0) {
      throw new HttpError(400, 'Uno de los equipos ya tiene un partido programado en la nueva fecha y hora.');
    }

    const previousSedeName = await obtenerNombreSede(actual.venue_id);
    const newSedeName = await obtenerNombreSede(sedeValida);

    await supabase.from('match_reschedulings').insert({
      match_id: req.params.id,
      previous_date: actual.scheduled_date,
      previous_time: actual.scheduled_time,
      previous_venue: previousSedeName,
      previous_venue_id: actual.venue_id,
      new_date: newDate,
      new_time: newTime,
      new_venue: newSedeName,
      new_venue_id: sedeValida,
      reason: reason || 'Reprogramación directa por FECOVOL',
      rescheduled_by: req.currentUser,
      status: 'APROBADA',
      requested_by: req.currentUser,
      approved_by: req.currentUser,
      approved_at: new Date().toISOString()
    });
  }

  const updateData = { updated_at: new Date().toISOString() };
  if (status) updateData.status = status;
  if (scheduled_date) updateData.scheduled_date = scheduled_date;
  if (scheduled_time) updateData.scheduled_time = scheduled_time;
  if (venue_id !== undefined) updateData.venue_id = sedeValida;

  const { error: errUpdate } = await supabase.from('matches').update(updateData).eq('id', req.params.id);
  if (errUpdate) throw fromSupabase(errUpdate);

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data });
}));

router.post('/:id/reschedule-request', requireAuth, asyncHandler(async (req, res) => {
  const { scheduled_date, scheduled_time, venue_id, reason } = req.body;

  if (!scheduled_date || !scheduled_time || !reason) {
    throw new HttpError(400, 'scheduled_date, scheduled_time y reason son obligatorios.');
  }

  const { data: actual } = await supabase.from('matches').select('*').eq('id', req.params.id).single();
  if (!actual) throw new HttpError(404, 'Partido no encontrado.');

  if (actual.status === 'FINALIZADO') {
    throw new HttpError(400, 'No se puede solicitar reprogramación de un partido ya finalizado.');
  }
  exigirFechaFutura(scheduled_date, scheduled_time, 'La nueva fecha');

  // Interpreta venue_id: undefined = sin cambio, null = quitar sede, UUID = cambiar
  const venueFinal = venue_id === undefined ? actual.venue_id : (venue_id === '' ? null : venue_id);
  const sedeValida = venue_id === undefined ? undefined : await validarSede(venueFinal);

  const previousSedeName = await obtenerNombreSede(actual.venue_id);
  const newSedeName = await obtenerNombreSede(sedeValida);

  const { data, error } = await supabase
    .from('match_reschedulings')
    .insert({
      match_id: req.params.id,
      previous_date: actual.scheduled_date,
      previous_time: actual.scheduled_time,
      previous_venue: previousSedeName,
      previous_venue_id: actual.venue_id,
      new_date: scheduled_date,
      new_time: scheduled_time,
      new_venue: newSedeName,
      new_venue_id: sedeValida !== undefined ? sedeValida : actual.venue_id,
      reason,
      rescheduled_by: req.currentUser,
      requested_by: req.currentUser,
      status: 'PENDIENTE'
    })
    .select()
    .single();

  if (error) throw fromSupabase(error);
  res.status(201).json({ data });
}));

// ==========================================
//    EVIDENCIAS DEL PARTIDO
// ==========================================

// Sube un archivo al bucket privado "evidence" y lo registra en match_evidence.
// Guarda el path relativo en file_url y genera la signed URL para responder.
// Solo FECOVOL adjunta evidencias desde aquí; el cuerpo arbitral usa /api/referees/me/partidos.
router.post('/:id/evidence', requireAuth, requireAdmin, uploadEvidenciaMiddleware, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Debes adjuntar un archivo.');
  // El tipo se decide por el contenido, no por el Content-Type que manda el navegador.
  const tipoReal = detectarTipo(req.file.buffer);
  if (!tipoReal) throw new HttpError(400, 'El contenido del archivo no es PDF, JPG ni PNG.');

  const { file_type, description } = req.body;

  const { data: match } = await supabase.from('matches').select('id').eq('id', req.params.id).single();
  if (!match) throw new HttpError(404, 'Partido no encontrado.');

  // Sanea el nombre original para usarlo en el path del storage
  const nombreOriginal = req.file.originalname || 'archivo';
  const nombreSeguro = nombreOriginal.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `matches/${req.params.id}/${crypto.randomUUID()}_${nombreSeguro}`;

  // Sube al bucket privado con service_role (omite RLS del storage)
  const { error: errUp } = await supabase
    .storage
    .from('evidence')
    .upload(path, req.file.buffer, {
      contentType: tipoReal.mime,
      upsert: false
    });

  if (errUp) throw new HttpError(500, `No se pudo subir la evidencia: ${errUp.message}`);

  // Guarda el path relativo (la URL firmada se genera al leer)
  const { data, error } = await supabase
    .from('match_evidence')
    .insert({
      match_id: req.params.id,
      file_url: path,
      file_name: nombreOriginal,
      file_type: file_type || 'OTRO',
      description: description || null,
      uploaded_by: req.currentUser
    })
    .select()
    .single();

  if (error) {
    // Si el INSERT falla, borra el archivo subido para no dejar huérfanos
    await supabase.storage.from('evidence').remove([path]).catch(() => {});
    throw fromSupabase(error);
  }

  // Devuelve la evidencia con la signed URL ya generada
  const { data: signed } = await supabase
    .storage
    .from('evidence')
    .createSignedUrl(path, 3600);

  res.status(201).json({ data: { ...data, signed_url: signed?.signedUrl || null } });
}));

// Lista las evidencias del partido y genera signed URLs para las que están en el bucket.
// Los registros antiguos con URL externa se devuelven tal cual.
router.get('/:id/evidence', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('match_evidence')
    .select('*')
    .eq('match_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) throw fromSupabase(error);

  const conUrls = await Promise.all((data || []).map(async (ev) => {
    // Si ya es una URL externa, se usa directamente
    if (ev.file_url && ev.file_url.startsWith('http')) {
      return { ...ev, signed_url: ev.file_url };
    }
    // Si es un path del bucket privado, genera signed URL temporal
    const { data: signed } = await supabase
      .storage
      .from('evidence')
      .createSignedUrl(ev.file_url, 3600);
    return { ...ev, signed_url: signed?.signedUrl || null };
  }));

  res.json({ data: conUrls });
}));

// Borra la evidencia del storage (si es un path interno) y de la base de datos.
router.delete('/:id/evidence/:evidenceId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data: evidencia } = await supabase
    .from('match_evidence')
    .select('id, file_url')
    .eq('id', req.params.evidenceId)
    .eq('match_id', req.params.id)
    .maybeSingle();

  if (!evidencia) throw new HttpError(404, 'Evidencia no encontrada.');

  // Borra del storage solo si es un path interno (no URL externa)
  if (evidencia.file_url && !evidencia.file_url.startsWith('http')) {
    await supabase.storage.from('evidence').remove([evidencia.file_url]);
  }

  const { error } = await supabase
    .from('match_evidence')
    .delete()
    .eq('id', req.params.evidenceId)
    .eq('match_id', req.params.id);

  if (error) throw fromSupabase(error);
  res.json({ data: { id: req.params.evidenceId, deleted: true } });
}));

// ==========================================
//    CHECKLIST Y RESULTADO
// ==========================================

// GET /api/matches/:id/incidents -> expedientes disciplinarios del partido (resumen para la pantalla
// de registro de resultados). Los gestiona la Administración en Incidentes y sanciones; aquí solo
// se listan, sin cédulas ni hechos.
router.get('/:id/incidents', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('disciplinary_cases')
    .select(`id, case_number, title, status, created_at,
      tipo:catalog_values!disciplinary_cases_incident_type_value_id_fkey(value),
      sanctions(status, end_date)`)
    .eq('match_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) throw fromSupabase(error);
  const hoy = hoyCR();
  res.set('Cache-Control', 'no-store');
  res.json({
    data: (data || []).map((c) => ({
      id: c.id,
      numero: c.case_number,
      titulo: c.title,
      tipo: c.tipo?.value || null,
      estado: reglasSanciones.estadoVisible(c, hoy),
      sanciones_vigentes: (c.sanctions || []).filter((s) => reglasSanciones.sancionVigente(s, hoy)).length
    }))
  });
}));

router.get('/:id/validation-checklist', requireAuth, asyncHandler(async (req, res) => {
  const checklist = await getMatchValidationChecklist(req.params.id);
  if (!checklist) throw new HttpError(404, 'Partido no encontrado.');
  res.json({ data: checklist });
}));

router.post('/:id/sets', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { sets, correction_reason } = req.body;

  // Valida la estructura básica del arreglo de sets
  if (!sets || !Array.isArray(sets) || sets.length === 0) {
    throw new HttpError(400, 'Debes enviar un arreglo con al menos un set jugado.');
  }

  if (sets.length > 5) {
    throw new HttpError(400, 'Un partido no puede tener más de 5 sets.');
  }

  // Recupera el estado actual y el tipo de resultado del partido
  const { data: match } = await supabase
    .from('matches')
    .select('status, result_type')
    .eq('id', req.params.id)
    .single();

  if (!match) throw new HttpError(404, 'Partido no encontrado.');

  // Bloquea sets cuando hay un resultado especial activo. Debes revertirlo primero.
  if (match.result_type && match.result_type !== 'NORMAL') {
    throw new HttpError(400, 'El partido tiene un resultado especial activo. Reviértelo antes de registrar sets.');
  }

  // Exige motivo cuando el resultado ya está finalizado
  if (match.status === 'FINALIZADO' && (!correction_reason || !String(correction_reason).trim())) {
    throw new HttpError(400, 'El partido ya está finalizado. Debes enviar un motivo de corrección para modificar el resultado.');
  }

  const numerosUsados = new Set();

  for (const s of sets) {
    // Valida el número de set (1 a 5)
    if (!Number.isInteger(s.set_number) || s.set_number < 1 || s.set_number > 5) {
      throw new HttpError(400, `El número de set debe ser un entero entre 1 y 5 (recibido: ${s.set_number}).`);
    }

    // Valida que el número de set no esté duplicado
    if (numerosUsados.has(s.set_number)) {
      throw new HttpError(400, `El set ${s.set_number} está duplicado.`);
    }
    numerosUsados.add(s.set_number);

    // Valida que los puntos sean enteros no negativos
    if (!Number.isInteger(s.home_points) || !Number.isInteger(s.away_points)) {
      throw new HttpError(400, `Los puntos del set ${s.set_number} deben ser números enteros.`);
    }
    if (s.home_points < 0 || s.away_points < 0) {
      throw new HttpError(400, `Los puntos del set ${s.set_number} no pueden ser negativos.`);
    }

    // Valida que el set no termine en empate
    if (s.home_points === s.away_points) {
      throw new HttpError(400, `El set ${s.set_number} no puede terminar en empate (${s.home_points}-${s.away_points}).`);
    }
  }

  await supabase.from('match_sets').delete().eq('match_id', req.params.id);

  const setsToInsert = sets.map(s => ({
    match_id: req.params.id,
    set_number: s.set_number,
    home_points: s.home_points,
    away_points: s.away_points
  }));

  const { error } = await supabase.from('match_sets').insert(setsToInsert);
  if (error) throw fromSupabase(error);

  // Registra la corrección en la bitácora cuando se modificó un resultado ya finalizado
  if (match.status === 'FINALIZADO' && correction_reason) {
    try {
      await supabase.from('audit_logs').insert([{
        usuario: req.currentUser,
        accion: 'CORRECCION_RESULTADO',
        tabla: 'match_sets',
        registro_id: req.params.id,
        registro_nuevo: {
          evento: 'Corrección de resultado de partido finalizado',
          motivo: String(correction_reason).trim(),
          sets: setsToInsert,
          timestamp: new Date().toISOString()
        }
      }]);
    } catch (errAudit) {
      console.warn('Aviso: no se pudo registrar la corrección en la bitácora:', errAudit.message);
    }
  }

  res.status(201).json({ data: setsToInsert, correction_applied: match.status === 'FINALIZADO' });
}));

router.post('/:id/finish', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  // Bloquea finish cuando hay un resultado especial activo
  const { data: matchCheck } = await supabase
    .from('matches')
    .select('result_type')
    .eq('id', req.params.id)
    .single();

  if (!matchCheck) throw new HttpError(404, 'Partido no encontrado.');

  if (matchCheck.result_type && matchCheck.result_type !== 'NORMAL') {
    throw new HttpError(400, 'El partido tiene un resultado especial activo. Reviértelo antes de validar por sets.');
  }

  const checklist = await getMatchValidationChecklist(req.params.id);
  if (!checklist) throw new HttpError(404, 'Partido no encontrado.');

  const failures = checklist.filter(i => !i.warning && !i.passed);
  if (failures.length > 0) {
    throw new HttpError(400, 'No se puede validar el resultado: ' + failures.map(f => f.message).join(' '));
  }

  const { error } = await supabase.rpc('sp_record_match_result', {
    p_match_id: req.params.id,
    p_admin_user: req.currentUser
  });

  if (error) throw fromSupabase(error);

  await supabase.from('matches').update({
    acta_status: 'VALIDADA',
    validated_by: req.currentUser,
    validated_at: new Date().toISOString()
  }).eq('id', req.params.id);

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data, checklist });
}));

// ==========================================
//    RESULTADOS ESPECIALES
// ==========================================

// Registra un resultado especial (no presentado, ganado por defecto o suspendido definitivo).
// Fija el marcador según el tipo para que la tabla de posiciones lo refleje.
router.post('/:id/special-result', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { result_type, resolution_notes } = req.body;

  if (!result_type || !RESULTADOS_ESPECIALES[result_type]) {
    throw new HttpError(400, 'Debes indicar un result_type válido para el resultado especial.');
  }

  if (!resolution_notes || !String(resolution_notes).trim()) {
    throw new HttpError(400, 'Debes indicar la resolución o motivo del resultado especial.');
  }

  const { data: match } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, status, result_type')
    .eq('id', req.params.id)
    .single();

  if (!match) throw new HttpError(404, 'Partido no encontrado.');

  const config = RESULTADOS_ESPECIALES[result_type];
  const winnerId =
    config.ganaLocal === true  ? match.home_team_id :
    config.ganaLocal === false ? match.away_team_id : null;

  // Descarta los sets previos porque el resultado especial los reemplaza
  await supabase.from('match_sets').delete().eq('match_id', req.params.id);

  const updateData = {
    result_type,
    resolution_notes: String(resolution_notes).trim(),
    status: 'FINALIZADO',
    home_sets_won: config.home_sets,
    away_sets_won: config.away_sets,
    winner_team_id: winnerId,
    acta_status: 'VALIDADA',
    validated_by: req.currentUser,
    validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('matches').update(updateData).eq('id', req.params.id);
  if (error) throw fromSupabase(error);

  // Audita el resultado especial
  try {
    await supabase.from('audit_logs').insert([{
      usuario: req.currentUser,
      accion: 'RESULTADO_ESPECIAL',
      tabla: 'matches',
      registro_id: req.params.id,
      registro_viejo: match.result_type ? { result_type: match.result_type, status: match.status } : null,
      registro_nuevo: {
        evento: 'Registro de resultado especial',
        result_type,
        resolution_notes: updateData.resolution_notes,
        home_sets_won: config.home_sets,
        away_sets_won: config.away_sets,
        winner_team_id: winnerId,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {
    console.warn('Aviso: no se pudo auditar el resultado especial:', errAudit.message);
  }

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data });
}));

// Revierte el resultado especial y deja el partido disponible para registrar sets de nuevo.
router.delete('/:id/special-result', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data: match } = await supabase
    .from('matches')
    .select('result_type, status')
    .eq('id', req.params.id)
    .single();

  if (!match) throw new HttpError(404, 'Partido no encontrado.');

  if (!match.result_type || match.result_type === 'NORMAL') {
    throw new HttpError(400, 'El partido no tiene un resultado especial activo.');
  }

  const updateData = {
    result_type: 'NORMAL',
    resolution_notes: null,
    home_sets_won: 0,
    away_sets_won: 0,
    winner_team_id: null,
    status: 'PROGRAMADO',
    acta_status: 'BORRADOR',
    validated_by: null,
    validated_at: null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('matches').update(updateData).eq('id', req.params.id);
  if (error) throw fromSupabase(error);

  // Audita la reversión
  try {
    await supabase.from('audit_logs').insert([{
      usuario: req.currentUser,
      accion: 'RESULTADO_ESPECIAL_REVERTIDO',
      tabla: 'matches',
      registro_id: req.params.id,
      registro_viejo: { result_type: match.result_type, status: match.status },
      registro_nuevo: {
        evento: 'Reversión de resultado especial',
        result_type_anterior: match.result_type,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {
    console.warn('Aviso: no se pudo auditar la reversión del resultado especial:', errAudit.message);
  }

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data });
}));

module.exports = router;