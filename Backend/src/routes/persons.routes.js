const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);

const SELECT_PERSON = `id, document_number, first_name, last_name, birth_date, sex, nationality, province,
  email, phone, emergency_contact, is_verified, verified_at, status, association_id, created_at,
  tipo_documento:catalog_values!persons_document_type_value_id_fkey(code, value),
  asociacion:associations(id, name, short_name),
  person_roles(role_type, is_active)`;

// Quita los caracteres que PostgREST usa como sintaxis dentro de un filtro or().
const limpiarBusqueda = (q) => String(q).replace(/[,()*%\\:."']/g, ' ').trim();

// GET /api/persons?q=&association_id=&role=ARBITRO&status=
router.get('/', asyncHandler(async (req, res) => {
  const { association_id, role, status } = req.query;
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';

  // Con role se usa un join interno para filtrar en la base de datos y no en memoria.
  const select = role
    ? SELECT_PERSON.replace('person_roles(role_type, is_active)', 'person_roles!inner(role_type, is_active)')
    : SELECT_PERSON;

  let query = supabase.from('persons').select(select, { count: 'exact' }).order('last_name').limit(200);
  if (association_id) query = query.eq('association_id', association_id);
  if (status) query = query.eq('status', status);
  if (role) query = query.eq('person_roles.role_type', role).eq('person_roles.is_active', true);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%`);

  const { data, error, count } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: count ?? data.length });
}));

// GET /api/persons/:id -> ficha completa
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('persons').select(SELECT_PERSON).eq('id', req.params.id).single();
  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  const [{ data: equipos }, { data: documentos }] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, member_type, jersey_number, status, equipo:teams(id, name)')
      .eq('person_id', req.params.id),
    supabase
      .from('documents')
      .select('id, status, issue_date, expiry_date, file_name, tipo:catalog_values!documents_document_type_value_id_fkey(code, value)')
      .eq('person_id', req.params.id)
  ]);

  res.json({ data: { ...data, equipos: equipos || [], documentos: documentos || [] } });
}));

// POST /api/persons
router.post('/', asyncHandler(async (req, res) => {
  const { document_type_code, document_number, first_name, last_name, birth_date } = req.body;

  if (!document_type_code || !document_number || !first_name || !last_name || !birth_date) {
    throw new HttpError(400, 'document_type_code, document_number, first_name, last_name y birth_date son obligatorios');
  }

  const roles = req.body.roles && req.body.roles.length ? req.body.roles : ['JUGADOR'];
  const permitidos = ['JUGADOR', 'TECNICO', 'ARBITRO', 'OFICIAL'];
  if (roles.some((r) => !permitidos.includes(r))) {
    throw new HttpError(400, 'roles solo admite: ' + permitidos.join(', '));
  }

  const { data: id, error } = await supabase.rpc('sp_create_person', {
    p_document_type_code: document_type_code,
    p_document_number: document_number,
    p_first_name: first_name,
    p_last_name: last_name,
    p_birth_date: birth_date,
    p_admin_user: req.currentUser,
    p_sex: req.body.sex || null,
    p_association_id: req.body.association_id || null,
    p_email: req.body.email || null,
    p_phone: req.body.phone || null,
    p_province: req.body.province || null,
    p_roles: roles
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('persons').select(SELECT_PERSON).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/persons/:id
// Si cambian nombre, apellidos o fecha de nacimiento, la persona vuelve a quedar sin verificar.
router.patch('/:id', asyncHandler(async (req, res) => {
  const b = req.body;

  const { error } = await supabase.rpc('sp_update_person', {
    p_id: req.params.id,
    p_admin_user: req.currentUser,
    p_first_name: b.first_name ?? null,
    p_last_name: b.last_name ?? null,
    p_birth_date: b.birth_date ?? null,
    p_sex: b.sex ?? null,
    p_email: b.email ?? null,
    p_phone: b.phone ?? null,
    p_province: b.province ?? null,
    p_emergency_contact: b.emergency_contact ?? null,
    p_status: b.status ?? null
  });

  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  const { data } = await supabase.from('persons').select(SELECT_PERSON).eq('id', req.params.id).single();
  res.json({ data });
}));

// POST /api/persons/:id/verify -> FECOVOL confirma la identidad contra el documento
router.post('/:id/verify', asyncHandler(async (req, res) => {
  const { error } = await supabase.rpc('sp_verify_person', {
    p_id: req.params.id,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  res.json({ data: { id: req.params.id, is_verified: true } });
}));

// POST /api/persons/:id/roles -> habilita o deshabilita un rol (jugador, tecnico, arbitro, oficial)
router.post('/:id/roles', asyncHandler(async (req, res) => {
  const { role_type } = req.body;
  const is_active = req.body.is_active !== false;
  const permitidos = ['JUGADOR', 'TECNICO', 'ARBITRO', 'OFICIAL'];
  if (!permitidos.includes(role_type)) throw new HttpError(400, 'role_type solo admite: ' + permitidos.join(', '));

  const { error } = await supabase.rpc('sp_set_person_role', {
    p_person_id: req.params.id,
    p_role_type: role_type,
    p_is_active: is_active,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  res.status(201).json({ data: { person_id: req.params.id, role_type, is_active } });
}));

module.exports = router;
