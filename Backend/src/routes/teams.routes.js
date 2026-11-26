const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { motivoNoElegible } = require('../utils/elegibilidadSeleccion');
const { hoyCR } = require('../utils/arbitraje');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');
const { puedeVerPrivado, exigirGestion, esDeOtraAsociacion } = require('../utils/ambito');

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
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  let query = supabase.from('teams').select(SELECT_TEAM).order('name');

  // Delimitación por Ámbito Organizacional (RF-SEG-011)
  if (scope.isAssociation) {
    // Si intenta consultar explícitamente otra asociación distinta a la suya
    if (association_id && association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'teams',
        motivo: `Intento de consultar equipos de otra asociación (${association_id}) fuera de su ámbito (${scope.organizationId})`,
        endpoint: 'GET /api/teams',
        ip: getClientIp(req),
        datosIntentados: { association_id }
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar equipos de otra asociación.');
    }
    // Fuerza el filtro de su propia organización en la consulta a la BD
    query = query.eq('association_id', scope.organizationId);
  } else if (scope.isAdmin) {
    // FECOVOL: Alcance general, permite filtrar si se indica
    if (association_id) query = query.eq('association_id', association_id);
  } else {
    // Ámbito PÚBLICO: Puede consultar equipos activos para divulgación pública
    if (association_id) query = query.eq('association_id', association_id);
    if (!status) query = query.eq('status', 'ACTIVO');
  }

  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('name', `%${String(q).replace(/[%_\\]/g, ' ').trim().slice(0, 80)}%`);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  // Con sesión (FECOVOL o la propia asociación) se agrega cuántos integrantes activos tiene cada
  // equipo: lo usan "Mis equipos" y el panel del representante.
  if (puedeVerPrivado(scope) && data.length) {
    const { data: miembros } = await supabase
      .from('team_members')
      .select('team_id, member_type')
      .in('team_id', data.map((t) => t.id))
      .eq('status', 'ACTIVO');
    const conteo = {};
    for (const m of miembros || []) {
      conteo[m.team_id] = conteo[m.team_id] || { jugadores: 0, tecnicos: 0 };
      if (m.member_type === 'JUGADOR') conteo[m.team_id].jugadores += 1;
      else conteo[m.team_id].tecnicos += 1;
    }
    return res.json({ data: data.map((t) => ({ ...t, ...(conteo[t.id] || { jugadores: 0, tecnicos: 0 }) })) });
  }

  res.json({ data });
}));

// GET /api/teams/:id -> Detalle del equipo (verifica ámbito directo por ID - RF-SEG-011)
router.get('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  const { data, error } = await supabase.from('teams').select(SELECT_TEAM).eq('id', req.params.id).single();
  const err = fromSupabase(error, 'Equipo');
  if (err) throw err;

  // Validación de acceso directo por ID (RF-SEG-011 Criterio 1 y 2)
  if (scope.isAssociation && data.association_id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'teams',
      registroId: req.params.id,
      motivo: `Intento de acceso directo por ID a equipo (${data.name}) de otra asociación (${data.association_id})`,
      endpoint: `GET /api/teams/${req.params.id}`,
      ip: getClientIp(req),
      datosIntentados: { id: req.params.id, equipo: data.name }
    });
    throw new HttpError(403, 'Acceso denegado: El equipo solicitado no pertenece a su asociación.');
  }

  res.json({ data });
}));

// POST /api/teams -> Crear equipo (solo dentro de su ámbito)
router.post('/', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'registrar equipos');

  let targetAssociationId = req.body.association_id;

  // Si es Representante de Asociación, debe registrar dentro de su propia organización
  if (scope.isAssociation) {
    if (targetAssociationId && targetAssociationId !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'teams',
        motivo: `Intento de registrar equipo en asociación ajena (${targetAssociationId})`,
        endpoint: 'POST /api/teams',
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para registrar equipos en otra asociación.');
    }
    targetAssociationId = scope.organizationId;
  }

  const { name, category_code, branch_code, modality_code } = req.body;

  if (!targetAssociationId || !name || !category_code || !branch_code || !modality_code) {
    throw new HttpError(400, 'association_id, name, category_code, branch_code y modality_code son obligatorios');
  }

  const { data: id, error } = await supabase.rpc('sp_create_team', {
    p_association_id: targetAssociationId,
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

// PATCH /api/teams/:id -> Modificar equipo (verifica pertenencia al ámbito)
router.patch('/:id', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'modificar equipos');

  // Verificar pertenencia del equipo antes de mutar
  const { data: equipoActual } = await supabase
    .from('teams')
    .select('id, association_id, name')
    .eq('id', req.params.id)
    .single();

  if (!equipoActual) {
    throw new HttpError(404, 'Equipo no encontrado.');
  }

  if (scope.isAssociation && equipoActual.association_id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'teams',
      registroId: req.params.id,
      motivo: `Intento de modificar equipo (${equipoActual.name}) perteneciente a otra asociación (${equipoActual.association_id})`,
      endpoint: `PATCH /api/teams/${req.params.id}`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar equipos de otra asociación.');
  }

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

// GET /api/teams/:id/members -> Nómina del equipo (restringe datos sensibles a usuarios públicos)
router.get('/:id/members', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Verificar pertenencia del equipo
  const { data: equipo } = await supabase
    .from('teams')
    .select('id, association_id, name')
    .eq('id', req.params.id)
    .single();

  if (!equipo) {
    throw new HttpError(404, 'Equipo no encontrado.');
  }

  if (scope.isAssociation && equipo.association_id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'team_members',
      registroId: req.params.id,
      motivo: `Intento de consultar nómina de equipo (${equipo.name}) de otra asociación (${equipo.association_id})`,
      endpoint: `GET /api/teams/${req.params.id}/members`,
      ip: getClientIp(req),
      datosIntentados: { team_id: req.params.id }
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar la nómina de este equipo.');
  }

  const incluirBajas = req.query.incluir_bajas === 'true';

  // Clasificación de visibilidad (RF-SEG-011 Criterio 2):
  // Si la petición es PÚBLICA, nunca expone document_number ni birth_date en el select de BD
  const personSelect = !puedeVerPrivado(scope)
    ? 'persona:persons!team_members_person_id_fkey(id, first_name, last_name, is_verified)'
    : 'persona:persons!team_members_person_id_fkey(id, first_name, last_name, document_number, birth_date, is_verified)';

  let query = supabase
    .from('team_members')
    .select(`id, member_type, technical_role, jersey_number, start_date, end_date, status,
             posicion:catalog_values!team_members_position_value_id_fkey(code, value),
             ${personSelect}`)
    .eq('team_id', req.params.id)
    .order('jersey_number', { nullsFirst: false });

  if (!incluirBajas) query = query.eq('status', 'ACTIVO');

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data, total: data.length });
}));

