// Documentos y licencias (RF-ASO-005, RF-SEG-011).
//
// Los archivos viven en el bucket privado `documentos` de Supabase Storage. El navegador nunca
// lee ni escribe el bucket directo: sube el archivo a este backend, que revisa sesión, ámbito,
// tamaño y tipo real, y para verlo pide un enlace firmado que vence en minutos.
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');
const { puedeVerPrivado, exigirGestion } = require('../utils/ambito');
const { detectarTipo, nombreSeguro, limitesDeArchivos, TOPE_MB } = require('../utils/archivos');

const router = express.Router();
router.param('id', validateUuidParams);

const BUCKET = 'documentos';
const PREFIJO = `storage://${BUCKET}/`;
const VIGENCIA_ENLACE_S = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO_TIPO = /^[A-Z]{2,10}$/;
const ESTADOS = ['EN_REVISION', 'VIGENTE', 'RECHAZADO', 'VENCIDO'];

const COLUMNAS = `id, file_url, file_name, issue_date, expiry_date, status, notes, uploaded_by,
  reviewed_by, reviewed_at, created_at, person_id, team_id, association_id, owner_association_id,
  tipo_code, tipo_value, persona_first_name, persona_last_name, equipo_name, asociacion_name`;

// La ruta interna del archivo no sale del backend: el cliente solo sabe si hay archivo.
function aDocumento(f) {
  return {
    id: f.id,
    file_name: f.file_name,
    tiene_archivo: Boolean(f.file_url),
    issue_date: f.issue_date,
    expiry_date: f.expiry_date,
    status: f.status,
    notes: f.notes,
    uploaded_by: f.uploaded_by,
    reviewed_by: f.reviewed_by,
    reviewed_at: f.reviewed_at,
    created_at: f.created_at,
    tipo: { code: f.tipo_code, value: f.tipo_value },
    persona: f.person_id ? { id: f.person_id, first_name: f.persona_first_name, last_name: f.persona_last_name } : null,
    equipo: f.team_id ? { id: f.team_id, name: f.equipo_name } : null,
    asociacion: f.owner_association_id ? { id: f.owner_association_id, name: f.asociacion_name } : null,
    titular: f.person_id ? 'PERSONA' : f.team_id ? 'EQUIPO' : 'ASOCIACION'
  };
}

function fechaValida(texto) {
  if (!FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

async function denegar(req, scope, motivo, registroId = null) {
  await logDeniedAttempt({
    usuario: scope.userEmail || 'Anónimo',
    accion: 'ACCESO_DENEGADO',
    tabla: 'documents',
    registroId,
    motivo,
    endpoint: `${req.method} ${req.baseUrl}${req.path}`,
    ip: getClientIp(req),
    datosIntentados: req.method === 'GET' ? req.query : { ...req.body, archivo: req.file?.originalname }
  });
}

// Asociación dueña del titular (persona, equipo o asociación). undefined si el titular no existe.
async function asociacionDelTitular({ person_id, team_id, association_id }) {
  if (association_id) {
    const { data } = await supabase.from('associations').select('id').eq('id', association_id).maybeSingle();
    return data ? data.id : undefined;
  }
  const tabla = team_id ? 'teams' : 'persons';
  const { data } = await supabase.from(tabla).select('id, association_id').eq('id', team_id || person_id).maybeSingle();
  return data ? data.association_id : undefined;
}

/* ----------------------------------------------------------------------------------------------
   GET /api/documents?person_id=&association_id=&team_id=&status=&por_vencer=30
   ---------------------------------------------------------------------------------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  // RF-SEG-011: el público no obtiene documentos de respaldo por ninguna vía.
  if (!puedeVerPrivado(scope)) {
    throw new HttpError(403, 'Acceso restringido: Los documentos y licencias son de carácter privado y no están disponibles para consulta pública.');
  }

  const { person_id, association_id, team_id, status, por_vencer } = req.query;
  for (const [nombre, valor] of Object.entries({ person_id, association_id, team_id })) {
    if (valor !== undefined && !UUID.test(String(valor))) throw new HttpError(400, `${nombre} debe ser un UUID valido`);
  }
  if (status !== undefined && !ESTADOS.includes(status)) throw new HttpError(400, 'status solo admite: ' + ESTADOS.join(', '));
  const dias = por_vencer === undefined ? null : Number(por_vencer);
  if (dias !== null && (!Number.isInteger(dias) || dias < 0 || dias > 365)) {
    throw new HttpError(400, 'por_vencer debe ser un número de días entre 0 y 365');
  }

  if (scope.isAssociation && association_id && association_id !== scope.organizationId) {
    await denegar(req, scope, `Intento de consultar documentos de otra asociación (${association_id}) fuera de su ámbito (${scope.organizationId})`);
    throw new HttpError(403, 'Acceso denegado: No está autorizado para consultar documentos de otra asociación.');
  }

  let query = supabase.from('v_documentos').select(COLUMNAS).order('expiry_date', { nullsFirst: false });

  // Un representante solo ve documentos cuyo dueño final es su asociación: los de la asociación,
  // los de sus equipos y los de sus personas. Si filtra por un equipo o persona ajenos, la lista
  // sale vacía.
  if (scope.isAssociation) query = query.eq('owner_association_id', scope.organizationId);
  if (person_id) query = query.eq('person_id', person_id);
  if (team_id) query = query.eq('team_id', team_id);
  if (association_id) query = query.eq('owner_association_id', association_id);
  if (status) query = query.eq('status', status);
  if (dias !== null) {
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    query = query.lte('expiry_date', limite.toISOString().slice(0, 10)).eq('status', 'VIGENTE');
  }

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  const documentos = (data || []).map(aDocumento);
  res.json({ data: documentos, total: documentos.length });
}));

/* ----------------------------------------------------------------------------------------------
   POST /api/documents  (multipart/form-data)
   Campos: archivo (PDF, JPG o PNG), document_type_code, uno de person_id | team_id |
   association_id, y opcionales issue_date y expiry_date (AAAA-MM-DD).
   ---------------------------------------------------------------------------------------------- */
const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TOPE_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 1024, parts: 12 }
}).single('archivo');

