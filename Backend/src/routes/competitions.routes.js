const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('teamId', validateUuidParams);
router.param('rosterId', validateUuidParams);

const SELECT_COMPETITION = `
  id, name, season, status, start_date, end_date,
  points_win_3_0, points_win_3_2, points_loss_2_3, points_loss_0_3,
  categoria:catalog_values!competitions_category_value_id_fkey(code, value),
  rama:catalog_values!competitions_branch_value_id_fkey(code, value),
  modalidad:catalog_values!competitions_modality_value_id_fkey(code, value)
`;

// GET /api/competitions
router.get('/', asyncHandler(async (req, res) => {
  const { season, status } = req.query;

  let query = supabase.from('competitions').select(SELECT_COMPETITION).order('start_date', { ascending: false });
  if (season) query = query.eq('season', season);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/competitions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competitions')
    .select(SELECT_COMPETITION)
    .eq('id', req.params.id)
    .single();

  const err = fromSupabase(error, 'Competencia');
  if (err) throw err;

  res.json({ data });
}));

// POST /api/competitions
router.post('/', asyncHandler(async (req, res) => {
  const { name, season, category_code, branch_code, modality_code, start_date, end_date, status } = req.body;

  if (!name || !season || !category_code || !branch_code || !modality_code || !start_date || !end_date) {
    throw new HttpError(400, 'Faltan campos obligatorios para crear la competencia.');
  }

  const { data: id, error } = await supabase.rpc('sp_create_competition', {
    p_name: name,
    p_season: season,
    p_category_code: category_code,
    p_branch_code: branch_code,
    p_modality_code: modality_code,
    p_start_date: start_date,
    p_end_date: end_date,
    p_admin_user: req.currentUser,
    p_status: status || 'PLANIFICACION'
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('competitions').select(SELECT_COMPETITION).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/competitions/:id (Actualizar reglas, fechas o estado)
router.patch('/:id', asyncHandler(async (req, res) => {
  const b = req.body;
  
  // Nota: Para la bitácora, lo ideal es usar un SP, pero para actualizaciones simples de reglas
  // podemos hacer update directo (el trigger genérico capturará el cambio).
  const { error } = await supabase
    .from('competitions')
    .update({
      name: b.name,
      season: b.season,
      status: b.status,
      start_date: b.start_date,
      end_date: b.end_date,
      points_win_3_0: b.points_win_3_0,
      points_win_3_2: b.points_win_3_2,
      points_loss_2_3: b.points_loss_2_3,
      points_loss_0_3: b.points_loss_0_3,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  const err = fromSupabase(error, 'Competencia');
  if (err) throw err;

  const { data } = await supabase.from('competitions').select(SELECT_COMPETITION).eq('id', req.params.id).single();
  res.json({ data });
}));

// GET /api/competitions/:id/standings -> Tabla de posiciones (Usa la Vista SQL)
router.get('/:id/standings', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('v_standings')
    .select('*')
    .eq('competition_id', req.params.id)
    .order('total_points', { ascending: false })
    .order('sets_won', { ascending: false }); // Criterio de desempate simple

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/competitions/:id/teams -> Equipos inscritos
router.get('/:id/teams', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competition_teams')
    .select(`
      id, status, created_at,
      equipo:teams(id, name, short_name, logo_url)
    `)
    .eq('competition_id', req.params.id);

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// POST /api/competitions/:id/teams -> Inscribir un equipo
router.post('/:id/teams', asyncHandler(async (req, res) => {
  const { team_id } = req.body;
  if (!team_id) throw new HttpError(400, 'team_id es obligatorio');

  const { data: id, error } = await supabase.rpc('sp_register_team_in_competition', {
    p_competition_id: req.params.id,
    p_team_id: team_id,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error);
  if (err) throw err;

  res.status(201).json({ data: { id, competition_id: req.params.id, team_id } });
}));

// GET /api/competitions/:id/teams/:teamId/roster -> Nómina del equipo en esta competencia
router.get('/:id/teams/:teamId/roster', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competition_rosters')
    .select(`
      id, jersey_number, roster_role, is_habilitated, status, start_date, end_date,
      persona:persons(id, first_name, last_name, document_number)
    `)
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .eq('status', 'ACTIVO') // Solo los activos
    .order('jersey_number', { nullsFirst: false });

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// POST /api/competitions/:id/teams/:teamId/roster -> Agregar jugador a la nómina
router.post('/:id/teams/:teamId/roster', asyncHandler(async (req, res) => {
  const { person_id, jersey_number, roster_role } = req.body;
  if (!person_id) throw new HttpError(400, 'person_id es obligatorio');

  const { data, error } = await supabase
    .from('competition_rosters')
    .insert({
      competition_id: req.params.id,
      team_id: req.params.teamId,
      person_id,
      jersey_number: jersey_number || null,
      roster_role: roster_role || 'JUGADOR',
      is_habilitated: true
    })
    .select()
    .single();

  const err = fromSupabase(error);
  if (err) throw err;

  res.status(201).json({ data });
}));

// DELETE /api/competitions/:id/teams/:teamId/roster/:rosterId -> Dar de baja (Lógica)
router.delete('/:id/teams/:teamId/roster/:rosterId', asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('competition_rosters')
    .update({ 
      status: 'BAJA', 
      end_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.rosterId)
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId);

  const err = fromSupabase(error, 'Integrante de nómina');
  if (err) throw err;

  res.json({ data: { id: req.params.rosterId, status: 'BAJA' } });
}));

module.exports = router;