// POST /api/teams/:id/members -> Agregar integrante a la nómina
router.post('/:id/members', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'inscribir integrantes');

  // Verificar pertenencia del equipo
  const { data: equipo } = await supabase
    .from('teams')
    .select(`id, association_id, name,
      categoria:catalog_values!teams_category_value_id_fkey(code, value),
      rama:catalog_values!teams_branch_value_id_fkey(code, value)`)
    .eq('id', req.params.id)
    .single();

  if (!equipo) throw new HttpError(404, 'Equipo no encontrado.');

  if (scope.isAssociation && equipo.association_id !== scope.organizationId) {
    await logDeniedAttempt({
      usuario: scope.userEmail,
      accion: 'ACCESO_DENEGADO',
      tabla: 'team_members',
      registroId: req.params.id,
      motivo: `Intento de agregar miembros a equipo (${equipo.name}) de otra asociación`,
      endpoint: `POST /api/teams/${req.params.id}/members`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: No está autorizado para inscribir miembros en un equipo de otra asociación.');
  }

  const { person_id, member_type, position_code, technical_role, jersey_number } = req.body;

  if (!person_id || !member_type) throw new HttpError(400, 'person_id y member_type son obligatorios');
  if (!['JUGADOR', 'TECNICO'].includes(member_type)) throw new HttpError(400, 'member_type debe ser JUGADOR o TECNICO');

  // Si es Asociación, verificar que la persona a inscribir pertenezca a su asociación o no tenga otra asociación asignada
  if (scope.isAssociation) {
    const { data: persona } = await supabase.from('persons').select('id, association_id, first_name, last_name').eq('id', person_id).single();
    if (!persona || persona.association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'team_members',
        registroId: person_id,
        motivo: `Intento de inscribir a una persona fuera de su asociación (${persona?.association_id || 'sin asociación o inexistente'})`,
        endpoint: `POST /api/teams/${req.params.id}/members`,
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(403, 'Acceso denegado: La persona seleccionada pertenece a otra asociación.');
    }
  }

  // La persona tiene que estar registrada con ese rol en el padrón y, si es atleta, corresponder a
  // la categoría (edad) y la rama del equipo. Mismas reglas que las selecciones nacionales.
  const { data: candidata } = await supabase
    .from('persons')
    .select('id, birth_date, sex, person_roles(role_type, is_active)')
    .eq('id', person_id)
    .maybeSingle();
  if (!candidata) throw new HttpError(404, 'La persona no existe en el padrón.');
  const tieneRol = (candidata.person_roles || []).some((r) => r.is_active && r.role_type === member_type);
  if (!tieneRol) {
    throw new HttpError(409, member_type === 'JUGADOR'
      ? 'La persona no está registrada como atleta en el padrón.'
      : 'La persona no está registrada como cuerpo técnico en el padrón.');
  }
  if (member_type === 'JUGADOR') {
    const motivo = motivoNoElegible(candidata, { rama: equipo.rama, categoria: equipo.categoria, fechaReferencia: hoyCR() });
    if (motivo) throw new HttpError(409, motivo.replace('de esta selección', 'de este equipo'));
  }

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

// DELETE /api/teams/members/:memberId -> Dar de baja al integrante
router.delete('/members/:memberId', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  exigirGestion(scope, 'dar de baja integrantes');

  // Si es Asociación, verificar que el integrante pertenezca a un equipo de su organización
  if (scope.isAssociation) {
    const { data: member } = await supabase
      .from('team_members')
      .select('id, team:teams!inner(association_id)')
      .eq('id', req.params.memberId)
      .maybeSingle();

    if (!member?.team || member.team.association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'team_members',
        registroId: req.params.memberId,
        motivo: 'Intento de dar de baja a un integrante de un equipo de otra asociación',
        endpoint: `DELETE /api/teams/members/${req.params.memberId}`,
        ip: getClientIp(req),
        datosIntentados: { memberId: req.params.memberId }
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para modificar integrantes de otra asociación.');
    }
  }

  const { error } = await supabase.rpc('sp_remove_team_member', {
    p_id: req.params.memberId,
    p_admin_user: req.currentUser
  });

  const err = fromSupabase(error, 'Integrante');
  if (err) throw err;

  res.json({ data: { id: req.params.memberId, status: 'BAJA' } });
}));

module.exports = router;
