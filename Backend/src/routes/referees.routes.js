// Arbitraje: acreditaciones del cuerpo arbitral y cursos (montado en /api/referees).
// Todo el módulo es del panel de administración (requiere sesión de Administrador).
//
// El estado de una acreditación no se guarda, se calcula con la fecha de vencimiento:
//   VENCIDA     valid_until < hoy
//   POR_VENCER  vence en los próximos DIAS_AVISO días
//   AL_DIA      vence después de eso
const crypto = require('crypto');
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('enrollmentId', validateUuidParams);
router.use(requireAdmin);

const DIAS_AVISO = 30;
const DIAS_COBERTURA = 7;
const POR_PAGINA = 20;
const OFICIALES_COMPLETOS = 4;

const BUCKET = 'referee-documents';
const TAMANO_MAX_ARCHIVO = 10 * 1024 * 1024;
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const RUTA_ARCHIVO = /^acreditaciones\/\d{4}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ESTADOS = ['AL_DIA', 'POR_VENCER', 'VENCIDA'];
const MODALIDADES = ['SALA', 'PLAYA', 'SALA_PLAYA'];
const EVALUACIONES = ['APROBADA', 'REPROBADA', 'PENDIENTE'];
const TIPOS_CURSO = ['FORMACION_INICIAL', 'ACTUALIZACION_ANUAL', 'ASCENSO_NIVEL'];
const FORMATOS = ['PRESENCIAL', 'VIRTUAL', 'MIXTO'];
const ASIGNACION_VALIDA = ['PROPUESTA', 'CONFIRMADA', 'CUMPLIDA'];

const CATALOGOS = {
  funciones: 'Tipos de oficial',
  niveles: 'Niveles arbitrales',
  categorias: 'Categorías',
  modalidades: 'Modalidades'
};

const SELECT_ACREDITACION = `id, person_id, modality, valid_from, valid_until, status, notes,
  practical_evaluation, physical_test, course_enrollment_id, created_at,
  funcion:catalog_values!referee_accreditations_function_value_id_fkey(code, value),
  nivel:catalog_values!referee_accreditations_level_value_id_fkey(code, value),
  categoria:catalog_values!referee_accreditations_category_value_id_fkey(code, value),
  certificado:documents!referee_accreditations_certificate_document_id_fkey(id, file_url, file_name, status),
  constancia:documents!referee_accreditations_medical_document_id_fkey(id, file_url, file_name, status, expiry_date)`;

const SELECT_PERSONA = `id, first_name, last_name, document_number, province, email, phone, created_at,
  asociacion:associations(id, name)`;

const SELECT_CURSO = `id, name, course_type, format, start_date, end_date, venue, capacity, passing_grade,
  content, enrollment_opens, enrollment_closes, enrollment_open, only_current_accreditation, status,
  modalidad:catalog_values!referee_courses_modality_value_id_fkey(code, value),
  instructor:persons!referee_courses_instructor_person_id_fkey(id, first_name, last_name)`;

// ---------- utilidades ----------

function lanzar(error, contexto) {
  const err = fromSupabase(error, contexto);
  if (err) throw err;
}

