const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');
const { puedeVerPrivado, exigirGestion, esDeOtraAsociacion } = require('../utils/ambito');

const router = express.Router();
router.param('id', validateUuidParams);

// Proyección administrativa completa (FECOVOL y Representante para su propia asociación)
const SELECT_PERSON = `id, document_number, first_name, last_name, birth_date, sex, nationality, province,
  email, phone, emergency_contact, is_verified, verified_at, status, association_id, created_at,
  tipo_documento:catalog_values!persons_document_type_value_id_fkey(code, value),
  asociacion:associations(id, name, short_name),
  person_roles(role_type, is_active)`;

// Proyección de visibilidad pública (RF-SEG-011 Criterio 2: Oculta datos personales sensibles en el origen)
const SELECT_PERSON_PUBLIC = `id, first_name, last_name, sex, nationality, province, status, association_id, created_at,
  asociacion:associations(id, name, short_name),
  person_roles(role_type, is_active)`;

// Quita los caracteres que PostgREST usa como sintaxis dentro de un filtro or().
const limpiarBusqueda = (q) => String(q).replace(/[,()*%\\:."']/g, ' ').trim();

// GET /api/persons?q=&association_id=&role=ARBITRO&status=
router.get('/', asyncHandler(async (req, res) => {
  const { association_id, role, status } = req.query;
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Selección de proyección según clasificación de visibilidad (RF-SEG-011)
  const baseProjection = puedeVerPrivado(scope) ? SELECT_PERSON : SELECT_PERSON_PUBLIC;

  // Con role se usa un join interno para filtrar en la base de datos y no en memoria.
  const select = role
    ? baseProjection.replace('person_roles(role_type, is_active)', 'person_roles!inner(role_type, is_active)')
    : baseProjection;

  let query = supabase.from('persons').select(select, { count: 'exact' }).order('last_name').limit(200);

  // Delimitación por Ámbito Organizacional (RF-SEG-011)
  if (scope.isAssociation) {
    if (association_id && association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'persons',
        motivo: `Intento de consultar afiliados de otra asociación (${association_id}) fuera de su ámbito (${scope.organizationId})`,
        endpoint: 'GET /api/persons',
        ip: getClientIp(req),
        datosIntentados: { association_id }
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar afiliados de otra asociación.');
    }
    // Fuerza el filtro de su asociación en la consulta
    query = query.eq('association_id', scope.organizationId);
  } else if (scope.isAdmin) {
    // FECOVOL: Alcance general
    if (association_id) query = query.eq('association_id', association_id);
  } else {
    // Ámbito PÚBLICO:
    if (association_id) query = query.eq('association_id', association_id);
    if (!status) query = query.eq('status', 'ACTIVA');
  }

  if (status) query = query.eq('status', status);
  if (role) query = query.eq('person_roles.role_type', role).eq('person_roles.is_active', true);

  if (q) {
    // Búsqueda delimitada por clasificación: el público NUNCA busca por número de cédula/documento
    if (!puedeVerPrivado(scope)) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    } else {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%`);
    }
  }

  const { data, error, count } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  // Equipos en los que participa cada persona (nómina activa), cuando se consulta una asociación
  // concreta con sesión: lo usa la pantalla "Personas" del representante.
  const asociacionConsultada = scope.isAssociation ? scope.organizationId : (scope.isAdmin ? association_id : null);
  if (asociacionConsultada && data.length) {
    const { data: nominas } = await supabase
      .from('team_members')
      .select('person_id, member_type, technical_role, equipo:teams!inner(id, name, short_name, association_id)')
      .eq('status', 'ACTIVO')
      .eq('equipo.association_id', asociacionConsultada);
    const porPersona = {};
    for (const n of nominas || []) {
      (porPersona[n.person_id] = porPersona[n.person_id] || []).push({
        id: n.equipo.id,
        name: n.equipo.name,
        short_name: n.equipo.short_name,
        member_type: n.member_type,
        technical_role: n.technical_role
      });
    }
    return res.json({ data: data.map((p) => ({ ...p, equipos: porPersona[p.id] || [] })), total: count ?? data.length });
  }

  res.json({ data, total: count ?? data.length });
}));

// GET /api/persons/:id -> Ficha de persona (verifica ámbito por ID y clasifica visibilidad - RF-SEG-011)
router.get('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Selección de proyección según clasificación
  const projection = puedeVerPrivado(scope) ? SELECT_PERSON : SELECT_PERSON_PUBLIC;

  const { data, error } = await supabase.from('persons').select(projection).eq('id', req.params.id).single();
  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  // Validación de acceso directo por ID para representantes de asociación (RF-SEG-011)
  if (esDeOtraAsociacion(scope, data.association_id)) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'persons',
      registroId: req.params.id,
      motivo: `Intento de acceso directo por ID a persona (${data.first_name} ${data.last_name}) de otra asociación (${data.association_id})`,
      endpoint: `GET /api/persons/${req.params.id}`,
      ip: getClientIp(req),
      datosIntentados: { id: req.params.id }
    });
    throw new HttpError(403, 'Acceso denegado: La persona solicitada no pertenece a su asociación.');
  }

  // Obtener equipos
  const { data: equipos } = await supabase
    .from('team_members')
    .select('id, member_type, jersey_number, status, equipo:teams(id, name)')
    .eq('person_id', req.params.id);

  // Clasificación de visibilidad: Documentos de respaldo (RF-SEG-011 Criterio 2)
  // "Un usuario público no obtiene datos personales ni documentos de respaldo por ninguna vía"
  let documentos = [];
  if (puedeVerPrivado(scope)) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, status, issue_date, expiry_date, file_name, tipo:catalog_values!documents_document_type_value_id_fkey(code, value)')
      .eq('person_id', req.params.id);
    documentos = docs || [];
  }

  res.json({ data: { ...data, equipos: equipos || [], documentos } });
}));

// POST /api/persons -> Registrar persona
router.post('/', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'registrar personas');

  const { document_type_code, document_number, first_name, last_name, birth_date } = req.body;

  if (!document_type_code || !document_number || !first_name || !last_name || !birth_date) {
    throw new HttpError(400, 'document_type_code, document_number, first_name, last_name y birth_date son obligatorios');
  }

  let targetAssociationId = req.body.association_id || null;

  // Delimitación por Ámbito Organizacional (RF-SEG-011)
  if (scope.isAssociation) {
    if (targetAssociationId && targetAssociationId !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'persons',
        motivo: `Intento de registrar persona asignándole otra asociación (${targetAssociationId})`,
        endpoint: 'POST /api/persons',
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para registrar personas en otra asociación.');
    }
    targetAssociationId = scope.organizationId;
  }

  const roles = req.body.roles && req.body.roles.length ? req.body.roles : ['JUGADOR'];
  const permitidos = ['JUGADOR', 'TECNICO', 'ARBITRO', 'OFICIAL'];
  if (roles.some((r) => !permitidos.includes(r))) {
    throw new HttpError(400, 'roles solo admite: ' + permitidos.join(', '));
  }

  // Una asociación no puede designar el rol ARBITRO u OFICIAL (función exclusiva de FECOVOL)
  if (scope.isAssociation && (roles.includes('ARBITRO') || roles.includes('OFICIAL'))) {
    throw new HttpError(403, 'Acceso denegado: La asignación de roles de Arbitraje u Oficialía corresponde exclusivamente a FECOVOL.');
  }

  const { data: id, error } = await supabase.rpc('sp_create_person', {
    p_document_type_code: document_type_code,
    p_document_number: document_number,
    p_first_name: first_name,
    p_last_name: last_name,
    p_birth_date: birth_date,
    p_admin_user: req.currentUser,
    p_sex: req.body.sex || null,
    p_association_id: targetAssociationId,
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

// PATCH /api/persons/:id -> Actualizar datos de persona
router.patch('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'modificar personas');

  // Validar pertenencia al ámbito antes de mutar
  const { data: personaActual } = await supabase
    .from('persons')
    .select('id, association_id, first_name, last_name, is_verified')
    .eq('id', req.params.id)
    .single();

  if (!personaActual) {
    throw new HttpError(404, 'Persona no encontrada.');
  }

  if (esDeOtraAsociacion(scope, personaActual.association_id)) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'persons',
      registroId: req.params.id,
      motivo: `Intento de modificar persona (${personaActual.first_name} ${personaActual.last_name}) perteneciente a otra asociación (${personaActual.association_id})`,
      endpoint: `PATCH /api/persons/${req.params.id}`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar personas de otra asociación.');
  }

  const b = req.body;
  // Con la identidad ya verificada por FECOVOL, el nombre, la fecha de nacimiento y el sexo solo
  // los corrige FECOVOL: si no, la verificación dejaría de corresponder al documento.
  const identidadLibre = scope.isAdmin || !personaActual.is_verified;

  const { error } = await supabase.rpc('sp_update_person', {
    p_id: req.params.id,
    p_admin_user: req.currentUser,
    p_first_name: identidadLibre ? (b.first_name ?? null) : null,
    p_last_name: identidadLibre ? (b.last_name ?? null) : null,
    p_birth_date: identidadLibre ? (b.birth_date ?? null) : null,
    p_sex: identidadLibre ? (b.sex ?? null) : null,
    p_email: b.email ?? null,
    p_phone: b.phone ?? null,
    p_province: b.province ?? null,
    p_emergency_contact: b.emergency_contact ?? null,
    // Suspender o inactivar a una persona es decisión de FECOVOL, no de la asociación.
    p_status: scope.isAdmin ? (b.status ?? null) : null
  });

  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  const { data } = await supabase.from('persons').select(SELECT_PERSON).eq('id', req.params.id).single();
  res.json({ data });
}));

// POST /api/persons/:id/verify -> FECOVOL confirma la identidad contra el documento oficial
router.post('/:id/verify', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Verificación de identidad es función exclusiva de FECOVOL
  if (!scope.isAdmin) {
    await logDeniedAttempt({
      usuario: scope.userEmail || 'Anónimo',
      accion: 'ACCESO_DENEGADO',
      tabla: 'persons',
      registroId: req.params.id,
      motivo: 'Intento de verificar identidad de persona sin permisos de FECOVOL',
      endpoint: `POST /api/persons/${req.params.id}/verify`,
      ip: getClientIp(req)
    });
    throw new HttpError(403, 'Acceso denegado: Solo el personal autorizado de FECOVOL puede verificar personas.');
  }

  const { error } = await supabase.rpc('sp_verify_person', {
    p_id: req.params.id,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error, 'Persona');
  if (err) throw err;

  res.json({ data: { id: req.params.id, is_verified: true } });
}));

// POST /api/persons/:id/roles -> Habilitar o deshabilitar rol de persona
router.post('/:id/roles', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'asignar roles');

  const { role_type } = req.body;
  const is_active = req.body.is_active !== false;
  const permitidos = ['JUGADOR', 'TECNICO', 'ARBITRO', 'OFICIAL'];
  if (!permitidos.includes(role_type)) throw new HttpError(400, 'role_type solo admite: ' + permitidos.join(', '));

  // Si es Asociación, validar pertenencia y restringir roles arbitrales
  if (scope.isAssociation) {
    if (['ARBITRO', 'OFICIAL'].includes(role_type)) {
      throw new HttpError(403, 'Acceso denegado: Solo FECOVOL puede administrar roles de arbitraje y oficialía.');
    }

    const { data: persona } = await supabase
      .from('persons')
      .select('id, association_id')
      .eq('id', req.params.id)
      .single();

    if (!persona || persona.association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'person_roles',
        registroId: req.params.id,
        motivo: 'Intento de modificar roles de una persona de otra asociación',
        endpoint: `POST /api/persons/${req.params.id}/roles`,
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar personas de otra asociación.');
    }
  }

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