function subida(req, res, next) {
  recibirArchivo(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `El archivo supera el máximo de ${TOPE_MB} MB.`));
      return next(new HttpError(400, 'El formulario de carga no es válido: adjunte un solo archivo en el campo "archivo".'));
    }
    next(err);
  });
}

// Permiso antes de recibir el archivo: sin sesión de gestión no se carga nada en memoria.
function soloGestion(req, res, next) {
  try {
    exigirGestion(req.userScope, 'subir documentos');
    next();
  } catch (err) {
    next(err);
  }
}

router.post('/', soloGestion, subida, asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  const b = req.body || {};
  const tipoCodigo = typeof b.document_type_code === 'string' ? b.document_type_code.trim().toUpperCase() : '';
  if (!CODIGO_TIPO.test(tipoCodigo)) throw new HttpError(400, 'Indique el tipo de documento.');

  const titular = { person_id: b.person_id || null, team_id: b.team_id || null, association_id: b.association_id || null };
  const indicados = Object.values(titular).filter(Boolean);
  if (indicados.length !== 1) throw new HttpError(400, 'Indique exactamente uno: person_id, association_id o team_id');
  if (!UUID.test(indicados[0])) throw new HttpError(400, 'El titular del documento no es un identificador válido.');

  const emision = b.issue_date || null;
  const vencimiento = b.expiry_date || null;
  if (emision && !fechaValida(emision)) throw new HttpError(400, 'La fecha de emisión no es válida (AAAA-MM-DD).');
  if (vencimiento && !fechaValida(vencimiento)) throw new HttpError(400, 'La fecha de vencimiento no es válida (AAAA-MM-DD).');
  if (emision && vencimiento && vencimiento < emision) throw new HttpError(400, 'La fecha de vencimiento no puede ser anterior a la de emisión.');

  // Ámbito: el titular tiene que existir y, para un representante, ser de su asociación.
  const dueno = await asociacionDelTitular(titular);
  if (dueno === undefined) throw new HttpError(404, 'El titular del documento no existe.');
  if (scope.isAssociation && dueno !== scope.organizationId) {
    await denegar(req, scope, `Intento de subir un documento a un titular fuera de su asociación (${dueno || 'sin asociación'})`, indicados[0]);
    throw new HttpError(403, 'Acceso denegado: El titular del documento no pertenece a su asociación.');
  }

  // El tipo tiene que existir y estar activo en el catálogo.
  const { data: tipoDoc } = await supabase
    .from('catalog_values')
    .select('id, is_active, catalogs!inner(name)')
    .eq('catalogs.name', 'Tipos de documento')
    .eq('code', tipoCodigo)
    .maybeSingle();
  if (!tipoDoc || tipoDoc.is_active === false) throw new HttpError(400, 'El tipo de documento no es válido.');

  // Archivo: tamaño y formato según los parámetros del sistema, y tipo según su contenido real.
  if (!req.file?.buffer?.length) throw new HttpError(400, 'Adjunte el archivo del documento.');
  const { maximoMb, formatos } = await limitesDeArchivos();
  if (req.file.size > maximoMb * 1024 * 1024) throw new HttpError(413, `El archivo supera el máximo de ${maximoMb} MB.`);
  const tipo = detectarTipo(req.file.buffer);
  if (!tipo || !formatos.includes(tipo.formato)) {
    throw new HttpError(415, `Formato no permitido. Se aceptan: ${formatos.join(', ')}.`);
  }

  const carpeta = titular.person_id ? 'personas' : titular.team_id ? 'equipos' : 'asociaciones';
  const ruta = `${carpeta}/${indicados[0]}/${crypto.randomUUID()}.${tipo.extension}`;
  const nombre = nombreSeguro(req.file.originalname, tipo.extension);

  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(ruta, req.file.buffer, {
    contentType: tipo.mime,
    upsert: false,
    cacheControl: '0'
  });
  if (errSubida) {
    console.error('[documentos] no se pudo guardar el archivo en Storage:', errSubida.message || errSubida);
    throw new HttpError(503, 'No fue posible guardar el archivo en este momento. Intente de nuevo.');
  }

  const { data: id, error } = await supabase.rpc('sp_upload_document', {
    p_document_type_code: tipoCodigo,
    p_file_url: PREFIJO + ruta,
    p_admin_user: req.currentUser,
    p_person_id: titular.person_id,
    p_association_id: titular.association_id,
    p_team_id: titular.team_id,
    p_file_name: nombre,
    p_issue_date: emision,
    p_expiry_date: vencimiento
  });

  const err = fromSupabase(error, 'Documento');
  if (err) {
    // El registro no se creó: no dejar el archivo huérfano en el bucket.
    await supabase.storage.from(BUCKET).remove([ruta]).catch(() => {});
    throw err;
  }

  const { data } = await supabase.from('v_documentos').select(COLUMNAS).eq('id', id).maybeSingle();
  res.status(201).json({ data: data ? aDocumento(data) : { id } });
}));