// Fecha de hoy en Costa Rica (YYYY-MM-DD).
function hoy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function esFecha(valor) {
  if (typeof valor !== 'string' || !FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function estadoDe(validUntil, fechaHoy = hoy()) {
  if (validUntil < fechaHoy) return 'VENCIDA';
  if (validUntil <= sumarDias(fechaHoy, DIAS_AVISO)) return 'POR_VENCER';
  return 'AL_DIA';
}

const nombreCompleto = (p) => (p ? `${p.first_name} ${p.last_name}`.trim() : '');

// Quita los caracteres que PostgREST usa como sintaxis dentro de un filtro or().
const limpiarBusqueda = (q) => String(q).replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

function texto(valor, max, campo, { obligatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new HttpError(400, `${campo} es obligatorio`);
    return null;
  }
  if (typeof valor !== 'string') throw new HttpError(400, `${campo} debe ser texto`);
  const limpio = valor.trim();
  if (!limpio && obligatorio) throw new HttpError(400, `${campo} es obligatorio`);
  if (limpio.length > max) throw new HttpError(400, `${campo} admite como máximo ${max} caracteres`);
  return limpio || null;
}

function fecha(valor, campo, { obligatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new HttpError(400, `${campo} es obligatoria`);
    return null;
  }
  if (!esFecha(valor)) throw new HttpError(400, `${campo} debe tener el formato AAAA-MM-DD`);
  return valor;
}

function opcion(valor, permitidas, campo) {
  if (!permitidas.includes(valor)) throw new HttpError(400, `${campo} solo admite: ${permitidas.join(', ')}`);
  return valor;
}

function uuidOpcional(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !UUID.test(valor)) throw new HttpError(400, `${campo} no es un identificador válido`);
  return valor;
}

// Id de un valor de catálogo por nombre de catálogo y código (null si no existe o está inactivo).
async function idCatalogo(catalogo, codigo) {
  const { data, error } = await supabase
    .from('catalog_values')
    .select('id, catalogs!inner(name)')
    .eq('catalogs.name', catalogo)
    .eq('code', codigo)
    .eq('is_active', true)
    .maybeSingle();
  lanzar(error);
  return data ? data.id : null;
}

async function idCatalogoObligatorio(catalogo, codigo, campo) {
  if (typeof codigo !== 'string' || !codigo) throw new HttpError(400, `${campo} es obligatorio`);
  const id = await idCatalogo(catalogo, codigo);
  if (!id) throw new HttpError(400, `${campo} no es un valor válido de "${catalogo}"`);
  return id;
}

// Archivo ya subido con POST /files: { path, name }.
function archivo(valor, campo) {
  if (!valor || typeof valor !== 'object') throw new HttpError(400, `${campo} es obligatorio`);
  if (typeof valor.path !== 'string' || !RUTA_ARCHIVO.test(valor.path)) {
    throw new HttpError(400, `${campo} no es un archivo subido por el sistema`);
  }
  return { path: valor.path, name: texto(valor.name, 255, `Nombre de ${campo}`) || valor.path.split('/').pop() };
}

// URLs firmadas (10 minutos) para ver los documentos privados.
async function firmar(rutas) {
  const validas = rutas.filter((r) => typeof r === 'string' && RUTA_ARCHIVO.test(r));
  if (!validas.length || !supabase.storage) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(validas, 600);
  if (error || !data) return {};
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

function aDocumento(doc, urls) {
  if (!doc) return null;
  return { id: doc.id, nombre: doc.file_name, estado: doc.status, vence: doc.expiry_date || null, url: urls[doc.file_url] || null };
}

function aAcreditacion(a, urls = {}) {
  if (!a) return null;
  return {
    id: a.id,
    estado: estadoDe(a.valid_until),
    registro: a.status,
    funcion: a.funcion,
    nivel: a.nivel,
    categoria: a.categoria || null,
    modalidad: a.modality,
    vigenteDesde: a.valid_from,
    vence: a.valid_until,
    evaluacionPractica: a.practical_evaluation,
    pruebaFisica: a.physical_test,
    inscripcionCursoId: a.course_enrollment_id,
    notas: a.notes,
    certificado: aDocumento(a.certificado, urls),
    constancia: aDocumento(a.constancia, urls)
  };
}

// Conteo de partidos (no anulados ni rechazados) de la temporada por persona.
async function partidosPorPersona(ids, anio) {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('referee_assignments')
    .select('person_id, matches!inner(scheduled_date)')
    .in('person_id', ids)
    .in('status', ASIGNACION_VALIDA)
    .gte('matches.scheduled_date', `${anio}-01-01`)
    .lte('matches.scheduled_date', `${anio}-12-31`);
  lanzar(error);
  const conteo = {};
  for (const fila of data || []) conteo[fila.person_id] = (conteo[fila.person_id] || 0) + 1;
  return conteo;
}

// Partidos con los cuatro puestos (principal, segundo, anotador, línea) cubiertos.
function cobertura(partidos) {
  let completos = 0;
  let sinOficiales = 0;
  for (const p of partidos) {
    const puestos = new Set(
      (p.referee_assignments || []).filter((a) => ASIGNACION_VALIDA.includes(a.status)).map((a) => a.official_type_value_id)
    );
    if (puestos.size >= OFICIALES_COMPLETOS) completos += 1;
    if (puestos.size === 0) sinOficiales += 1;
  }
  return { programados: partidos.length, completos, incompletos: partidos.length - completos, sinOficiales };
}

async function contarAcreditaciones(filtrar) {
  const { count, error } = await filtrar(
    supabase.from('referee_accreditations').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVA')
  );
  lanzar(error);
  return count || 0;
}

function aCursoResumen(c) {
  const inscritos = Array.isArray(c.referee_course_enrollments) ? c.referee_course_enrollments[0]?.count || 0 : 0;
  return {
    id: c.id,
    nombre: c.name,
    tipo: c.course_type,
    formato: c.format,
    inicio: c.start_date,
    fin: c.end_date,
    sede: c.venue,
    cupo: c.capacity,
    inscripcionAbierta: c.enrollment_open,
    estado: c.status,
    inscritos
  };
}

// ---------- resumen y opciones ----------

// GET /api/referees/summary -> tarjetas, cobertura de los próximos días y próximos cursos
router.get('/summary', asyncHandler(async (req, res) => {
  const fechaHoy = hoy();
  const aviso = sumarDias(fechaHoy, DIAS_AVISO);
  const anio = fechaHoy.slice(0, 4);
  const hasta = sumarDias(fechaHoy, DIAS_COBERTURA);

  const [acreditadas, porVencer, vencidas, temporada, proximos, cursos] = await Promise.all([
    contarAcreditaciones((q) => q),
    contarAcreditaciones((q) => q.gte('valid_until', fechaHoy).lte('valid_until', aviso)),
    contarAcreditaciones((q) => q.lt('valid_until', fechaHoy)),
    supabase
      .from('matches')
      .select('id, referee_assignments(status, official_type_value_id)')
      .gte('scheduled_date', `${anio}-01-01`)
      .lte('scheduled_date', `${anio}-12-31`)
      .neq('status', 'CANCELADO'),
    supabase
      .from('matches')
      .select('id, referee_assignments(status, official_type_value_id)')
      .gte('scheduled_date', fechaHoy)
      .lte('scheduled_date', hasta)
      .in('status', ['PROGRAMADO', 'REPROGRAMADO']),
    supabase
      .from('referee_courses')
      .select('id, name, course_type, format, start_date, end_date, venue, capacity, enrollment_open, status, referee_course_enrollments(count)')
      .neq('status', 'CANCELADO')
      .gte('end_date', fechaHoy)
      .order('start_date')
      .limit(3)
  ]);
  lanzar(temporada.error);
  lanzar(proximos.error);
  lanzar(cursos.error);

  const deTemporada = cobertura(temporada.data || []);
  res.json({
    data: {
      acreditadas,
      porVencer,
      vencidas,
      diasAviso: DIAS_AVISO,
      arbitrajeCompletoPct: deTemporada.programados
        ? Math.round((deTemporada.completos / deTemporada.programados) * 100)
        : null,
      cobertura: { desde: fechaHoy, hasta, ...cobertura(proximos.data || []) },
      proximosCursos: (cursos.data || []).map(aCursoResumen)
    }
  });
}));

// GET /api/referees/options -> listas para los formularios
router.get('/options', asyncHandler(async (req, res) => {
  const [valores, instructores] = await Promise.all([
    supabase
      .from('catalog_values')
      .select('code, value, catalogs!inner(name)')
      .in('catalogs.name', Object.values(CATALOGOS))
      .eq('is_active', true)
      .order('value'),
    supabase
      .from('referee_accreditations')
      .select(`person_id, valid_until,
        persona:persons!referee_accreditations_person_id_fkey(first_name, last_name),
        nivel:catalog_values!referee_accreditations_level_value_id_fkey(value)`)
      .eq('status', 'ACTIVA')
      .gte('valid_until', hoy())
      .limit(500)
  ]);
  lanzar(valores.error);
  lanzar(instructores.error);

  const opciones = Object.fromEntries(Object.keys(CATALOGOS).map((k) => [k, []]));
  for (const v of valores.data || []) {
    const clave = Object.keys(CATALOGOS).find((k) => CATALOGOS[k] === v.catalogs?.name);
    if (clave) opciones[clave].push({ codigo: v.code, nombre: v.value });
  }
  opciones.instructores = (instructores.data || [])
    .map((i) => ({ id: i.person_id, nombre: nombreCompleto(i.persona), nivel: i.nivel?.value || null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  res.json({ data: opciones });
}));

// ---------- padrón ----------

// GET /api/referees/persons?q= -> búsqueda en el padrón para acreditar
router.get('/persons', asyncHandler(async (req, res) => {
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';
  if (q.length < 2) return res.json({ data: [] });

  const { data, error } = await supabase
    .from('persons')
    .select(SELECT_PERSONA)
    .eq('status', 'ACTIVA')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%`)
    .order('last_name')
    .limit(10);
  lanzar(error);

  const ids = (data || []).map((p) => p.id);
  let activas = [];
  if (ids.length) {
    const r = await supabase
      .from('referee_accreditations')
      .select('person_id, valid_until')
      .in('person_id', ids)
      .eq('status', 'ACTIVA');
    lanzar(r.error);
    activas = r.data || [];
  }
  const porPersona = Object.fromEntries(activas.map((a) => [a.person_id, a]));

  res.json({
    data: (data || []).map((p) => ({
      id: p.id,
      nombre: nombreCompleto(p),
      cedula: p.document_number,
      provincia: p.province,
      correo: p.email,
      asociacion: p.asociacion?.name || null,
      acreditacion: porPersona[p.id]
        ? { vence: porPersona[p.id].valid_until, estado: estadoDe(porPersona[p.id].valid_until) }
        : null
    }))
  });
}));

// GET /api/referees/persons/:id -> datos para el formulario de acreditar o renovar
router.get('/persons/:id', asyncHandler(async (req, res) => {
  const [persona, acreditacion, cursos] = await Promise.all([
    supabase.from('persons').select(SELECT_PERSONA).eq('id', req.params.id).eq('status', 'ACTIVA').maybeSingle(),
    supabase.from('referee_accreditations').select(SELECT_ACREDITACION).eq('person_id', req.params.id).eq('status', 'ACTIVA').maybeSingle(),
    supabase
      .from('referee_course_enrollments')
      .select('id, grade, result, curso:referee_courses!referee_course_enrollments_course_id_fkey(id, name, end_date, course_type)')
      .eq('person_id', req.params.id)
      .eq('result', 'APROBADO')
  ]);
  lanzar(persona.error);
  lanzar(acreditacion.error);
  lanzar(cursos.error);
  if (!persona.data) throw new HttpError(404, 'Persona no encontrada en el padrón');

  const p = persona.data;
  res.json({
    data: {
      persona: {
        id: p.id,
        nombre: nombreCompleto(p),
        cedula: p.document_number,
        provincia: p.province,
        correo: p.email,
        asociacion: p.asociacion?.name || null
      },
      acreditacion: aAcreditacion(acreditacion.data),
      cursosAprobados: (cursos.data || [])
        .map((c) => ({ id: c.id, nota: c.grade, curso: c.curso?.name, fin: c.curso?.end_date, tipo: c.curso?.course_type }))
        .sort((a, b) => String(b.fin).localeCompare(String(a.fin)))
    }
  });
}));

// ---------- documentos ----------

// POST /api/referees/files -> sube un requisito (PDF, JPG o PNG) al almacenamiento privado
router.post(
  '/files',
  express.raw({ type: Object.keys(EXTENSIONES), limit: TAMANO_MAX_ARCHIVO }),
  asyncHandler(async (req, res) => {
    const tipo = (req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    const extension = EXTENSIONES[tipo];
    if (!extension) throw new HttpError(400, 'El archivo debe ser PDF, JPG o PNG');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No se recibió el archivo');

    const ruta = `acreditaciones/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;
    const subir = () => supabase.storage.from(BUCKET).upload(ruta, req.body, { contentType: tipo });

    let { error } = await subir();
    if (error && /bucket not found/i.test(error.message || '')) {
      // Primera vez: se crea el bucket privado (las constancias médicas no son públicas).
      const { error: errorBucket } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: TAMANO_MAX_ARCHIVO,
        allowedMimeTypes: Object.keys(EXTENSIONES)
      });
      if (errorBucket && !/already exists/i.test(errorBucket.message || '')) {
        throw new HttpError(500, 'No se pudo crear el almacenamiento de documentos: ' + errorBucket.message);
      }
      ({ error } = await subir());
    }
    if (error) throw new HttpError(500, 'No se pudo guardar el archivo: ' + error.message);

    res.status(201).json({ data: { path: ruta } });
  })
);

// ---------- acreditaciones ----------

// GET /api/referees?funcion=&estado=&provincia=&q=&page=
router.get('/', asyncHandler(async (req, res) => {
  const { funcion, estado, provincia } = req.query;
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';
  const pagina = /^\d{1,4}$/.test(String(req.query.page || '1')) ? Math.max(1, Number(req.query.page || 1)) : 1;
  const fechaHoy = hoy();

  let query = supabase
    .from('referee_accreditations')
    .select(`id, person_id, valid_until,
      persona:persons!referee_accreditations_person_id_fkey(id, first_name, last_name, document_number, province),
      funcion:catalog_values!referee_accreditations_function_value_id_fkey(code, value),
      nivel:catalog_values!referee_accreditations_level_value_id_fkey(code, value)`, { count: 'exact' })
    .eq('status', 'ACTIVA');

  if (funcion && funcion !== 'todas') {
    const id = await idCatalogo(CATALOGOS.funciones, String(funcion));
    if (!id) throw new HttpError(400, 'funcion no es un valor válido');
    query = query.eq('function_value_id', id);
  }

  if (estado && estado !== 'todos') {
    opcion(estado, ESTADOS, 'estado');
    const aviso = sumarDias(fechaHoy, DIAS_AVISO);
    if (estado === 'VENCIDA') query = query.lt('valid_until', fechaHoy);
    if (estado === 'POR_VENCER') query = query.gte('valid_until', fechaHoy).lte('valid_until', aviso);
    if (estado === 'AL_DIA') query = query.gt('valid_until', aviso);
  }

  // Nombre, cédula y provincia viven en persons: primero se buscan esas personas.
  if (q || (provincia && provincia !== 'todas')) {
    let personas = supabase.from('persons').select('id').limit(1000);
    if (q) personas = personas.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%`);
    if (provincia && provincia !== 'todas') personas = personas.eq('province', texto(provincia, 50, 'provincia'));
    const { data, error } = await personas;
    lanzar(error);
    const ids = (data || []).map((p) => p.id);
    if (!ids.length) return res.json({ data: { items: [], total: 0, page: pagina, page_size: POR_PAGINA } });
    query = query.in('person_id', ids);
  }

  const desde = (pagina - 1) * POR_PAGINA;
  const { data, error, count } = await query.order('valid_until').order('id').range(desde, desde + POR_PAGINA - 1);
  lanzar(error);

  const filas = data || [];
  const partidos = await partidosPorPersona(filas.map((f) => f.person_id), fechaHoy.slice(0, 4));

  res.json({
    data: {
      items: filas.map((f) => ({
        id: f.id,
        personaId: f.person_id,
        nombre: nombreCompleto(f.persona),
        cedula: f.persona?.document_number || '',
        provincia: f.persona?.province || null,
        funcion: f.funcion,
        nivel: f.nivel,
        vence: f.valid_until,
        estado: estadoDe(f.valid_until, fechaHoy),
        partidos: partidos[f.person_id] || 0
      })),
      total: count || 0,
      page: pagina,
      page_size: POR_PAGINA
    }
  });
}));

// POST /api/referees/accreditations -> acredita a una persona o renueva su acreditación
router.post('/accreditations', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const personId = uuidOpcional(b.person_id, 'person_id');
  if (!personId) throw new HttpError(400, 'Seleccione a la persona del padrón');

  const desde = fecha(b.valid_from, 'Vigente desde', { obligatorio: true });
  const hasta = fecha(b.valid_until, 'Vence', { obligatorio: true });
  if (hasta <= desde) throw new HttpError(400, 'La fecha de vencimiento debe ser posterior a "Vigente desde"');

  const inscripcion = uuidOpcional(b.course_enrollment_id, 'course_enrollment_id');
  if (!inscripcion) throw new HttpError(400, 'Seleccione el curso aprobado');

  const practica = opcion(b.practical_evaluation, EVALUACIONES, 'Evaluación práctica');
  const fisica = opcion(b.physical_test, EVALUACIONES, 'Prueba física');
  if (practica !== 'APROBADA' || fisica !== 'APROBADA') {
    throw new HttpError(400, 'La evaluación práctica y la prueba física deben estar aprobadas');
  }

  const funcion = texto(b.function_code, 20, 'Función', { obligatorio: true });
  const nivel = texto(b.level_code, 20, 'Nivel', { obligatorio: true });
  const categoria = texto(b.category_code, 20, 'Categoría');
  await idCatalogoObligatorio(CATALOGOS.funciones, funcion, 'Función');
  await idCatalogoObligatorio(CATALOGOS.niveles, nivel, 'Nivel');
  if (categoria) await idCatalogoObligatorio(CATALOGOS.categorias, categoria, 'Categoría');

  const certificado = archivo(b.certificate, 'El certificado del curso');
  const constancia = archivo(b.medical, 'La constancia médica');

  const { data: id, error } = await supabase.rpc('sp_accredit_referee', {
    p_person_id: personId,
    p_function_code: funcion,
    p_level_code: nivel,
    p_modality: opcion(b.modality, MODALIDADES, 'Modalidad'),
    p_category_code: categoria,
    p_valid_from: desde,
    p_valid_until: hasta,
    p_course_enrollment_id: inscripcion,
    p_practical_evaluation: practica,
    p_physical_test: fisica,
    p_certificate_url: certificado.path,
    p_certificate_name: certificado.name,
    p_medical_url: constancia.path,
    p_medical_name: constancia.name,
    p_notes: texto(b.notes, 2000, 'Notas'),
    p_admin_user: req.currentUser
  });
  lanzar(error, 'Persona');

  res.status(201).json({ data: { id, personId } });
}));

// PATCH /api/referees/accreditations/:id -> corrige los datos de la acreditación activa
router.patch('/accreditations/:id', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { data: actual, error: errorActual } = await supabase
    .from('referee_accreditations')
    .select('id, person_id, valid_from, valid_until, status')
    .eq('id', req.params.id)
    .maybeSingle();
  lanzar(errorActual);
  if (!actual) throw new HttpError(404, 'Acreditación no encontrada');
  if (actual.status !== 'ACTIVA') throw new HttpError(409, 'Solo se puede editar la acreditación activa');

  const cambios = {};
  if (b.function_code !== undefined) cambios.function_value_id = await idCatalogoObligatorio(CATALOGOS.funciones, b.function_code, 'Función');
  if (b.level_code !== undefined) cambios.level_value_id = await idCatalogoObligatorio(CATALOGOS.niveles, b.level_code, 'Nivel');
  if (b.category_code !== undefined) {
    cambios.category_value_id = b.category_code ? await idCatalogoObligatorio(CATALOGOS.categorias, b.category_code, 'Categoría') : null;
  }
  if (b.modality !== undefined) cambios.modality = opcion(b.modality, MODALIDADES, 'Modalidad');
  if (b.valid_from !== undefined) cambios.valid_from = fecha(b.valid_from, 'Vigente desde', { obligatorio: true });
  if (b.valid_until !== undefined) cambios.valid_until = fecha(b.valid_until, 'Vence', { obligatorio: true });
  if (b.notes !== undefined) cambios.notes = texto(b.notes, 2000, 'Notas');

  const desde = cambios.valid_from || actual.valid_from;
  const hasta = cambios.valid_until || actual.valid_until;
  if (hasta <= desde) throw new HttpError(400, 'La fecha de vencimiento debe ser posterior a "Vigente desde"');

  // Reemplazo opcional de los documentos de requisitos.
  for (const [campo, columna, codigo, etiqueta] of [
    ['certificate', 'certificate_document_id', 'CUR', 'El certificado del curso'],
    ['medical', 'medical_document_id', 'MED', 'La constancia médica']
  ]) {
    if (!b[campo]) continue;
    const doc = archivo(b[campo], etiqueta);
    const { data: docId, error } = await supabase.rpc('sp_upload_document', {
      p_document_type_code: codigo,
      p_file_url: doc.path,
      p_admin_user: req.currentUser,
      p_person_id: actual.person_id,
      p_file_name: doc.name,
      p_issue_date: hoy(),
      p_expiry_date: codigo === 'MED' ? sumarDias(hoy(), 365) : null
    });
    lanzar(error);
    cambios[columna] = docId;
  }

  if (!Object.keys(cambios).length) throw new HttpError(400, 'No hay cambios para guardar');
  cambios.updated_at = new Date().toISOString();

  const { error } = await supabase.from('referee_accreditations').update(cambios).eq('id', req.params.id);
  lanzar(error, 'Acreditación');

  res.json({ data: { id: actual.id, personId: actual.person_id } });
}));

// ---------- cursos ----------

function leerCurso(b) {
  const inicio = fecha(b.start_date, 'Fecha de inicio', { obligatorio: true });
  const fin = fecha(b.end_date, 'Fecha de cierre', { obligatorio: true });
  if (fin < inicio) throw new HttpError(400, 'La fecha de cierre no puede ser anterior a la de inicio');

  const abre = fecha(b.enrollment_opens, 'Abre');
  const cierra = fecha(b.enrollment_closes, 'Cierra');
  if (abre && cierra && cierra < abre) throw new HttpError(400, 'El cierre de la inscripción no puede ser anterior a su apertura');
  if (cierra && cierra > fin) throw new HttpError(400, 'La inscripción debe cerrar antes de que termine el curso');

  let cupo = null;
  if (b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
    cupo = Number(b.capacity);
    if (!Number.isInteger(cupo) || cupo < 1 || cupo > 1000) throw new HttpError(400, 'El cupo debe ser un número entero entre 1 y 1000');
  }

  const nota = b.passing_grade === undefined || b.passing_grade === '' ? 70 : Number(b.passing_grade);
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw new HttpError(400, 'La nota mínima debe estar entre 0 y 100');

  return {
    name: texto(b.name, 255, 'Nombre del curso', { obligatorio: true }),
    course_type: opcion(b.course_type, TIPOS_CURSO, 'Tipo de curso'),
    format: opcion(b.format || 'PRESENCIAL', FORMATOS, 'Formato'),
    start_date: inicio,
    end_date: fin,
    venue: texto(b.venue, 255, 'Sede'),
    capacity: cupo,
    instructor_person_id: uuidOpcional(b.instructor_person_id, 'Instructor'),
    passing_grade: nota,
    content: texto(b.content, 5000, 'Contenido'),
    enrollment_opens: abre,
    enrollment_closes: cierra,
    enrollment_open: b.enrollment_open !== false,
    only_current_accreditation: b.only_current_accreditation === true
  };
}

// GET /api/referees/courses -> cursos, los más recientes primero
router.get('/courses', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('referee_courses')
    .select('id, name, course_type, format, start_date, end_date, venue, capacity, enrollment_open, status, referee_course_enrollments(count)')
    .order('start_date', { ascending: false })
    .limit(100);
  lanzar(error);
  res.json({ data: (data || []).map(aCursoResumen) });
}));

// POST /api/referees/courses -> programa y publica un curso
router.post('/courses', asyncHandler(async (req, res) => {
  const campos = leerCurso(req.body || {});
  const modalidad = (req.body || {}).modality_code;
  campos.modality_value_id = modalidad ? await idCatalogoObligatorio(CATALOGOS.modalidades, modalidad, 'Modalidad') : null;
  campos.created_by = req.currentUser;

  const { data, error } = await supabase.from('referee_courses').insert(campos).select('id').single();
  lanzar(error);
  res.status(201).json({ data });
}));

// GET /api/referees/courses/:id -> curso con sus inscritos y notas
router.get('/courses/:id', asyncHandler(async (req, res) => {
  const [curso, inscritos] = await Promise.all([
    supabase.from('referee_courses').select(SELECT_CURSO).eq('id', req.params.id).maybeSingle(),
    supabase
      .from('referee_course_enrollments')
      .select('id, grade, result, persona:persons!referee_course_enrollments_person_id_fkey(id, first_name, last_name, document_number)')
      .eq('course_id', req.params.id)
      .order('created_at')
  ]);
  lanzar(curso.error);
  lanzar(inscritos.error);
  if (!curso.data) throw new HttpError(404, 'Curso no encontrado');

  const c = curso.data;
  res.json({
    data: {
      id: c.id,
      nombre: c.name,
      tipo: c.course_type,
      formato: c.format,
      inicio: c.start_date,
      fin: c.end_date,
      sede: c.venue,
      cupo: c.capacity,
      notaMinima: Number(c.passing_grade),
      estado: c.status,
      inscripcionAbierta: c.enrollment_open,
      soloVigentes: c.only_current_accreditation,
      instructor: c.instructor ? nombreCompleto(c.instructor) : null,
      modalidad: c.modalidad?.value || null,
      inscritos: (inscritos.data || []).map((i) => ({
        id: i.id,
        personaId: i.persona?.id,
        nombre: nombreCompleto(i.persona),
        cedula: i.persona?.document_number || '',
        nota: i.grade === null ? null : Number(i.grade),
        resultado: i.result
      }))
    }
  });
}));

// POST /api/referees/courses/:id/enrollments -> inscribe a una persona del padrón
router.post('/courses/:id/enrollments', asyncHandler(async (req, res) => {
  const personId = uuidOpcional((req.body || {}).person_id, 'person_id');
  if (!personId) throw new HttpError(400, 'Seleccione a la persona');

  const { data: curso, error } = await supabase
    .from('referee_courses')
    .select('id, capacity, status, enrollment_open, only_current_accreditation, referee_course_enrollments(count)')
    .eq('id', req.params.id)
    .maybeSingle();
  lanzar(error);
  if (!curso) throw new HttpError(404, 'Curso no encontrado');
  if (curso.status !== 'PUBLICADO' || curso.enrollment_open === false) throw new HttpError(409, 'El curso no tiene la inscripción abierta');

  const inscritos = curso.referee_course_enrollments?.[0]?.count || 0;
  if (curso.capacity && inscritos >= curso.capacity) throw new HttpError(409, 'El curso ya alcanzó su cupo');

  if (curso.only_current_accreditation) {
    const { data: vigente, error: errorVigente } = await supabase
      .from('referee_accreditations')
      .select('id')
      .eq('person_id', personId)
      .eq('status', 'ACTIVA')
      .gte('valid_until', hoy())
      .maybeSingle();
    lanzar(errorVigente);
    if (!vigente) throw new HttpError(409, 'Este curso es solo para árbitros con acreditación vigente');
  }

  const { data, error: errorInsert } = await supabase
    .from('referee_course_enrollments')
    .insert({ course_id: curso.id, person_id: personId })
    .select('id')
    .single();
  if (errorInsert?.code === '23505') throw new HttpError(409, 'La persona ya está inscrita en este curso');
  lanzar(errorInsert);

  res.status(201).json({ data });
}));

// PATCH /api/referees/courses/:id/enrollments/:enrollmentId -> carga la nota (o marca ausente)
router.patch('/courses/:id/enrollments/:enrollmentId', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { data: curso, error } = await supabase
    .from('referee_courses')
    .select('id, passing_grade')
    .eq('id', req.params.id)
    .maybeSingle();
  lanzar(error);
  if (!curso) throw new HttpError(404, 'Curso no encontrado');

  let cambios;
  if (b.result === 'AUSENTE') {
    cambios = { grade: null, result: 'AUSENTE' };
  } else if (b.grade === null || b.grade === '') {
    cambios = { grade: null, result: 'INSCRITO' };
  } else {
    const nota = Number(b.grade);
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw new HttpError(400, 'La nota debe estar entre 0 y 100');
    cambios = { grade: nota, result: nota >= Number(curso.passing_grade) ? 'APROBADO' : 'REPROBADO' };
  }
  cambios.updated_at = new Date().toISOString();

  const { data, error: errorUpdate } = await supabase
    .from('referee_course_enrollments')
    .update(cambios)
    .eq('id', req.params.enrollmentId)
    .eq('course_id', curso.id)
    .select('id, grade, result')
    .maybeSingle();
  lanzar(errorUpdate);
  if (!data) throw new HttpError(404, 'Inscripción no encontrada');

  res.json({ data: { id: data.id, nota: data.grade === null ? null : Number(data.grade), resultado: data.result } });
}));

// ---------- ficha ----------

// GET /api/referees/:id -> ficha del árbitro (id de la persona)
router.get('/:id', asyncHandler(async (req, res) => {
  const fechaHoy = hoy();
  const anio = fechaHoy.slice(0, 4);

  const [persona, acreditaciones, partidos, cursos] = await Promise.all([
    supabase.from('persons').select(SELECT_PERSONA).eq('id', req.params.id).maybeSingle(),
    supabase
      .from('referee_accreditations')
      .select(SELECT_ACREDITACION)
      .eq('person_id', req.params.id)
      .order('valid_from', { ascending: false })
      .limit(10),
    supabase
      .from('referee_assignments')
      .select(`id, status,
        puesto:catalog_values!referee_assignments_official_type_value_id_fkey(code, value),
        matches!inner(id, scheduled_date, acta_status, status,
          local:teams!matches_home_team_id_fkey(name),
          visita:teams!matches_away_team_id_fkey(name),
          competitions(name))`)
      .eq('person_id', req.params.id)
      .in('status', ASIGNACION_VALIDA)
      .gte('matches.scheduled_date', `${anio}-01-01`)
      .lte('matches.scheduled_date', `${anio}-12-31`)
      .limit(200),
    supabase
      .from('referee_course_enrollments')
      .select('id, grade, result, curso:referee_courses!referee_course_enrollments_course_id_fkey(id, name, start_date, end_date)')
      .eq('person_id', req.params.id)
  ]);
  lanzar(persona.error);
  lanzar(acreditaciones.error);
  lanzar(partidos.error);
  lanzar(cursos.error);
  if (!persona.data) throw new HttpError(404, 'Persona no encontrada');

  const lista = acreditaciones.data || [];
  if (!lista.length) throw new HttpError(404, 'La persona no tiene acreditaciones arbitrales');
  const actual = lista.find((a) => a.status === 'ACTIVA') || lista[0];

  const urls = await firmar([actual.certificado?.file_url, actual.constancia?.file_url]);
  const p = persona.data;

  res.json({
    data: {
      persona: {
        id: p.id,
        nombre: nombreCompleto(p),
        cedula: p.document_number,
        provincia: p.province,
        correo: p.email,
        telefono: p.phone,
        asociacion: p.asociacion?.name || null,
        // "Desde": año de la primera acreditación registrada.
        desde: lista[lista.length - 1].valid_from.slice(0, 4)
      },
      acreditacion: aAcreditacion(actual, urls),
      temporada: anio,
      partidos: (partidos.data || [])
        .map((a) => ({
          id: a.id,
          fecha: a.matches.scheduled_date,
          partido: `${a.matches.local?.name || '¿?'} vs ${a.matches.visita?.name || '¿?'}`,
          competencia: a.matches.competitions?.name || '',
          funcion: a.puesto?.value || '',
          acta: a.matches.acta_status
        }))
        .sort((x, y) => y.fecha.localeCompare(x.fecha)),
      cursos: (cursos.data || [])
        .map((c) => ({
          id: c.id,
          fecha: c.curso?.end_date || c.curso?.start_date,
          nombre: c.curso?.name || '',
          resultado: c.result,
          nota: c.grade === null ? null : Number(c.grade)
        }))
        .sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))),
      historial: lista.map((a) => ({ id: a.id, desde: a.valid_from, vence: a.valid_until, registro: a.status }))
    }
  });
}));

module.exports = router;
