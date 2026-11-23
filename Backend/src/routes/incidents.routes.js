// Incidentes y sanciones: expedientes disciplinarios y catálogo de faltas (montado en /api/incidents).
// Todo el módulo es del panel de administración (requiere sesión de Administrador).
//
// Estados de un expediente: ABIERTO → EN_SEGUIMIENTO (con propuesta de resolución) → CON_SANCION.
// ARCHIVADO si no procede. "RESUELTO" no se guarda: es un expediente con sanción cuyas
// sanciones ya se cumplieron (o fueron anuladas).
const crypto = require('crypto');
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const requireAdmin = require('../middleware/requireAdmin');
const reglas = require('../utils/sanciones');

const router = express.Router();
for (const p of ['id', 'infractionId', 'docId', 'sanctionId']) router.param(p, validateUuidParams);
router.use(requireAdmin);

const POR_PAGINA = 20;
const BUCKET = 'case-documents';
const TAMANO_MAX_ARCHIVO = 10 * 1024 * 1024;
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const RUTA_ARCHIVO = /^expedientes\/\d{4}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ESTADOS = ['ABIERTO', 'EN_SEGUIMIENTO', 'CON_SANCION', 'RESUELTO', 'ARCHIVADO'];
const TIPOS_INVOLUCRADO = ['PERSONA', 'EQUIPO', 'SEDE'];
const ROLES = ['DENUNCIANTE', 'DENUNCIADO', 'INVOLUCRADO', 'TESTIGO'];
const GRAVEDADES = ['LEVE', 'GRAVE', 'MUY_GRAVE'];
const PROGRAMADOS = ['PROGRAMADO', 'REPROGRAMADO'];

const SELECT_PARTES = `id, party_type, role_in_case, participation, venue_name, person_id, team_id,
  persona:persons!case_parties_person_id_fkey(id, first_name, last_name, document_number),
  equipo:teams!case_parties_team_id_fkey(id, name, short_name)`;

const SELECT_PARTIDO = `id, match_number, matchday, scheduled_date, scheduled_time,
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visita:teams!matches_away_team_id_fkey(id, name, short_name)`;

const SELECT_LISTA = `id, case_number, title, status, created_at, occurred_at, competition_id,
  tipo:catalog_values!disciplinary_cases_incident_type_value_id_fkey(code, value),
  partido:matches!disciplinary_cases_match_id_fkey(match_number, local:teams!matches_home_team_id_fkey(name, short_name), visita:teams!matches_away_team_id_fkey(name, short_name)),
  case_parties!case_parties_case_id_fkey(party_type, role_in_case, participation, venue_name,
    persona:persons!case_parties_person_id_fkey(first_name, last_name),
    equipo:teams!case_parties_team_id_fkey(name, short_name)),
  sanctions(status, end_date)`;

const SELECT_FALTA = 'id, code, name, description, applies_to, severity, min_sanction, min_quantity, max_sanction, max_quantity, recidivism, is_active';

// ---------- utilidades ----------