/* ----------------------------------------------------------------------------------------------
   GET /api/documents/:id/archivo -> enlace firmado que vence en dos minutos
   ---------------------------------------------------------------------------------------------- */
router.get('/:id/archivo', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };
  if (!puedeVerPrivado(scope)) {
    throw new HttpError(403, 'Acceso restringido: Los documentos y licencias son de carácter privado.');
  }

  const { data: doc, error } = await supabase
    .from('v_documentos')
    .select('id, file_url, file_name, owner_association_id')
    .eq('id', req.params.id)
    .maybeSingle();
  const err = fromSupabase(error, 'Documento');
  if (err) throw err;
  if (!doc) throw new HttpError(404, 'Documento no encontrado');

  if (scope.isAssociation && doc.owner_association_id !== scope.organizationId) {
    await denegar(req, scope, `Intento de abrir un documento de otra asociación (${doc.owner_association_id || 'sin asociación'})`, doc.id);
    throw new HttpError(403, 'Acceso denegado: El documento no pertenece a su asociación.');
  }

  res.set('Cache-Control', 'no-store');

  if (typeof doc.file_url === 'string' && doc.file_url.startsWith(PREFIJO)) {
    const ruta = doc.file_url.slice(PREFIJO.length);
    const { data: firmado, error: errFirma } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, VIGENCIA_ENLACE_S, { download: doc.file_name || true });
    if (errFirma || !firmado?.signedUrl) {
      console.error('[documentos] no se pudo firmar el enlace:', errFirma?.message || errFirma);
      throw new HttpError(503, 'No fue posible abrir el archivo en este momento.');
    }
    return res.json({ data: { url: firmado.signedUrl, vence_en_segundos: VIGENCIA_ENLACE_S, file_name: doc.file_name } });
  }

  // Documentos cargados antes de Storage, con un enlace externo https.
  if (typeof doc.file_url === 'string' && /^https:\/\//i.test(doc.file_url)) {
    return res.json({ data: { url: doc.file_url, vence_en_segundos: null, file_name: doc.file_name } });
  }

  throw new HttpError(404, 'El documento no tiene un archivo disponible.');
}));

/* ----------------------------------------------------------------------------------------------
   PATCH /api/documents/:id/review -> FECOVOL aprueba o rechaza (exclusivo FECOVOL)
   ---------------------------------------------------------------------------------------------- */
router.patch('/:id/review', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };

  if (!scope.isAdmin) {
    await denegar(req, scope, 'Intento de aprobar o rechazar documento sin permisos de FECOVOL', req.params.id);
    throw new HttpError(403, 'Acceso denegado: Solo el personal autorizado de FECOVOL puede revisar y dictaminar documentos.');
  }

  const { status, notes } = req.body;
  const permitidos = ['VIGENTE', 'RECHAZADO', 'VENCIDO'];
  if (!permitidos.includes(status)) throw new HttpError(400, 'status solo admite: ' + permitidos.join(', '));
  if (status === 'RECHAZADO' && !(typeof notes === 'string' && notes.trim())) {
    throw new HttpError(400, 'Indique el motivo del rechazo para que la asociación pueda corregirlo.');
  }

  const { error } = await supabase.rpc('sp_review_document', {
    p_id: req.params.id,
    p_status: status,
    p_admin_user: req.currentUser,
    p_notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : null
  });

  const err = fromSupabase(error, 'Documento');
  if (err) throw err;

  const { data } = await supabase.from('v_documentos').select(COLUMNAS).eq('id', req.params.id).maybeSingle();
  res.json({ data: data ? aDocumento(data) : null });
}));

/* ----------------------------------------------------------------------------------------------
   POST /api/documents/expire -> marca como vencidos los que ya pasaron su fecha (FECOVOL)
   ---------------------------------------------------------------------------------------------- */
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
