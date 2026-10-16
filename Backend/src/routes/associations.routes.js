const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);

const SELECT_BASE =
  'id, name, short_name, tax_id, province, canton, address, email, phone, website, home_venue, founded_date, affiliation_date, status, created_at, updated_at';

// GET /api/associations?status=AFILIADA&province=Cartago&q=cartago
router.get('/', asyncHandler(async (req, res) => {
  const { status, province, q } = req.query;

  let query = supabase.from('associations').select(SELECT_BASE).order('name');
  if (status) query = query.eq('status', status);
  if (province) query = query.eq('province', province);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/associations/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('associations')
    .select(`${SELECT_BASE}, association_board_members(id, position, full_name, email, phone)`)
    .eq('id', req.params.id)
    .single();

  const err = fromSupabase(error, 'Asociacion');
  if (err) throw err;

  const [{ count: equipos }, { count: personas }] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('association_id', req.params.id),
    supabase.from('persons').select('id', { count: 'exact', head: true }).eq('association_id', req.params.id)
  ]);

  res.json({ data: { ...data, total_equipos: equipos || 0, total_personas: personas || 0 } });
}));

// POST /api/associations
router.post('/', asyncHandler(async (req, res) => {
  const { name, tax_id, province, canton, email, phone, short_name, address, home_venue, founded_date, status } = req.body;

  if (!name || !tax_id) throw new HttpError(400, 'name y tax_id son obligatorios');

  const { data: id, error } = await supabase.rpc('sp_create_association', {
    p_name: name,
    p_tax_id: tax_id,
    p_province: province || null,
    p_canton: canton || null,
    p_email: email || null,
    p_phone: phone || null,
    p_admin_user: req.currentUser,
    p_short_name: short_name || null,
    p_address: address || null,
    p_home_venue: home_venue || null,
    p_founded_date: founded_date || null,
    p_status: status || 'PROVISIONAL'
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('associations').select(SELECT_BASE).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/associations/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const b = req.body;

  const { error } = await supabase.rpc('sp_update_association', {
    p_id: req.params.id,
    p_admin_user: req.currentUser,
    p_name: b.name ?? null,
    p_short_name: b.short_name ?? null,
    p_province: b.province ?? null,
    p_canton: b.canton ?? null,
    p_address: b.address ?? null,
    p_email: b.email ?? null,
    p_phone: b.phone ?? null,
    p_website: b.website ?? null,
    p_home_venue: b.home_venue ?? null,
    p_status: b.status ?? null
  });

  const err = fromSupabase(error, 'Asociacion');
  if (err) throw err;

  const { data } = await supabase.from('associations').select(SELECT_BASE).eq('id', req.params.id).single();
  res.json({ data });
}));

// GET /api/associations/:id/teams
router.get('/:id/teams', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('teams')
    .select(`id, name, short_name, status, home_venue,
             categoria:catalog_values!teams_category_value_id_fkey(code, value),
             rama:catalog_values!teams_branch_value_id_fkey(code, value),
             modalidad:catalog_values!teams_modality_value_id_fkey(code, value)`)
    .eq('association_id', req.params.id)
    .order('name');

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/associations/:id/persons
router.get('/:id/persons', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('persons')
    .select('id, first_name, last_name, document_number, birth_date, is_verified, status, person_roles(role_type)')
    .eq('association_id', req.params.id)
    .order('last_name');

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// POST /api/associations/:id/board -> agrega un cargo de la junta directiva
router.post('/:id/board', asyncHandler(async (req, res) => {
  const { position, full_name, email, phone, start_date } = req.body;
  if (!position || !full_name) throw new HttpError(400, 'position y full_name son obligatorios');

  const { data: id, error } = await supabase.rpc('sp_add_board_member', {
    p_association_id: req.params.id,
    p_position: position,
    p_full_name: full_name,
    p_admin_user: req.currentUser,
    p_email: email || null,
    p_phone: phone || null,
    p_start_date: start_date || null
  });

  const err = fromSupabase(error, 'Asociacion');
  if (err) throw err;

  res.status(201).json({ data: { id, association_id: req.params.id, position, full_name, email, phone, start_date } });
}));

module.exports = router;
