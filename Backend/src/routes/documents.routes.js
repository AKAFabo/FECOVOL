const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);

const SELECT_DOC = `id, file_url, file_name, issue_date, expiry_date, status, notes,
  uploaded_by, reviewed_by, reviewed_at, created_at,
  tipo:catalog_values!documents_document_type_value_id_fkey(code, value),
  persona:persons!documents_person_id_fkey(id, first_name, last_name),
  equipo:teams!documents_team_id_fkey(id, name),
  asociacion:associations!documents_association_id_fkey(id, name)`;

// GET /api/documents?person_id=&association_id=&team_id=&status=&por_vencer=30
router.get('/', asyncHandler(async (req, res) => {
  const { person_id, association_id, team_id, status, por_vencer } = req.query;

  let query = supabase.from('documents').select(SELECT_DOC).order('expiry_date', { nullsFirst: false });
  if (person_id) query = query.eq('person_id', person_id);
  if (association_id) query = query.eq('association_id', association_id);
  if (team_id) query = query.eq('team_id', team_id);
  if (status) query = query.eq('status', status);

  if (por_vencer) {
    const limite = new Date();
    limite.setDate(limite.getDate() + Number(por_vencer));
    query = query.lte('expiry_date', limite.toISOString().slice(0, 10)).eq('status', 'VIGENTE');
  }

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: data.length });
}));

// POST /api/documents -> sube (registra) un documento de una persona, un equipo o una asociacion
router.post('/', asyncHandler(async (req, res) => {
  const { document_type_code, file_url, person_id, association_id, team_id } = req.body;

  if (!document_type_code || !file_url) throw new HttpError(400, 'document_type_code y file_url son obligatorios');

  const duenos = [person_id, association_id, team_id].filter(Boolean);
  if (duenos.length !== 1) throw new HttpError(400, 'Indique exactamente uno: person_id, association_id o team_id');

  const { data: id, error } = await supabase.rpc('sp_upload_document', {
    p_document_type_code: document_type_code,
    p_file_url: file_url,
    p_admin_user: req.currentUser,
    p_person_id: person_id || null,
    p_association_id: association_id || null,
    p_team_id: team_id || null,
    p_file_name: req.body.file_name || null,
    p_issue_date: req.body.issue_date || null,
    p_expiry_date: req.body.expiry_date || null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('documents').select(SELECT_DOC).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/documents/:id/review -> FECOVOL aprueba o rechaza
router.patch('/:id/review', asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const permitidos = ['VIGENTE', 'RECHAZADO', 'VENCIDO'];
  if (!permitidos.includes(status)) throw new HttpError(400, 'status solo admite: ' + permitidos.join(', '));

  const { error } = await supabase.rpc('sp_review_document', {
    p_id: req.params.id,
    p_status: status,
    p_admin_user: req.currentUser,
    p_notes: notes || null
  });

  const err = fromSupabase(error, 'Documento');
  if (err) throw err;

  const { data } = await supabase.from('documents').select(SELECT_DOC).eq('id', req.params.id).single();
  res.json({ data });
}));

// POST /api/documents/expire -> marca como vencidos los que ya pasaron su fecha
router.post('/expire', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('sp_expire_documents');
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data: { vencidos: data } });
}));

module.exports = router;
