// Designaciones arbitrales (RF-ARB-003/004) para FECOVOL: Administración y Personal de
// competencias designan, cambian (anulan y vuelven a designar) y cierran las designaciones.
// El árbitro confirma o rechaza las suyas desde su entorno (referees.me.routes.js).
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const {
  UUID, CODIGO, DESIGNACION_VIGENTE, OFICIALES_POR_PARTIDO, esFecha, hoyCR, sumarDias, texto,
  soloFecovol, oficialesVigentes
} = require('../utils/arbitraje');

const router = express.Router();
router.param('id', validateUuidParams);

// Las designaciones traen la cédula del árbitro y deciden quién pita cada partido: solo FECOVOL.
router.use(soloFecovol);

const SELECT_ASSIGNMENT = `id, match_id, status, assigned_by, assigned_at, responded_at, notes,
  arbitro:persons!referee_assignments_person_id_fkey(id, first_name, last_name, document_number),
  puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value)`;

const SELECT_PARTIDO = `id, match_number, matchday, scheduled_date, scheduled_time, status,
  competencia:competitions!matches_competition_id_fkey(id, name),
  sede:catalog_values!fk_matches_venue(value),
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name),
  arbitraje:referee_assignments!fk_referee_assignments_match(${SELECT_ASSIGNMENT.replace('id, match_id, ', 'id, ')})`;

// GET /api/referee-assignments?match_id=&person_id=&status=
router.get('/', asyncHandler(async (req, res) => {
  const { match_id, person_id, status } = req.query;
  if (match_id && !UUID.test(match_id)) throw new HttpError(400, 'match_id no es válido.');
  if (person_id && !UUID.test(person_id)) throw new HttpError(400, 'person_id no es válido.');

  let query = supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).order('assigned_at', { ascending: false }).limit(500);
  if (match_id) query = query.eq('match_id', match_id);
  if (person_id) query = query.eq('person_id', person_id);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: data.length });
}));

// GET /api/referee-assignments/partidos?desde=&hasta=&competition_id= -> partidos por jugarse con
// sus oficiales (por defecto, los próximos 30 días).
router.get('/partidos', asyncHandler(async (req, res) => {
  const hoy = hoyCR();
  const desde = req.query.desde || hoy;
  const hasta = req.query.hasta || sumarDias(desde, 30);
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) throw new HttpError(400, 'El rango de fechas no es válido.');
  if (sumarDias(desde, 120) < hasta) throw new HttpError(400, 'Consulte como máximo 120 días a la vez.');
  const competencia = req.query.competition_id;
  if (competencia && !UUID.test(competencia)) throw new HttpError(400, 'competition_id no es válido.');

  let query = supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .in('status', ['PROGRAMADO', 'REPROGRAMADO'])
    .gte('scheduled_date', desde)
    .lte('scheduled_date', hasta)
    .order('scheduled_date')
    .order('scheduled_time')
    .limit(300);
  if (competencia) query = query.eq('competition_id', competencia);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  const partidos = (data || []).map(({ arbitraje, ...m }) => {
    const vigentes = oficialesVigentes(arbitraje);
    return { ...m, oficiales: vigentes, rechazadas: (arbitraje || []).filter((a) => a.status === 'RECHAZADA'), completos: vigentes.length >= OFICIALES_POR_PARTIDO };
  });
  res.json({ data: partidos, desde, hasta, oficiales_por_partido: OFICIALES_POR_PARTIDO });
}));

