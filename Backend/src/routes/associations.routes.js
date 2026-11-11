const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');
const { puedeVerPrivado, exigirGestion, esDeOtraAsociacion } = require('../utils/ambito');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('boardId', validateUuidParams);

const SELECT_BASE =
  'id, name, short_name, tax_id, province, canton, address, email, phone, website, home_venue, founded_date, affiliation_date, status, created_at, updated_at';

// Proyección pública sin cédula jurídica ni datos internos
const SELECT_PUBLIC =
  'id, name, short_name, province, canton, address, email, phone, website, home_venue, founded_date, affiliation_date, status';

/**
 * Consulta dependencias para asociaciones (RF-AUD-002)
 * Tablas vinculadas:
 * - teams: association_id
 * - persons: association_id
 * - association_board_members: association_id
 * - documents: association_id
 * - user_profiles: organization_id
 */
async function getDependenciesForAssociations(associationIds) {
  if (!associationIds || associationIds.length === 0) return {};

  const [
    { data: teams },
    { data: persons },
    { data: board },
    { data: profiles },
    { data: documents }
  ] = await Promise.all([
    supabase.from('teams').select('association_id').in('association_id', associationIds),
    supabase.from('persons').select('association_id').in('association_id', associationIds),
    supabase.from('association_board_members').select('association_id').in('association_id', associationIds),
    supabase.from('user_profiles').select('organization_id').in('organization_id', associationIds),
    supabase.from('documents').select('association_id').in('association_id', associationIds)
  ]);

  const map = {};
  for (const id of associationIds) {
    map[id] = {
      total: 0,
      teams: 0,
      persons: 0,
      board: 0,
      profiles: 0,
      documents: 0
    };
  }

  (teams || []).forEach(r => {
    if (map[r.association_id]) {
      map[r.association_id].teams++;
      map[r.association_id].total++;
    }
  });
  (persons || []).forEach(r => {
    if (map[r.association_id]) {
      map[r.association_id].persons++;
      map[r.association_id].total++;
    }
  });
  (board || []).forEach(r => {
    if (map[r.association_id]) {
      map[r.association_id].board++;
      map[r.association_id].total++;
    }
  });
  (profiles || []).forEach(r => {
    if (map[r.organization_id]) {
      map[r.organization_id].profiles++;
      map[r.organization_id].total++;
    }
  });
  (documents || []).forEach(r => {
    if (map[r.association_id]) {
      map[r.association_id].documents++;
      map[r.association_id].total++;
    }
  });

  return map;
}

/**
 * Datos para la vista de FECOVOL: representantes de cada asociación y estado de sus documentos
 * (los de la asociación, sus equipos y sus personas).
 */
async function resumenParaFecovol(associationIds) {
  const resumen = Object.fromEntries(associationIds.map((id) => [id, {
    representantes: [],
    documentos: { en_revision: 0, por_vencer: 0, por_corregir: 0 }
  }]));
  if (!associationIds.length) return resumen;

  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
  const hoy = new Date().toISOString().slice(0, 10);
  const enTreinta = limite.toISOString().slice(0, 10);

  const [{ data: perfiles }, { data: documentos }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('organization_id, full_name, email, status, roles:roles!user_profiles_role_id_fkey(name)')
      .in('organization_id', associationIds),
    supabase
      .from('v_documentos')
      .select('owner_association_id, status, expiry_date')
      .in('owner_association_id', associationIds)
  ]);

  for (const p of perfiles || []) {
    if (p.roles?.name !== 'Representante' || !resumen[p.organization_id]) continue;
    resumen[p.organization_id].representantes.push({ full_name: p.full_name, email: p.email, status: p.status });
  }
  for (const d of documentos || []) {
    const r = resumen[d.owner_association_id]?.documentos;
    if (!r) continue;
    const vencido = d.expiry_date && d.expiry_date < hoy;
    if (d.status === 'RECHAZADO' || d.status === 'VENCIDO' || vencido) r.por_corregir += 1;
    else if (d.status === 'EN_REVISION') r.en_revision += 1;
    else if (d.expiry_date && d.expiry_date <= enTreinta) r.por_vencer += 1;
  }
  return resumen;
}

