const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('memberId', validateUuidParams);

const SELECT_TEAM = `id, association_id, name, short_name, home_venue, primary_color, secondary_color, status, created_at,
  asociacion:associations(id, name, short_name),
  categoria:catalog_values!teams_category_value_id_fkey(code, value),
  rama:catalog_values!teams_branch_value_id_fkey(code, value),
  modalidad:catalog_values!teams_modality_value_id_fkey(code, value)`;

// GET /api/teams?association_id=&status=&q=
router.get('/', asyncHandler(async (req, res) => {
  const { association_id, status, q } = req.query;

  let query = supabase.from('teams').select(SELECT_TEAM).order('name');
  if (association_id) query = query.eq('association_id', association_id);
  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/teams/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('teams').select(SELECT_TEAM).eq('id', req.params.id).single();
  const err = fromSupabase(error, 'Equipo');
  if (err) throw err;

  res.json({ data });
}));

// POST /api/teams
router.post('/', asyncHandler(async (req, res) => {
  const { association_id, name, category_code, branch_code, modality_code } = req.body;

  if (!association_id || !name || !category_code || !branch_code || !modality_code) {
    throw new HttpError(400, 'association_id, name, category_code, branch_code y modality_code son obligatorios');
  }

  const { data: id, error } = await supabase.rpc('sp_create_team', {
    p_association_id: association_id,
    p_name: name,
    p_category_code: category_code,
    p_branch_code: branch_code,
    p_modality_code: modality_code,
    p_admin_user: req.currentUser,
    p_short_name: req.body.short_name || null,
    p_home_venue: req.body.home_venue || null,
    p_primary_color: req.body.primary_color || null,
    p_secondary_color: req.body.secondary_color || null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('teams').select(SELECT_TEAM).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/teams/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const b = req.body;

  const { error } = await supabase.rpc('sp_update_team', {
    p_id: req.params.id,
    p_admin_user: req.currentUser,
    p_name: b.name ?? null,
    p_short_name: b.short_name ?? null,
    p_home_venue: b.home_venue ?? null,
    p_primary_color: b.primary_color ?? null,
    p_secondary_color: b.secondary_color ?? null,
    p_status: b.status ?? null
  });

  const err = fromSupabase(error, 'Equipo');
  if (err) throw err;

  const { data } = await supabase.from('teams').select(SELECT_TEAM).eq('id', req.params.id).single();
  res.json({ data });
}));

// GET /api/teams/:id/members -> nomina del equipo
router.get('/:id/members', asyncHandler(async (req, res) => {
  const incluirBajas = req.query.incluir_bajas === 'true';

  let query = supabase
    .from('team_members')
    .select(`id, member_type, technical_role, jersey_number, start_date, end_date, status,
             posicion:catalog_values!team_members_position_value_id_fkey(code, value),
             persona:persons!team_members_person_id_fkey(id, first_name, last_name, document_number, birth_date, is_verified)`)
    .eq('team_id', req.params.id)
    .order('jersey_number', { nullsFirst: false });

  if (!incluirBajas) query = query.eq('status', 'ACTIVO');

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: data.length });
}));

// POST /api/teams/:id/members -> agregar integrante a la nomina
router.post('/:id/members', asyncHandler(async (req, res) => {
  const { person_id, member_type, position_code, technical_role, jersey_number } = req.body;

  if (!person_id || !member_type) throw new HttpError(400, 'person_id y member_type son obligatorios');
  if (!['JUGADOR', 'TECNICO'].includes(member_type)) throw new HttpError(400, 'member_type debe ser JUGADOR o TECNICO');

  const { data: id, error } = await supabase.rpc('sp_add_team_member', {
    p_team_id: req.params.id,
    p_person_id: person_id,
    p_member_type: member_type,
    p_admin_user: req.currentUser,
    p_position_code: position_code || null,
    p_technical_role: technical_role || null,
    p_jersey_number: jersey_number ?? null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  res.status(201).json({ data: { id } });
}));

// DELETE /api/teams/members/:memberId -> da de baja al integrante (no borra el historico)
router.delete('/members/:memberId', asyncHandler(async (req, res) => {
  const { error } = await supabase.rpc('sp_remove_team_member', {
    p_id: req.params.memberId,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error, 'Integrante');
  if (err) throw err;

  res.json({ data: { id: req.params.memberId, status: 'BAJA' } });
}));

module.exports = router;
