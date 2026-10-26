const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

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
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Clasificación de visibilidad (RF-SEG-011 Criterio 2):
  // "Un usuario público no obtiene datos personales ni documentos de respaldo por ninguna vía"
  if (scope.isPublic) {
    throw new HttpError(403, 'Acceso restringido: Los documentos y licencias son de carácter privado y no están disponibles para consulta pública.');
  }

  const { person_id, association_id, team_id, status, por_vencer } = req.query;

  // Delimitación por Ámbito Organizacional (RF-SEG-011)
  if (scope.isAssociation) {
    // Si solicita ver documentos de otra asociación
    if (association_id && association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'documents',
        motivo: `Intento de consultar documentos de otra asociación (${association_id}) fuera de su ámbito (${scope.organizationId})`,
        endpoint: 'GET /api/documents',
        ip: getClientIp(req),
        datosIntentados: { association_id }
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar documentos de otra asociación.');
    }

    // Si solicita documentos de un equipo, verificar que el equipo pertenezca a su asociación
    if (team_id) {
      const { data: equipo } = await supabase.from('teams').select('id, association_id').eq('id', team_id).single();
      if (!equipo || equipo.association_id !== scope.organizationId) {
        await logDeniedAttempt({
          usuario: scope.userEmail,
          accion: 'ACCESO_DENEGADO',
          tabla: 'documents',
          registroId: team_id,
          motivo: 'Intento de consultar documentos de un equipo de otra asociación',
          endpoint: 'GET /api/documents',
          ip: getClientIp(req),
          datosIntentados: { team_id }
        });
        throw new HttpError(403, 'Acceso denegado: El equipo indicado no pertenece a su asociación.');
      }
    }

    // Si solicita documentos de una persona, verificar que pertenezca a su asociación
    if (person_id) {
      const { data: persona } = await supabase.from('persons').select('id, association_id').eq('id', person_id).single();
      if (!persona || (persona.association_id && persona.association_id !== scope.organizationId)) {
        await logDeniedAttempt({
          usuario: scope.userEmail,
          accion: 'ACCESO_DENEGADO',
          tabla: 'documents',
          registroId: person_id,
          motivo: 'Intento de consultar documentos de una persona de otra asociación',
          endpoint: 'GET /api/documents',
          ip: getClientIp(req),
          datosIntentados: { person_id }
        });
        throw new HttpError(403, 'Acceso denegado: La persona indicada no pertenece a su asociación.');
      }
    }
  }

  let query = supabase.from('documents').select(SELECT_DOC).order('expiry_date', { nullsFirst: false });

  if (scope.isAssociation) {
    if (person_id) {
      query = query.eq('person_id', person_id);
    } else if (team_id) {
      query = query.eq('team_id', team_id);
    } else if (association_id) {
      query = query.eq('association_id', association_id);
    } else {
      // Si no especificó filtro, obtener documentos vinculados directamente a su asociación
      // y a los equipos de su asociación
      const { data: myTeams } = await supabase.from('teams').select('id').eq('association_id', scope.organizationId);
      const teamIds = (myTeams || []).map(t => t.id);

      if (teamIds.length > 0) {
        query = query.or(`association_id.eq.${scope.organizationId},team_id.in.(${teamIds.join(',')})`);
      } else {
        query = query.eq('association_id', scope.organizationId);
      }
    }
  } else {
    // FECOVOL (GLOBAL): Filtros libres
    if (person_id) query = query.eq('person_id', person_id);
    if (association_id) query = query.eq('association_id', association_id);
    if (team_id) query = query.eq('team_id', team_id);
  }

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

// POST /api/documents -> Subir documento (verifica pertenencia al ámbito del usuario)
router.post('/', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (scope.isPublic) {
    throw new HttpError(401, 'Acceso denegado: Se requiere autenticación para subir documentos.');
  }

  const { document_type_code, file_url, person_id, association_id, team_id } = req.body;

  if (!document_type_code || !file_url) throw new HttpError(400, 'document_type_code y file_url son obligatorios');

  const duenos = [person_id, association_id, team_id].filter(Boolean);
  if (duenos.length !== 1) throw new HttpError(400, 'Indique exactamente uno: person_id, association_id o team_id');

  // Delimitación por Ámbito Organizacional (RF-SEG-011)
  if (scope.isAssociation) {
    if (association_id && association_id !== scope.organizationId) {
      await logDeniedAttempt({
        usuario: scope.userEmail,
        accion: 'ACCESO_DENEGADO',
        tabla: 'documents',
        motivo: `Intento de subir documento a otra asociación (${association_id})`,
        endpoint: 'POST /api/documents',
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(403, 'Acceso denegado: No está autorizado para subir documentos de otra asociación.');
    }

    if (team_id) {
      const { data: equipo } = await supabase.from('teams').select('id, association_id').eq('id', team_id).single();
      if (!equipo || equipo.association_id !== scope.organizationId) {
        await logDeniedAttempt({
          usuario: scope.userEmail,
          accion: 'ACCESO_DENEGADO',
          tabla: 'documents',
          registroId: team_id,
          motivo: 'Intento de subir documento a equipo de otra asociación',
          endpoint: 'POST /api/documents',
          ip: getClientIp(req),
          datosIntentados: req.body
        });
        throw new HttpError(403, 'Acceso denegado: El equipo no pertenece a su asociación.');
      }
    }

    if (person_id) {
      const { data: persona } = await supabase.from('persons').select('id, association_id').eq('id', person_id).single();
      if (!persona || (persona.association_id && persona.association_id !== scope.organizationId)) {
        await logDeniedAttempt({
          usuario: scope.userEmail,
          accion: 'ACCESO_DENEGADO',
          tabla: 'documents',
          registroId: person_id,
          motivo: 'Intento de subir documento a persona de otra asociación',
          endpoint: 'POST /api/documents',
          ip: getClientIp(req),
          datosIntentados: req.body
        });
        throw new HttpError(403, 'Acceso denegado: La persona no pertenece a su asociación.');
      }
    }
  }

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

// PATCH /api/documents/:id/review -> FECOVOL aprueba o rechaza (exclusivo FECOVOL)
router.patch('/:id/review', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // Revisión de documentos es potestad exclusiva de FECOVOL
  if (!scope.isAdmin) {
    await logDeniedAttempt({
      usuario: scope.userEmail || 'Anónimo',
      accion: 'ACCESO_DENEGADO',
      tabla: 'documents',
      registroId: req.params.id,
      motivo: 'Intento de aprobar o rechazar documento sin permisos de FECOVOL',
      endpoint: `PATCH /api/documents/${req.params.id}/review`,
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(403, 'Acceso denegado: Solo el personal autorizado de FECOVOL puede revisar y dictaminar documentos.');
  }

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

// POST /api/documents/expire -> Marca como vencidos los que ya pasaron su fecha (exclusivo FECOVOL)
router.post('/expire', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (!scope.isAdmin) {
    throw new HttpError(403, 'Acceso denegado: Operación reservada para administración de FECOVOL.');
  }

  const { data, error } = await supabase.rpc('sp_expire_documents');
  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data: { vencidos: data } });
}));

module.exports = router;