// POST /api/referee-assignments -> designa a un oficial en un partido (queda PROPUESTA hasta que
// la persona la confirme). El procedimiento valida partido, rol y acreditación vigente; aquí se
// añaden las reglas que dependen de otros partidos y del conflicto de interés.
router.post('/', asyncHandler(async (req, res) => {
  const { match_id, person_id, official_type_code } = req.body || {};
  const notas = texto(req.body?.notes, 500);

  if (!UUID.test(match_id || '') || !UUID.test(person_id || '') || !CODIGO.test(official_type_code || '')) {
    throw new HttpError(400, 'match_id, person_id y official_type_code son obligatorios');
  }

  const [partido, persona] = await Promise.all([
    supabase
      .from('matches')
      .select(`id, scheduled_date, scheduled_time,
        local:teams!matches_home_team_id_fkey(association_id),
        visitante:teams!matches_away_team_id_fkey(association_id)`)
      .eq('id', match_id)
      .maybeSingle(),
    supabase.from('persons').select('id, association_id').eq('id', person_id).maybeSingle()
  ]);
  if (!partido.data) throw new HttpError(404, 'Partido no encontrado.');
  if (!persona.data) throw new HttpError(404, 'Persona no encontrada.');

  // Otra designación vigente a la misma hora del mismo día: no puede estar en dos partidos.
  const { data: mismoDia } = await supabase
    .from('referee_assignments')
    .select('id, match_id, partido:matches!fk_referee_assignments_match!inner(scheduled_date, scheduled_time)')
    .eq('person_id', person_id)
    .in('status', DESIGNACION_VIGENTE)
    .eq('partido.scheduled_date', partido.data.scheduled_date);
  if ((mismoDia || []).some((d) => d.match_id !== match_id && d.partido?.scheduled_time === partido.data.scheduled_time)) {
    throw new HttpError(409, 'La persona ya está designada en otro partido a la misma hora.');
  }

  // Conflicto de interés: se puede designar igual, dejando constancia del motivo.
  const asociaciones = [partido.data.local?.association_id, partido.data.visitante?.association_id].filter(Boolean);
  if (persona.data.association_id && asociaciones.includes(persona.data.association_id) && notas.length < 10) {
    throw new HttpError(400, 'La persona pertenece a la asociación de un equipo del partido. Indique el motivo para designarla igual (al menos 10 caracteres).');
  }

  const { data: id, error } = await supabase.rpc('sp_assign_referee', {
    p_match_id: match_id,
    p_person_id: person_id,
    p_official_type_code: official_type_code,
    p_admin_user: req.currentUser,
    p_notes: notas || null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/referee-assignments/:id -> FECOVOL anula una designación (para cambiar a la persona)
// o la marca como cumplida. Confirmar o rechazar le corresponde al árbitro.
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const permitidos = ['ANULADA', 'CUMPLIDA'];
  if (!permitidos.includes(status)) throw new HttpError(400, 'status solo admite: ' + permitidos.join(', '));

  const { error } = await supabase.rpc('sp_update_referee_assignment', {
    p_id: req.params.id,
    p_status: status,
    p_admin_user: req.currentUser,
    p_notes: texto(req.body?.notes, 500) || null
  });

  const err = fromSupabase(error, 'Designacion');
  if (err) throw err;

  const { data } = await supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).eq('id', req.params.id).single();
  res.json({ data });
}));

/* ------------------------------------------------------------------------------------------------
   Cierre arbitral de un partido (RF-ARB-005): consulta y devolución al árbitro.
   ---------------------------------------------------------------------------------------------- */
// GET /api/referee-assignments/cierres/:id -> cierre registrado por el árbitro principal
router.get('/cierres/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('match_referee_reports')
    .select(`status, result_type, sets, observations, return_reason, submitted_at, returned_at, returned_by, updated_at,
      arbitro:persons!match_referee_reports_person_id_fkey(first_name, last_name)`)
    .eq('match_id', req.params.id)
    .maybeSingle();
  const err = fromSupabase(error);
  if (err) throw err;
  res.set('Cache-Control', 'no-store');
  res.json({ data: data || null });
}));

// PATCH /api/referee-assignments/cierres/:id/devolver { motivo } -> el árbitro puede corregirlo
router.patch('/cierres/:id/devolver', asyncHandler(async (req, res) => {
  const motivo = texto(req.body?.motivo, 500);
  if (motivo.length < 10) throw new HttpError(400, 'Indique el motivo de la devolución (al menos 10 caracteres).');
  const { error } = await supabase.rpc('sp_return_referee_report', {
    p_match_id: req.params.id,
    p_reason: motivo,
    p_user: req.currentUser
  });
  if (error) {
    if (error.code === 'P0001') throw new HttpError(409, error.message);
    throw fromSupabase(error);
  }
  res.json({ data: { status: 'DEVUELTO' } });
}));

module.exports = router;