// GET /api/associations?status=AFILIADA&province=Cartago&q=cartago
router.get('/', asyncHandler(async (req, res) => {
  const { status, province, q } = req.query;
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  const selectCols = scope.isPublic ? SELECT_PUBLIC : SELECT_BASE;

  let query = supabase.from('associations').select(selectCols).order('name');
  if (status) query = query.eq('status', status);
  if (province) query = query.eq('province', province);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  let enrichedData = data || [];
  if (!scope.isPublic && enrichedData.length > 0) {
    const ids = enrichedData.map(a => a.id);
    const depMap = await getDependenciesForAssociations(ids);
    enrichedData = enrichedData.map(a => {
      const deps = depMap[a.id] || { total: 0, teams: 0, persons: 0, board: 0, profiles: 0, documents: 0 };
      return {
        ...a,
        dependency_count: deps.total,
        teams_count: deps.teams,
        persons_count: deps.persons,
        board_count: deps.board,
        profiles_count: deps.profiles,
        documents_count: deps.documents,
        dependencies: deps
      };
    });

    if (scope.isAdmin) {
      const extra = await resumenParaFecovol(ids);
      enrichedData = enrichedData.map((a) => ({ ...a, ...extra[a.id] }));
    }
  }

  res.json({ data: enrichedData });
}));

// GET /api/associations/:id -> Detalle de la asociación
router.get('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };
  const esPropia = scope.isAssociation && scope.organizationId === req.params.id;

  // Clasificación de visibilidad: Juntas directivas con teléfonos personales solo para administradores y la propia asociación
  const selectQuery = (scope.isAdmin || esPropia)
    ? `${SELECT_BASE}, association_board_members(id, position, full_name, email, phone, start_date, end_date)`
    : `${SELECT_PUBLIC}, association_board_members(id, position, full_name, start_date, end_date)`;

  const { data, error } = await supabase
    .from('associations')
    .select(selectQuery)
    .eq('id', req.params.id)
    .single();

  const err = fromSupabase(error, 'Asociacion');
  if (err) throw err;

  const [{ count: equipos }, { count: personas }] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('association_id', req.params.id),
    supabase.from('persons').select('id', { count: 'exact', head: true }).eq('association_id', req.params.id)
  ]);

  // Solo los cargos vigentes: los terminados quedan en la base (y en la bitácora) como historial.
  const junta = (data.association_board_members || []).filter((m) => !m.end_date);

  const extra = (scope.isAdmin || esPropia) ? (await resumenParaFecovol([req.params.id]))[req.params.id] : {};

  res.json({ data: { ...data, ...extra, association_board_members: junta, total_equipos: equipos || 0, total_personas: personas || 0 } });
}));

// POST /api/associations -> Crear / Afiliar asociación (función exclusiva de FECOVOL)
router.post('/', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (!scope.isAdmin) {
    await logDeniedAttempt({
      usuario: scope.userEmail || 'Anónimo',
      accion: 'ACCESO_DENEGADO',
      tabla: 'associations',
      motivo: 'Intento de crear/afiliar asociación sin permisos de Administrador de FECOVOL',
      endpoint: 'POST /api/associations',
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: Solo el personal de FECOVOL puede afiliar o registrar asociaciones.');
  }

  const { name, tax_id, province, canton, email, phone, short_name, address, home_venue, founded_date, status } = req.body;

  if (!name || !tax_id) throw new HttpError(400, 'name y tax_id son obligatorios');

  // La cédula jurídica se guarda como 3-101-123456, con o sin guiones al escribirla.
  const digitosCedula = String(tax_id).replace(/\D/g, '');
  if (digitosCedula.length !== 10) throw new HttpError(400, 'La cédula jurídica debe tener 10 dígitos (por ejemplo 3-002-123456).');
  const cedulaJuridica = `${digitosCedula[0]}-${digitosCedula.slice(1, 4)}-${digitosCedula.slice(4)}`;

  // Todo pasa por el procedimiento: valida duplicados y deja la operación en la bitácora. Si
  // falla, se informa el error (antes se insertaba directo en la tabla, sin bitácora ni validación).
  const { data: newId, error } = await supabase.rpc('sp_create_association', {
    p_name: name.trim(),
    p_tax_id: cedulaJuridica,
    p_province: province || null,
    p_canton: canton || null,
    p_email: email || null,
    p_phone: phone || null,
    p_admin_user: req.currentUser,
    p_short_name: short_name || null,
    p_address: address || null,
    p_home_venue: home_venue || null,
    p_founded_date: founded_date || null,
    p_status: status || 'AFILIADA'
  });

  const errCrear = fromSupabase(error, 'Asociación');
  if (errCrear) throw errCrear;

  const { data } = await supabase.from('associations').select(SELECT_BASE).eq('id', newId).single();
  res.status(201).json({ data });
}));

