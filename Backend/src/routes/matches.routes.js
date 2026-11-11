const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);

const SELECT_MATCH = `
  id, competition_id, match_number, matchday, venue, scheduled_date, scheduled_time, 
  status, home_sets_won, away_sets_won,
  local:teams!matches_home_team_id_fkey(id, name, short_name, logo_url),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name, logo_url),
  ganador:teams!matches_winner_team_id_fkey(id, name)
`;

// GET /api/matches?competition_id=&matchday=&team_id=&status=
router.get('/', asyncHandler(async (req, res) => {
  const { competition_id, matchday, team_id, status } = req.query;

  let query = supabase.from('matches').select(SELECT_MATCH).order('scheduled_date').order('scheduled_time');
  
  if (competition_id) query = query.eq('competition_id', competition_id);
  if (matchday) query = query.eq('matchday', matchday);
  if (status) query = query.eq('status', status);
  
  // Filtro para partidos de un equipo específico (sea local o visitante)
  if (team_id) {
    query = query.or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`);
  }

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/matches/:id -> Detalle del partido con sus sets
router.get('/:id', asyncHandler(async (req, res) => {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select(SELECT_MATCH)
    .eq('id', req.params.id)
    .single();

  const errMatch = fromSupabase(matchError, 'Partido');
  if (errMatch) throw errMatch;

  // Obtener los sets
  const { data: sets, error: setsError } = await supabase
    .from('match_sets')
    .select('id, set_number, home_points, away_points')
    .eq('match_id', req.params.id)
    .order('set_number');

  const errSets = fromSupabase(setsError);
  if (errSets) throw errSets;

  res.json({ data: { ...match, sets: sets || [] } });
}));

// POST /api/matches -> Programar un partido
router.post('/', asyncHandler(async (req, res) => {
  const { 
    competition_id, match_number, matchday, 
    home_team_id, away_team_id, scheduled_date, scheduled_time, venue 
  } = req.body;

  if (!competition_id || !match_number || !matchday || !home_team_id || !away_team_id || !scheduled_date || !scheduled_time) {
    throw new HttpError(400, 'Faltan datos obligatorios para programar el partido.');
  }

  const { data: id, error } = await supabase.rpc('sp_schedule_match', {
    p_competition_id: competition_id,
    p_match_number: match_number,
    p_matchday: matchday,
    p_home_team_id: home_team_id,
    p_away_team_id: away_team_id,
    p_scheduled_date: scheduled_date,
    p_scheduled_time: scheduled_time,
    p_admin_user: req.currentUser,
    p_venue: venue || null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/matches/:id -> Actualizar estado (Suspender, Cancelar) o Reprogramar
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status, scheduled_date, scheduled_time, venue, reason } = req.body;

  // 1. Obtener los datos actuales para ver si hubo reprogramación
  const { data: currentMatch, error: errGet } = await supabase
    .from('matches')
    .select('scheduled_date, scheduled_time, venue')
    .eq('id', req.params.id)
    .single();

  const errGetMatch = fromSupabase(errGet, 'Partido');
  if (errGetMatch) throw errGetMatch;

  // 2. Si cambian fecha, hora o sede, guardamos el historial (RF-COM-006)
  const isReschedule = 
    (scheduled_date && scheduled_date !== currentMatch.scheduled_date) ||
    (scheduled_time && scheduled_time !== currentMatch.scheduled_time) ||
    (venue && venue !== currentMatch.venue);

  if (isReschedule) {
    await supabase.from('match_reschedulings').insert({
      match_id: req.params.id,
      previous_date: currentMatch.scheduled_date,
      previous_time: currentMatch.scheduled_time,
      previous_venue: currentMatch.venue,
      new_date: scheduled_date || currentMatch.scheduled_date,
      new_time: scheduled_time || currentMatch.scheduled_time,
      new_venue: venue || currentMatch.venue,
      reason: reason || 'Reprogramación solicitada',
      rescheduled_by: req.currentUser
    });
  }

  // 3. Actualizar el partido
  const updateData = {
    updated_at: new Date().toISOString()
  };
  if (status) updateData.status = status;
  if (scheduled_date) updateData.scheduled_date = scheduled_date;
  if (scheduled_time) updateData.scheduled_time = scheduled_time;
  if (venue) updateData.venue = venue;

  const { error: errUpdate } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', req.params.id);

  const errUpdateMatch = fromSupabase(errUpdate, 'Partido');
  if (errUpdateMatch) throw errUpdateMatch;

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data });
}));

// POST /api/matches/:id/sets -> Guardar los sets de un partido
router.post('/:id/sets', asyncHandler(async (req, res) => {
  const { sets } = req.body; // Espera un array: [{ set_number: 1, home_points: 25, away_points: 19 }, ...]

  if (!sets || !Array.isArray(sets) || sets.length === 0) {
    throw new HttpError(400, 'Debe enviar un arreglo con los sets jugados.');
  }

  // Limpiar sets anteriores de este partido para evitar duplicados si se corrige el marcador
  await supabase.from('match_sets').delete().eq('match_id', req.params.id);

  // Insertar los nuevos sets
  const setsToInsert = sets.map(s => ({
    match_id: req.params.id,
    set_number: s.set_number,
    home_points: s.home_points,
    away_points: s.away_points
  }));

  const { error } = await supabase.from('match_sets').insert(setsToInsert);

  const err = fromSupabase(error);
  if (err) throw err;

  res.status(201).json({ data: setsToInsert });
}));

// POST /api/matches/:id/finish -> Finalizar partido y calcular ganador (RF-COM-007)
router.post('/:id/finish', asyncHandler(async (req, res) => {
  // Llama al procedimiento que calcula sets ganados, define ganador y cambia estado a FINALIZADO
  const { error } = await supabase.rpc('sp_record_match_result', {
    p_match_id: req.params.id,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('matches').select(SELECT_MATCH).eq('id', req.params.id).single();
  res.json({ data });
}));

module.exports = router;