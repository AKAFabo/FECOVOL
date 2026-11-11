const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

const router = express.Router();
router.param('id', validateUuidParams);

// Las designaciones traen la cédula del árbitro y deciden quién pita cada partido: por ahora solo
// las consulta y modifica FECOVOL. Cuando exista la vista "Mis designaciones", el árbitro podrá
// ver y confirmar las suyas.
async function soloFecovol(req, res, next) {
  const scope = req.userScope || { isPublic: true };
  if (scope.isAdmin) return next();
  if (!scope.isPublic) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'referee_assignments',
      motivo: `Intento de ${req.method === 'GET' ? 'consultar' : 'modificar'} designaciones arbitrales sin permisos de FECOVOL`,
      endpoint: `${req.method} ${req.baseUrl}${req.path}`,
      ip: getClientIp(req),
      datosIntentados: req.method === 'GET' ? req.query : req.body
    });
  }
  next(new HttpError(scope.isPublic ? 401 : 403, scope.isPublic
    ? 'Se requiere iniciar sesión para gestionar designaciones arbitrales.'
    : 'Acceso denegado: Solo FECOVOL gestiona las designaciones arbitrales.'));
}
router.use(soloFecovol);

const SELECT_ASSIGNMENT = `id, match_id, status, assigned_by, assigned_at, responded_at, notes,
  arbitro:persons!referee_assignments_person_id_fkey(id, first_name, last_name, document_number),
  puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value)`;

// GET /api/referee-assignments?match_id=&person_id=&status=
router.get('/', asyncHandler(async (req, res) => {
  const { match_id, person_id, status } = req.query;

  let query = supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).order('assigned_at', { ascending: false });
  if (match_id) query = query.eq('match_id', match_id);
  if (person_id) query = query.eq('person_id', person_id);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: data.length });
}));

// POST /api/referee-assignments -> designa a un arbitro en un partido
router.post('/', asyncHandler(async (req, res) => {
  const { match_id, person_id, official_type_code, notes } = req.body;

  if (!match_id || !person_id || !official_type_code) {
    throw new HttpError(400, 'match_id, person_id y official_type_code son obligatorios');
  }

  const { data: id, error } = await supabase.rpc('sp_assign_referee', {
    p_match_id: match_id,
    p_person_id: person_id,
    p_official_type_code: official_type_code,
    p_admin_user: req.currentUser,
    p_notes: notes || null
  });

  const err = fromSupabase(error);
  if (err) throw err;

  const { data } = await supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).eq('id', id).single();
  res.status(201).json({ data });
}));

// PATCH /api/referee-assignments/:id -> el arbitro confirma o rechaza; competencias anula o cierra
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const permitidos = ['CONFIRMADA', 'RECHAZADA', 'CUMPLIDA', 'ANULADA'];
  if (!permitidos.includes(status)) throw new HttpError(400, 'status solo admite: ' + permitidos.join(', '));

  const { error } = await supabase.rpc('sp_update_referee_assignment', {
    p_id: req.params.id,
    p_status: status,
    p_admin_user: req.currentUser,
    p_notes: notes || null
  });

  const err = fromSupabase(error, 'Designacion');
  if (err) throw err;

  const { data } = await supabase.from('referee_assignments').select(SELECT_ASSIGNMENT).eq('id', req.params.id).single();
  res.json({ data });
}));

module.exports = router;