// PATCH /api/associations/:id -> Modificar datos de asociación (verifica ámbito de pertenencia)
router.patch('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'modificar datos de la asociación');

  // Si es Representante de Asociación, solo puede modificar su propia asociación
  if (scope.isAssociation && req.params.id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'associations',
      registroId: req.params.id,
      motivo: `Intento de modificar datos de otra asociación (${req.params.id}) fuera de su ámbito (${scope.organizationId})`,
      endpoint: `PATCH /api/associations/${req.params.id}`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar datos de otra asociación.');
  }

  const b = req.body;

  // Un representante de asociación no puede cambiar el estado de afiliación oficial, el nombre
  // legal ni la cédula jurídica: esos datos los define FECOVOL. (La cédula jurídica no se
  // modifica por esta vía para nadie: identifica a la asociación ante el registro oficial.)
  const nuevoStatus = scope.isAdmin ? (b.status ?? null) : null;
  const nuevoNombre = scope.isAdmin ? (b.name ?? null) : null;

  // Validación de suspensión / inactivación con dependencias (RF-AUD-002)
  if (scope.isAdmin && (b.status === 'SUSPENDIDA' || b.status === 'INACTIVA') && b.confirm_deactivation !== true) {
    const depMap = await getDependenciesForAssociations([req.params.id]);
    const deps = depMap[req.params.id] || { total: 0, teams: 0, persons: 0, board: 0, profiles: 0 };
    if (deps.total > 0) {
      return res.status(409).json({
        requires_confirmation: true,
        message: `Esta asociación cuenta con ${deps.total} registro(s) dependientes (${deps.teams} equipos, ${deps.persons} afiliados, ${deps.profiles} cuentas de usuario). Para preservar la consistencia histórica, confirme la suspensión.`,
        dependency_count: deps.total,
        dependencies: deps
      });
    }
  }

  const { error } = await supabase.rpc('sp_update_association', {
    p_id: req.params.id,
    p_admin_user: req.currentUser,
    p_name: nuevoNombre,
    p_short_name: b.short_name ?? null,
    p_province: b.province ?? null,
    p_canton: b.canton ?? null,
    p_address: b.address ?? null,
    p_email: b.email ?? null,
    p_phone: b.phone ?? null,
    p_website: b.website ?? null,
    p_home_venue: b.home_venue ?? null,
    p_status: nuevoStatus
  });

  const errActualizar = fromSupabase(error, 'Asociación');
  if (errActualizar) throw errActualizar;

  const { data } = await supabase.from('associations').select(SELECT_BASE).eq('id', req.params.id).single();
  res.json({ data });
}));

// GET /api/associations/:id/dependencies -> Consultar dependencias directas de una asociación (RF-AUD-002)
router.get('/:id/dependencies', asyncHandler(async (req, res) => {
  const depMap = await getDependenciesForAssociations([req.params.id]);
  const deps = depMap[req.params.id] || { total: 0, teams: 0, persons: 0, board: 0, profiles: 0, documents: 0 };
  res.json({ data: deps });
}));