function lanzar(error, contexto) {
  const err = fromSupabase(error, contexto);
  if (err) throw err;
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const anioActual = () => Number(hoy().slice(0, 4));

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function sumarMeses(fecha, meses) {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}

// Suma días hábiles (lunes a viernes).
function sumarDiasHabiles(fecha, dias) {
  let actual = fecha;
  let faltan = dias;
  while (faltan > 0) {
    actual = sumarDias(actual, 1);
    const dia = new Date(`${actual}T00:00:00Z`).getUTCDay();
    if (dia !== 0 && dia !== 6) faltan -= 1;
  }
  return actual;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const diaMes = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const limpiarBusqueda = (q) => String(q).replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const nombrePersona = (p) => (p ? `${p.first_name} ${p.last_name}`.trim() : '');
const nombreEquipo = (e) => (e ? e.short_name || e.name : '');

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

function uuid(valor, campo, { obligatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new HttpError(400, `${campo} es obligatorio`);
    return null;
  }
  if (typeof valor !== 'string' || !UUID.test(valor)) throw new HttpError(400, `${campo} no es un identificador válido`);
  return valor;
}

function opcion(valor, permitidas, campo) {
  if (!permitidas.includes(valor)) throw new HttpError(400, `${campo} solo admite: ${permitidas.join(', ')}`);
  return valor;
}

function cantidadOpcional(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 100000000) throw new HttpError(400, `${campo} debe ser un número entero positivo`);
  return n;
}

function archivo(valor, campo) {
  if (!valor || typeof valor !== 'object') throw new HttpError(400, `${campo} es obligatorio`);
  if (typeof valor.path !== 'string' || !RUTA_ARCHIVO.test(valor.path)) {
    throw new HttpError(400, `${campo} no es un archivo subido por el sistema`);
  }
  return { path: valor.path, name: texto(valor.name, 255, `Nombre de ${campo}`) || valor.path.split('/').pop() };
}

const sancionVigente = (s, fecha = hoy()) => s.status === 'VIGENTE' && (!s.end_date || s.end_date >= fecha);

// Estado que ve el usuario: un expediente con sanción pasa a "Resuelto" cuando ya no le quedan sanciones vigentes.
function estadoVisible(caso) {
  if (caso.status !== 'CON_SANCION') return caso.status;
  return (caso.sanctions || []).some((s) => sancionVigente(s)) ? 'CON_SANCION' : 'RESUELTO';
}

// "K. Brown (técnico)", "Heredia VC", "Sede".
function etiquetaParte(p) {
  if (p.party_type === 'PERSONA') {
    const persona = p.persona;
    const nombre = persona ? `${persona.first_name.charAt(0)}. ${persona.last_name.split(' ')[0]}` : 'Persona';
    return p.participation ? `${nombre} (${p.participation.toLowerCase()})` : nombre;
  }
  if (p.party_type === 'EQUIPO') return nombreEquipo(p.equipo) || 'Equipo';
  return p.venue_name || 'Sede';
}

function involucra(partes) {
  const lista = partes || [];
  const principales = lista.filter((p) => p.role_in_case === 'DENUNCIADO');
  const elegidas = principales.length ? principales : lista;
  if (!elegidas.length) return '—';
  const [primera, ...resto] = elegidas;
  return resto.length ? `${etiquetaParte(primera)} y ${resto.length} más` : etiquetaParte(primera);
}

const textoPartido = (m) => (m ? `${nombreEquipo(m.local)} vs ${nombreEquipo(m.visita)}` : '—');

function aFalta(f) {
  return {
    id: f.id,
    codigo: f.code,
    nombre: f.name,
    descripcion: f.description,
    aplica: f.applies_to,
    gravedad: f.severity,
    minTipo: f.min_sanction,
    minCantidad: f.min_quantity,
    maxTipo: f.max_sanction,
    maxCantidad: f.max_quantity,
    sancionMinima: reglas.etiquetaCorta(f.min_sanction, f.min_quantity),
    sancionMaxima: reglas.etiquetaCorta(f.max_sanction, f.max_quantity),
    rango: reglas.textoRango(f),
    reincidencia: f.recidivism,
    activa: f.is_active,
    opciones: reglas.opcionesDeFalta(f)
  };
}

async function buscarFalta(id) {
  const { data, error } = await supabase.from('infractions').select(SELECT_FALTA).eq('id', id).maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(400, 'La falta seleccionada no existe');
  return data;
}

async function registrarEvento(casoId, tipo, descripcion, actor) {
  const { error } = await supabase.from('case_events').insert({ case_id: casoId, event_type: tipo, description: descripcion, actor });
  lanzar(error);
}

const actor = (req) => req.usuario?.full_name || req.currentUser;

async function buscarCaso(id, columnas = 'id, case_number, status, competition_id, match_id') {
  const { data, error } = await supabase.from('disciplinary_cases').select(columnas).eq('id', id).maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(404, 'Expediente no encontrado');
  return data;
}

async function buscarParte(casoId, parteId) {
  const { data, error } = await supabase
    .from('case_parties')
    .select(SELECT_PARTES)
    .eq('id', parteId)
    .eq('case_id', casoId)
    .maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(400, 'El involucrado no pertenece a este expediente');
  return data;
}

// Cuándo se cumple una sanción: { inicio, fin, texto }.
async function cumplimiento(caso, parte, tipo, cantidad) {
  const inicio = hoy();
  switch (tipo) {
    case 'SUSPENSION_PARTIDOS': {
      if (!parte.team_id) {
        return { inicio, fin: null, texto: `Próximos ${cantidad} partidos (indique el equipo de la persona para calcular las fechas)` };
      }
      const { data, error } = await supabase
        .from('matches')
        .select('id, matchday, scheduled_date')
        .eq('competition_id', caso.competition_id)
        .or(`home_team_id.eq.${parte.team_id},away_team_id.eq.${parte.team_id}`)
        .in('status', PROGRAMADOS)
        .gt('scheduled_date', inicio)
        .order('scheduled_date')
        .limit(cantidad);
      lanzar(error);
      const partidos = data || [];
      if (partidos.length < cantidad) {
        return {
          inicio,
          fin: null,
          texto: `Próximos ${cantidad} partidos de ${nombreEquipo(parte.equipo) || 'su equipo'} (hay ${partidos.length} programados)`
        };
      }
      const jornadas = [...new Set(partidos.map((p) => p.matchday))];
      const primero = partidos[0].scheduled_date;
      const ultimo = partidos[partidos.length - 1].scheduled_date;
      const nombreJornadas = jornadas.length === 1
        ? `Jornada ${jornadas[0]}`
        : `Jornadas ${jornadas.slice(0, -1).join(', ')} y ${jornadas[jornadas.length - 1]}`;
      const fechas = primero === ultimo ? diaMes(primero) : `${diaMes(primero).split(' ')[0]} al ${diaMes(ultimo)}`;
      return { inicio, fin: ultimo, texto: `${nombreJornadas} (${fechas})` };
    }
    case 'SUSPENSION_MESES': {
      const fin = sumarMeses(inicio, cantidad);
      return { inicio, fin, texto: `Del ${fechaCorta(inicio)} al ${fechaCorta(fin)}` };
    }
    case 'EXPULSION':
      return { inicio, fin: null, texto: 'Definitiva' };
    case 'SUSPENSION_SEDE':
      return { inicio, fin: null, texto: 'Hasta que FECOVOL anule la sanción' };
    default:
      return { inicio, fin: inicio, texto: 'Se aplica de inmediato' };
  }
}

// Lee y valida { party_id, infraction_id, sanction_type, quantity } contra la falta y el involucrado.
async function leerSancion(caso, b) {
  const parte = await buscarParte(caso.id, uuid(b.party_id, 'Involucrado', { obligatorio: true }));
  const falta = await buscarFalta(uuid(b.infraction_id, 'Falta', { obligatorio: true }));
  if (!falta.is_active) throw new HttpError(400, 'La falta seleccionada está desactivada en el catálogo');
  const tipo = opcion(b.sanction_type, Object.keys(reglas.TIPOS), 'Sanción');
  const cantidad = cantidadOpcional(b.quantity, 'La cantidad');
  const problema = reglas.validarSancion(falta, parte.party_type, tipo, cantidad);
  if (problema) throw new HttpError(400, problema);
  return { parte, falta, tipo, cantidad };
}

// URLs firmadas (10 minutos) para ver los documentos privados.
async function firmar(rutas) {
  const validas = rutas.filter((r) => typeof r === 'string' && RUTA_ARCHIVO.test(r));
  if (!validas.length || !supabase.storage) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(validas, 600);
  if (error || !data) return {};
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

async function siguienteNumero() {
  const anio = anioActual();
  const { data, error } = await supabase
    .from('disciplinary_cases')
    .select('sequence')
    .eq('season', anio)
    .order('sequence', { ascending: false })
    .limit(1);
  lanzar(error);
  const n = ((data || [])[0]?.sequence || 0) + 1;
  return `EXP-${anio}-${String(n).padStart(2, '0')}`;
}

// ---------- resumen y opciones ----------

// GET /api/incidents/summary
router.get('/summary', asyncHandler(async (req, res) => {
  const fecha = hoy();
  const contar = (q) => q.then(({ count, error }) => { lanzar(error); return count || 0; });

  const [abiertos, enSeguimiento, conSancion, vigentes] = await Promise.all([
    contar(supabase.from('disciplinary_cases').select('id', { count: 'exact', head: true }).eq('status', 'ABIERTO')),
    contar(supabase.from('disciplinary_cases').select('id', { count: 'exact', head: true }).eq('status', 'EN_SEGUIMIENTO')),
    supabase.from('disciplinary_cases').select('id, status, sanctions(status, end_date)').eq('status', 'CON_SANCION').eq('season', anioActual()),
    contar(supabase.from('sanctions').select('id', { count: 'exact', head: true }).eq('status', 'VIGENTE').or(`end_date.is.null,end_date.gte.${fecha}`))
  ]);
  lanzar(conSancion.error);

  res.json({
    data: {
      temporada: anioActual(),
      abiertos,
      enSeguimiento,
      resueltosTemporada: (conSancion.data || []).filter((c) => estadoVisible(c) === 'RESUELTO').length,
      sancionesVigentes: vigentes
    }
  });
}));

// GET /api/incidents/options -> listas para filtros y formularios
router.get('/options', asyncHandler(async (req, res) => {
  const [tipos, competencias, perfiles, faltas, numero] = await Promise.all([
    supabase.from('catalog_values').select('code, value, catalogs!inner(name)').eq('catalogs.name', 'Tipos de incidente').eq('is_active', true).order('value'),
    supabase.from('competitions').select('id, name, season').order('start_date', { ascending: false }),
    supabase
      .from('user_profiles')
      .select('id, full_name, rol:roles!user_profiles_role_id_fkey(name), user_roles(roles(name))')
      .eq('status', 'ACTIVA')
      .order('full_name'),
    supabase.from('infractions').select(SELECT_FALTA).eq('is_active', true).order('code'),
    siguienteNumero()
  ]);
  lanzar(tipos.error);
  lanzar(competencias.error);
  lanzar(perfiles.error);
  lanzar(faltas.error);

  const esAdmin = (p) => [p.rol, ...(p.user_roles || []).map((r) => r.roles)]
    .flat()
    .some((r) => (r?.name || '').trim().toLowerCase() === 'administrador');

  res.json({
    data: {
      tipos: (tipos.data || []).map((t) => ({ codigo: t.code, nombre: t.value })),
      competencias: (competencias.data || []).map((c) => ({ id: c.id, nombre: c.name, temporada: c.season })),
      responsables: (perfiles.data || []).filter(esAdmin).map((p) => ({ id: p.id, nombre: p.full_name })),
      faltas: (faltas.data || []).map(aFalta),
      siguienteNumero: numero,
      usuarioId: req.usuario?.id || null
    }
  });
}));

// GET /api/incidents/matches?competition_id= -> partidos de una competencia
router.get('/matches', asyncHandler(async (req, res) => {
  const competencia = uuid(req.query.competition_id, 'competition_id', { obligatorio: true });
  const { data, error } = await supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .eq('competition_id', competencia)
    .order('scheduled_date', { ascending: false })
    .limit(300);
  lanzar(error);
  res.json({
    data: (data || []).map((m) => ({
      id: m.id,
      numero: m.match_number,
      jornada: m.matchday,
      fecha: m.scheduled_date,
      hora: m.scheduled_time,
      local: m.local ? { id: m.local.id, nombre: m.local.name } : null,
      visita: m.visita ? { id: m.visita.id, nombre: m.visita.name } : null
    }))
  });
}));

// GET /api/incidents/persons?q= -> búsqueda en el padrón (con sus equipos activos)
router.get('/persons', asyncHandler(async (req, res) => {
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';
  if (q.length < 2) return res.json({ data: [] });
  const { data, error } = await supabase
    .from('persons')
    .select('id, first_name, last_name, document_number, team_members(status, equipo:teams!team_members_team_id_fkey(id, name))')
    .eq('status', 'ACTIVA')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%`)
    .order('last_name')
    .limit(10);
  lanzar(error);
  res.json({
    data: (data || []).map((p) => ({
      id: p.id,
      nombre: nombrePersona(p),
      cedula: p.document_number,
      equipos: (p.team_members || []).filter((t) => t.status === 'ACTIVO' && t.equipo).map((t) => ({ id: t.equipo.id, nombre: t.equipo.name }))
    }))
  });
}));

// ---------- catálogo de faltas ----------

function leerFalta(b, parcial = false) {
  const campos = {};
  const leer = (clave, fn) => {
    if (parcial && b[clave] === undefined) return;
    fn();
  };
  leer('code', () => {
    const codigo = texto(b.code, 20, 'Código', { obligatorio: true }).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(codigo)) throw new HttpError(400, 'El código solo admite letras, números y guiones');
    campos.code = codigo;
  });
  leer('name', () => { campos.name = texto(b.name, 255, 'Falta', { obligatorio: true }); });
  leer('description', () => { campos.description = texto(b.description, 2000, 'Descripción'); });
  leer('applies_to', () => { campos.applies_to = opcion(b.applies_to, TIPOS_INVOLUCRADO, 'Aplica a'); });
  leer('severity', () => { campos.severity = opcion(b.severity, GRAVEDADES, 'Gravedad'); });
  leer('min_sanction', () => { campos.min_sanction = opcion(b.min_sanction, Object.keys(reglas.TIPOS), 'Sanción mínima'); });
  leer('min_quantity', () => { campos.min_quantity = cantidadOpcional(b.min_quantity, 'La cantidad mínima'); });
  leer('max_sanction', () => { campos.max_sanction = opcion(b.max_sanction, Object.keys(reglas.TIPOS), 'Sanción máxima'); });
  leer('max_quantity', () => { campos.max_quantity = cantidadOpcional(b.max_quantity, 'La cantidad máxima'); });
  leer('recidivism', () => { campos.recidivism = texto(b.recidivism, 120, 'Reincidencia'); });
  if (b.is_active !== undefined) campos.is_active = b.is_active === true;
  return campos;
}

function validarDefinicion(f) {
  const problema = reglas.validarRango({
    aplica: f.applies_to,
    minTipo: f.min_sanction,
    minCantidad: f.min_quantity,
    maxTipo: f.max_sanction,
    maxCantidad: f.max_quantity
  });
  if (problema) throw new HttpError(400, problema);
}

// GET /api/incidents/infractions -> todas las faltas (activas e inactivas)
router.get('/infractions', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('infractions').select(SELECT_FALTA).order('code');
  lanzar(error);
  res.json({ data: (data || []).map(aFalta) });
}));

// POST /api/incidents/infractions
router.post('/infractions', asyncHandler(async (req, res) => {
  const campos = leerFalta(req.body || {});
  validarDefinicion(campos);
  const { data, error } = await supabase.from('infractions').insert(campos).select(SELECT_FALTA).single();
  if (error?.code === '23505') throw new HttpError(409, `Ya existe una falta con el código ${campos.code}`);
  lanzar(error);
  res.status(201).json({ data: aFalta(data) });
}));

// PATCH /api/incidents/infractions/:infractionId
router.patch('/infractions/:infractionId', asyncHandler(async (req, res) => {
  const actual = await buscarFalta(req.params.infractionId).catch(() => {
    throw new HttpError(404, 'Falta no encontrada');
  });
  const cambios = leerFalta(req.body || {}, true);
  if (!Object.keys(cambios).length) throw new HttpError(400, 'No hay cambios para guardar');
  validarDefinicion({ ...actual, ...cambios });
  cambios.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('infractions').update(cambios).eq('id', actual.id).select(SELECT_FALTA).single();
  if (error?.code === '23505') throw new HttpError(409, `Ya existe una falta con el código ${cambios.code}`);
  lanzar(error);
  res.json({ data: aFalta(data) });
}));

// ---------- documentos ----------

// POST /api/incidents/files -> sube una prueba (PDF, JPG o PNG) al almacenamiento privado
router.post(
  '/files',
  express.raw({ type: Object.keys(EXTENSIONES), limit: TAMANO_MAX_ARCHIVO }),
  asyncHandler(async (req, res) => {
    const tipo = (req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    const extension = EXTENSIONES[tipo];
    if (!extension) throw new HttpError(400, 'El archivo debe ser PDF, JPG o PNG');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No se recibió el archivo');

    const ruta = `expedientes/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;
    const subir = () => supabase.storage.from(BUCKET).upload(ruta, req.body, { contentType: tipo });

    let { error } = await subir();
    if (error && /bucket not found/i.test(error.message || '')) {
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

// ---------- expedientes ----------

// GET /api/incidents?tipo=&estado=&competencia=&q=&page=
router.get('/', asyncHandler(async (req, res) => {
  const { tipo, estado, competencia } = req.query;
  const q = req.query.q ? limpiarBusqueda(req.query.q) : '';
  const pagina = /^\d{1,4}$/.test(String(req.query.page || '1')) ? Math.max(1, Number(req.query.page || 1)) : 1;

  let query = supabase.from('disciplinary_cases').select(SELECT_LISTA, { count: 'exact' });

  if (tipo && tipo !== 'todos') {
    const { data, error } = await supabase
      .from('catalog_values')
      .select('id, catalogs!inner(name)')
      .eq('catalogs.name', 'Tipos de incidente')
      .eq('code', String(tipo))
      .maybeSingle();
    lanzar(error);
    if (!data) throw new HttpError(400, 'tipo no es un valor válido');
    query = query.eq('incident_type_value_id', data.id);
  }

  // RESUELTO y CON_SANCION se distinguen por las sanciones vigentes: se filtran después de leer.
  const calculado = estado === 'RESUELTO' || estado === 'CON_SANCION';
  if (estado && estado !== 'todos') {
    opcion(estado, ESTADOS, 'estado');
    query = query.eq('status', calculado ? 'CON_SANCION' : estado);
  }
  if (competencia && competencia !== 'todas') query = query.eq('competition_id', uuid(competencia, 'competencia'));

  // Búsqueda por número, título, persona o equipo involucrado.
  if (q) {
    const [personas, equipos] = await Promise.all([
      supabase.from('persons').select('id').or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`).limit(200),
      supabase.from('teams').select('id').or(`name.ilike.%${q}%,short_name.ilike.%${q}%`).limit(200)
    ]);
    lanzar(personas.error);
    lanzar(equipos.error);
    const idsPersonas = (personas.data || []).map((p) => p.id);
    const idsEquipos = (equipos.data || []).map((e) => e.id);
    let casos = [];
    if (idsPersonas.length || idsEquipos.length) {
      const filtros = [];
      if (idsPersonas.length) filtros.push(`person_id.in.(${idsPersonas.join(',')})`);
      if (idsEquipos.length) filtros.push(`team_id.in.(${idsEquipos.join(',')})`);
      const r = await supabase.from('case_parties').select('case_id').or(filtros.join(',')).limit(1000);
      lanzar(r.error);
      casos = [...new Set((r.data || []).map((p) => p.case_id))];
    }
    const condiciones = [`title.ilike.%${q}%`, `case_number.ilike.%${q}%`];
    if (casos.length) condiciones.push(`id.in.(${casos.join(',')})`);
    query = query.or(condiciones.join(','));
  }

  query = query.order('created_at', { ascending: false }).order('id');
  const desde = (pagina - 1) * POR_PAGINA;
  if (!calculado) query = query.range(desde, desde + POR_PAGINA - 1);

  const { data, error, count } = await query;
  lanzar(error);

  let filas = (data || []).map((c) => ({ ...c, estado: estadoVisible(c) }));
  let total = count || 0;
  if (calculado) {
    filas = filas.filter((c) => c.estado === estado);
    total = filas.length;
    filas = filas.slice(desde, desde + POR_PAGINA);
  }

  res.json({
    data: {
      items: filas.map((c) => ({
        id: c.id,
        numero: c.case_number,
        titulo: c.title,
        abierto: c.created_at,
        tipo: c.tipo,
        partido: textoPartido(c.partido),
        involucra: involucra(c.case_parties),
        estado: c.estado
      })),
      total,
      page: pagina,
      page_size: POR_PAGINA
    }
  });
}));

// POST /api/incidents -> abre un expediente
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const competencia = uuid(b.competition_id, 'Competencia', { obligatorio: true });
  const partido = uuid(b.match_id, 'Partido', { obligatorio: true });
  const tipo = texto(b.incident_type_code, 50, 'Tipo de incidente', { obligatorio: true });
  const titulo = texto(b.title, 255, 'Título del incidente', { obligatorio: true });
  const hechos = texto(b.facts, 5000, 'Hechos', { obligatorio: true });

  const ocurrido = new Date(b.occurred_at);
  if (!b.occurred_at || Number.isNaN(ocurrido.getTime())) throw new HttpError(400, 'Fecha y hora del hecho es obligatoria');
  if (ocurrido.getTime() > Date.now() + 60 * 1000) throw new HttpError(400, 'La fecha del hecho no puede estar en el futuro');

  const dias = b.defense_days === undefined || b.defense_days === null || b.defense_days === '' ? 0 : Number(b.defense_days);
  if (!Number.isInteger(dias) || dias < 0 || dias > 60) throw new HttpError(400, 'El plazo para descargo debe estar entre 0 y 60 días hábiles');

  if (!Array.isArray(b.parties) || !b.parties.length) throw new HttpError(400, 'Agregue al menos un involucrado');
  if (b.parties.length > 20) throw new HttpError(400, 'Un expediente admite como máximo 20 involucrados');
  const partes = b.parties.map((p, i) => {
    const n = `Involucrado ${i + 1}`;
    const tipoParte = opcion(p?.party_type, TIPOS_INVOLUCRADO, `${n}: tipo`);
    const parte = {
      party_type: tipoParte,
      person_id: tipoParte === 'PERSONA' ? uuid(p.person_id, `${n}: persona`, { obligatorio: true }) : null,
      team_id: tipoParte === 'SEDE' ? null : uuid(p.team_id, `${n}: equipo`, { obligatorio: tipoParte === 'EQUIPO' }),
      venue_name: tipoParte === 'SEDE' ? texto(p.venue_name, 255, `${n}: sede`, { obligatorio: true }) : null,
      role_in_case: opcion(p.role_in_case || 'DENUNCIADO', ROLES, `${n}: rol`),
      participation: texto(p.participation, 120, `${n}: participa como`)
    };
    return parte;
  });

  const documentos = (Array.isArray(b.documents) ? b.documents : []).slice(0, 10).map((d, i) => ({
    titulo: texto(d?.title, 255, `Prueba ${i + 1}: título`) || 'Prueba inicial',
    ...archivo(d?.file, `Prueba ${i + 1}`)
  }));

  // Valida el tipo de incidente antes de llamar al procedimiento (así un código malo da 400 y no 404).
  const { data: valorTipo, error: errorTipo } = await supabase
    .from('catalog_values')
    .select('id, catalogs!inner(name)')
    .eq('catalogs.name', 'Tipos de incidente')
    .eq('code', tipo)
    .maybeSingle();
  lanzar(errorTipo);
  if (!valorTipo) throw new HttpError(400, 'Tipo de incidente no válido');

  const { data: id, error } = await supabase.rpc('sp_open_disciplinary_case', {
    p_competition_id: competencia,
    p_match_id: partido,
    p_incident_type_code: tipo,
    p_title: titulo,
    p_facts: hechos,
    p_occurred_at: ocurrido.toISOString(),
    p_moment_detail: texto(b.moment_detail, 255, 'Momento'),
    p_reported_by: texto(b.reported_by, 255, 'Reportado por'),
    p_responsible_user_id: uuid(b.responsible_user_id, 'Responsable') || req.usuario?.id || null,
    p_defense_deadline: dias ? sumarDiasHabiles(hoy(), dias) : null,
    p_notify_involved: b.notify_involved !== false,
    p_parties: partes,
    p_admin_user: req.currentUser,
    p_admin_name: actor(req)
  });
  lanzar(error);

  for (const d of documentos) {
    const { error: errorDoc } = await supabase
      .from('case_documents')
      .insert({ case_id: id, title: d.titulo, file_path: d.path, file_name: d.name, uploaded_by: req.currentUser });
    lanzar(errorDoc);
    await registrarEvento(id, 'DOCUMENTO', `Prueba inicial agregada: ${d.titulo}`, actor(req));
  }

  const { data: creado } = await supabase.from('disciplinary_cases').select('case_number').eq('id', id).maybeSingle();
  res.status(201).json({ data: { id, numero: creado?.case_number || null } });
}));

// GET /api/incidents/:id -> expediente completo
router.get('/:id', asyncHandler(async (req, res) => {
  const { data: c, error } = await supabase
    .from('disciplinary_cases')
    .select(`id, case_number, title, facts, status, occurred_at, moment_detail, reported_by, created_at,
      defense_deadline, notify_involved, archived_reason, proposed_party_id, infraction_id,
      proposed_sanction, proposed_quantity, resolution_basis, opened_by,
      tipo:catalog_values!disciplinary_cases_incident_type_value_id_fkey(code, value),
      competencia:competitions!disciplinary_cases_competition_id_fkey(id, name),
      partido:matches!disciplinary_cases_match_id_fkey(${SELECT_PARTIDO}, sede:catalog_values!fk_matches_venue(value)),
      responsable:user_profiles!disciplinary_cases_responsible_user_id_fkey(id, full_name)`)
    .eq('id', req.params.id)
    .maybeSingle();
  lanzar(error);
  if (!c) throw new HttpError(404, 'Expediente no encontrado');

  const [partes, eventos, documentos, sanciones] = await Promise.all([
    supabase.from('case_parties').select(SELECT_PARTES).eq('case_id', c.id).order('created_at'),
    supabase.from('case_events').select('id, event_type, description, actor, occurred_at').eq('case_id', c.id).order('occurred_at'),
    supabase.from('case_documents').select('id, title, file_path, file_name, uploaded_by, created_at, updated_at').eq('case_id', c.id).order('created_at'),
    supabase
      .from('sanctions')
      .select('id, party_id, sanction_type, quantity, start_date, end_date, served_in, basis, status, applied_by, applied_at, falta:infractions!sanctions_infraction_id_fkey(code, name)')
      .eq('case_id', c.id)
      .order('applied_at')
  ]);
  lanzar(partes.error);
  lanzar(eventos.error);
  lanzar(documentos.error);
  lanzar(sanciones.error);

  // Antecedentes: sanciones de las mismas personas en otros expedientes.
  const idsPersonas = (partes.data || []).map((p) => p.person_id).filter(Boolean);
  let previas = [];
  if (idsPersonas.length) {
    const r = await supabase
      .from('sanctions')
      .select('person_id, sanction_type, quantity, start_date, case_id')
      .in('person_id', idsPersonas)
      .neq('case_id', c.id)
      .eq('status', 'VIGENTE');
    lanzar(r.error);
    previas = r.data || [];
  }

  const urls = await firmar((documentos.data || []).map((d) => d.file_path));
  const listaSanciones = (sanciones.data || []).map((s) => ({
    id: s.id,
    parteId: s.party_id,
    tipo: s.sanction_type,
    cantidad: s.quantity,
    etiqueta: reglas.etiqueta(s.sanction_type, s.quantity),
    falta: s.falta ? `${s.falta.code} · ${s.falta.name}` : null,
    inicio: s.start_date,
    fin: s.end_date,
    cumplimiento: s.served_in,
    fundamento: s.basis,
    estado: s.status === 'ANULADA' ? 'ANULADA' : sancionVigente(s) ? 'VIGENTE' : 'CUMPLIDA',
    aplicadaPor: s.applied_by,
    aplicada: s.applied_at
  }));
  const m = c.partido;

  res.json({
    data: {
      id: c.id,
      numero: c.case_number,
      titulo: c.title,
      hechos: c.facts,
      estado: estadoVisible({ status: c.status, sanctions: (sanciones.data || []) }),
      tipo: c.tipo,
      ocurrido: c.occurred_at,
      momento: c.moment_detail,
      reportadoPor: c.reported_by,
      abierto: c.created_at,
      plazoDescargo: c.defense_deadline,
      notificar: c.notify_involved,
      motivoArchivo: c.archived_reason,
      responsable: c.responsable ? { id: c.responsable.id, nombre: c.responsable.full_name } : null,
      competencia: c.competencia,
      partido: m ? {
        id: m.id,
        numero: m.match_number,
        jornada: m.matchday,
        fecha: m.scheduled_date,
        hora: m.scheduled_time,
        sede: m.sede?.value || null,
        local: m.local?.name || '',
        visita: m.visita?.name || ''
      } : null,
      involucrados: (partes.data || []).map((p) => ({
        id: p.id,
        tipo: p.party_type,
        rol: p.role_in_case,
        participa: p.participation,
        nombre: p.party_type === 'PERSONA' ? nombrePersona(p.persona) : p.party_type === 'EQUIPO' ? p.equipo?.name : p.venue_name,
        cedula: p.persona?.document_number || null,
        equipo: p.equipo?.name || null,
        antecedentes: p.person_id
          ? previas.filter((s) => s.person_id === p.person_id).map((s) => `${reglas.etiqueta(s.sanction_type, s.quantity)} (${s.start_date.slice(0, 4)})`)
          : []
      })),
      propuesta: {
        parteId: c.proposed_party_id,
        faltaId: c.infraction_id,
        tipo: c.proposed_sanction,
        cantidad: c.proposed_quantity,
        fundamento: c.resolution_basis
      },
      cronologia: (eventos.data || []).map((e) => ({ id: e.id, tipo: e.event_type, descripcion: e.description, actor: e.actor, fecha: e.occurred_at })),
      documentos: (documentos.data || []).map((d) => ({
        id: d.id,
        titulo: d.title,
        archivo: d.file_name,
        subidoPor: d.uploaded_by,
        url: urls[d.file_path] || null
      })),
      sanciones: listaSanciones
    }
  });
}));

const EDITABLE = ['ABIERTO', 'EN_SEGUIMIENTO'];

// PATCH /api/incidents/:id/proposal -> guarda la propuesta de resolución
router.patch('/:id/proposal', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  if (!EDITABLE.includes(caso.status)) throw new HttpError(409, 'El expediente ya no admite cambios en la propuesta');

  const b = req.body || {};
  const { parte, falta, tipo, cantidad } = await leerSancion(caso, b);
  const fundamento = texto(b.basis, 2000, 'Fundamento');

  const { error } = await supabase
    .from('disciplinary_cases')
    .update({
      proposed_party_id: parte.id,
      infraction_id: falta.id,
      proposed_sanction: tipo,
      proposed_quantity: cantidad,
      resolution_basis: fundamento,
      status: 'EN_SEGUIMIENTO',
      updated_at: new Date().toISOString()
    })
    .eq('id', caso.id);
  lanzar(error);
  await registrarEvento(caso.id, 'PROPUESTA', `Propuesta de resolución: ${falta.code} · ${reglas.etiqueta(tipo, cantidad)} para ${etiquetaParte(parte)}`, actor(req));

  res.json({ data: { id: caso.id, estado: 'EN_SEGUIMIENTO' } });
}));

// GET /api/incidents/:id/sanction-preview?party_id=&infraction_id=&sanction_type=&quantity=
router.get('/:id/sanction-preview', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  const { parte, falta, tipo, cantidad } = await leerSancion(caso, req.query);
  const plazo = await cumplimiento(caso, parte, tipo, cantidad);
  res.json({
    data: {
      etiqueta: reglas.etiqueta(tipo, cantidad),
      rango: reglas.textoRango(falta),
      gravedad: falta.severity,
      falta: `${falta.code} · ${falta.name}`,
      involucrado: etiquetaParte(parte),
      ...plazo
    }
  });
}));

// POST /api/incidents/:id/sanctions -> aplica la sanción
router.post('/:id/sanctions', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  if (caso.status === 'ARCHIVADO') throw new HttpError(409, 'El expediente está archivado');

  const b = req.body || {};
  const { parte, falta, tipo, cantidad } = await leerSancion(caso, b);
  const fundamento = texto(b.basis, 2000, 'Fundamento', { obligatorio: true });
  const plazo = await cumplimiento(caso, parte, tipo, cantidad);

  const { data, error } = await supabase
    .from('sanctions')
    .insert({
      case_id: caso.id,
      party_id: parte.id,
      person_id: parte.person_id,
      team_id: parte.team_id,
      infraction_id: falta.id,
      sanction_type: tipo,
      quantity: cantidad,
      start_date: plazo.inicio,
      end_date: plazo.fin,
      served_in: plazo.texto,
      basis: fundamento,
      applied_by: req.currentUser
    })
    .select('id')
    .single();
  lanzar(error);

  const { error: errorCaso } = await supabase
    .from('disciplinary_cases')
    .update({
      status: 'CON_SANCION',
      proposed_party_id: parte.id,
      infraction_id: falta.id,
      proposed_sanction: tipo,
      proposed_quantity: cantidad,
      resolution_basis: fundamento,
      updated_at: new Date().toISOString()
    })
    .eq('id', caso.id);
  lanzar(errorCaso);
  await registrarEvento(caso.id, 'SANCION', `Sanción aplicada a ${etiquetaParte(parte)}: ${reglas.etiqueta(tipo, cantidad)} (${falta.code}). Se cumple: ${plazo.texto}`, actor(req));

  res.status(201).json({ data: { id: data.id, cumplimiento: plazo.texto } });
}));

// POST /api/incidents/:id/sanctions/:sanctionId/annul -> anula una sanción (con motivo)
router.post('/:id/sanctions/:sanctionId/annul', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  const motivo = texto((req.body || {}).reason, 2000, 'Motivo', { obligatorio: true });

  const { data: sancion, error } = await supabase
    .from('sanctions')
    .select('id, status, sanction_type, quantity')
    .eq('id', req.params.sanctionId)
    .eq('case_id', caso.id)
    .maybeSingle();
  lanzar(error);
  if (!sancion) throw new HttpError(404, 'Sanción no encontrada');
  if (sancion.status === 'ANULADA') throw new HttpError(409, 'La sanción ya estaba anulada');

  const { error: errorUpdate } = await supabase.from('sanctions').update({ status: 'ANULADA' }).eq('id', sancion.id);
  lanzar(errorUpdate);

  // Si ya no queda ninguna sanción sin anular, el expediente vuelve a seguimiento.
  const { count, error: errorConteo } = await supabase
    .from('sanctions')
    .select('id', { count: 'exact', head: true })
    .eq('case_id', caso.id)
    .eq('status', 'VIGENTE');
  lanzar(errorConteo);
  if (!count && caso.status === 'CON_SANCION') {
    const { error: errorCaso } = await supabase
      .from('disciplinary_cases')
      .update({ status: 'EN_SEGUIMIENTO', updated_at: new Date().toISOString() })
      .eq('id', caso.id);
    lanzar(errorCaso);
  }
  await registrarEvento(caso.id, 'NOTA', `Sanción anulada (${reglas.etiqueta(sancion.sanction_type, sancion.quantity)}). Motivo: ${motivo}`, actor(req));

  res.json({ data: { id: sancion.id } });
}));

// POST /api/incidents/:id/archive -> archiva el expediente con su justificación
router.post('/:id/archive', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  if (caso.status === 'ARCHIVADO') throw new HttpError(409, 'El expediente ya está archivado');
  if (caso.status === 'CON_SANCION') throw new HttpError(409, 'Un expediente con sanción no se archiva: anule la sanción primero');

  const motivo = texto((req.body || {}).reason, 2000, 'Justificación', { obligatorio: true });
  if (motivo.length < 10) throw new HttpError(400, 'Explique con más detalle por qué se archiva (al menos 10 caracteres)');

  const { error } = await supabase
    .from('disciplinary_cases')
    .update({ status: 'ARCHIVADO', archived_reason: motivo, updated_at: new Date().toISOString() })
    .eq('id', caso.id);
  lanzar(error);
  await registrarEvento(caso.id, 'ARCHIVO', `Expediente archivado. Justificación: ${motivo}`, actor(req));

  res.json({ data: { id: caso.id, estado: 'ARCHIVADO' } });
}));

// POST /api/incidents/:id/documents -> agrega una prueba o un descargo
router.post('/:id/documents', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  if (caso.status === 'ARCHIVADO') throw new HttpError(409, 'El expediente está archivado');

  const b = req.body || {};
  const titulo = texto(b.title, 255, 'Título del documento', { obligatorio: true });
  const esDescargo = b.kind === 'DESCARGO';
  const doc = archivo(b.file, 'El archivo');

  const { data, error } = await supabase
    .from('case_documents')
    .insert({ case_id: caso.id, title: titulo, file_path: doc.path, file_name: doc.name, uploaded_by: req.currentUser })
    .select('id')
    .single();
  lanzar(error);
  const extension = doc.path.split('.').pop().toUpperCase();
  await registrarEvento(
    caso.id,
    esDescargo ? 'DESCARGO' : 'DOCUMENTO',
    esDescargo ? `Descargo recibido: ${titulo} (${extension})` : `Documento agregado: ${titulo} (${extension})`,
    actor(req)
  );

  res.status(201).json({ data });
}));

// PATCH /api/incidents/:id/documents/:docId -> reemplaza el archivo de un documento
router.patch('/:id/documents/:docId', asyncHandler(async (req, res) => {
  const caso = await buscarCaso(req.params.id);
  if (caso.status === 'ARCHIVADO') throw new HttpError(409, 'El expediente está archivado');
  const doc = archivo((req.body || {}).file, 'El archivo');

  const { data, error } = await supabase
    .from('case_documents')
    .update({ file_path: doc.path, file_name: doc.name, uploaded_by: req.currentUser, updated_at: new Date().toISOString() })
    .eq('id', req.params.docId)
    .eq('case_id', caso.id)
    .select('id, title')
    .maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(404, 'Documento no encontrado');
  await registrarEvento(caso.id, 'DOCUMENTO', `Documento reemplazado: ${data.title}`, actor(req));

  res.json({ data: { id: data.id } });
}));

module.exports = router;