// GET /api/associations/:id/teams -> Lista equipos de la asociación
router.get('/:id/teams', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (scope.isAssociation && req.params.id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'teams',
      registroId: req.params.id,
      motivo: `Intento de consultar equipos de otra asociación (${req.params.id})`,
      endpoint: `GET /api/associations/${req.params.id}/teams`,
      ip: getClientIp(req)
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar equipos de otra asociación.');
  }

  let query = supabase
    .from('teams')
    .select(`id, name, short_name, status, home_venue,
             categoria:catalog_values!teams_category_value_id_fkey(code, value),
             rama:catalog_values!teams_branch_value_id_fkey(code, value),
             modalidad:catalog_values!teams_modality_value_id_fkey(code, value)`)
    .eq('association_id', req.params.id)
    .order('name');

  if (scope.isPublic) {
    query = query.eq('status', 'ACTIVO');
  }

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/associations/:id/persons -> Lista personas afiliadas a la asociación
router.get('/:id/persons', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (scope.isAssociation && req.params.id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'persons',
      registroId: req.params.id,
      motivo: `Intento de consultar afiliados de otra asociación (${req.params.id})`,
      endpoint: `GET /api/associations/${req.params.id}/persons`,
      ip: getClientIp(req)
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar afiliados de otra asociación.');
  }

  // Clasificación de visibilidad: Oculta cédula y fecha de nacimiento a usuarios públicos
  const cols = !puedeVerPrivado(scope)
    ? 'id, first_name, last_name, is_verified, status, person_roles(role_type)'
    : 'id, first_name, last_name, document_number, birth_date, is_verified, status, person_roles(role_type)';

  let query = supabase
    .from('persons')
    .select(cols)
    .eq('association_id', req.params.id)
    .order('last_name');

  if (scope.isPublic) {
    query = query.eq('status', 'ACTIVA');
  }

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// POST /api/associations/:id/board -> Agrega cargo a junta directiva (verifica ámbito)
router.post('/:id/board', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'modificar la junta directiva');

  if (scope.isAssociation && req.params.id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'association_board_members',
      registroId: req.params.id,
      motivo: `Intento de registrar directivo en otra asociación (${req.params.id})`,
      endpoint: `POST /api/associations/${req.params.id}/board`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar la junta directiva de otra asociación.');
  }

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

// Carga un cargo de junta directiva y verifica que el usuario pueda modificarlo.
async function cargoGestionable(req, accion) {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };
  exigirGestion(scope, accion);

  const { data: cargo } = await supabase
    .from('association_board_members')
    .select('id, association_id, end_date')
    .eq('id', req.params.boardId)
    .maybeSingle();
  if (!cargo || cargo.end_date) throw new HttpError(404, 'El cargo no existe o ya no está vigente.');

  if (scope.isAssociation && cargo.association_id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'association_board_members',
      registroId: cargo.id,
      motivo: `Intento de modificar la junta directiva de otra asociación (${cargo.association_id})`,
      endpoint: `${req.method} /api/associations/board/${cargo.id}`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar la junta directiva de otra asociación.');
  }
  return cargo;
}

const textoOpcional = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

// PATCH /api/associations/board/:boardId -> Editar un cargo vigente
router.patch('/board/:boardId', asyncHandler(async (req, res) => {
  const cargo = await cargoGestionable(req, 'modificar la junta directiva');
  const b = req.body || {};
  const email = textoOpcional(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'El correo no es válido.');

  const { error } = await supabase.rpc('sp_update_board_member', {
    p_id: cargo.id,
    p_admin_user: req.currentUser,
    p_position: textoOpcional(b.position, 80) ?? null,
    p_full_name: textoOpcional(b.full_name, 150) ?? null,
    p_email: email ?? null,
    p_phone: textoOpcional(b.phone, 30) ?? null
  });
  const err = fromSupabase(error, 'Cargo');
  if (err) throw err;

  res.json({ data: { id: cargo.id } });
}));

// DELETE /api/associations/board/:boardId -> Da por terminado el cargo (no lo borra)
router.delete('/board/:boardId', asyncHandler(async (req, res) => {
  const cargo = await cargoGestionable(req, 'modificar la junta directiva');
  const { error } = await supabase.rpc('sp_end_board_member', { p_id: cargo.id, p_admin_user: req.currentUser });
  const err = fromSupabase(error, 'Cargo');
  if (err) throw err;
  res.json({ data: { id: cargo.id, terminado: true } });
}));

module.exports = router;
