// Reglas y piezas comunes del módulo de arbitraje (rutas de FECOVOL y del cuerpo arbitral).
const supabase = require('../config/supabase');
const { HttpError } = require('./httpError');
const { logDeniedAttempt, getClientIp } = require('./auditLogger');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO = /^[A-Z0-9_]{2,20}$/;

// Oficiales completos por partido: principal, segundo, anotador y juez de línea.
const OFICIALES_POR_PARTIDO = 4;
// Días antes del vencimiento en que una acreditación pasa a "por vencer" (igual que la vista).
const DIAS_AVISO = 30;
// Estados de designación que ocupan el puesto.
const DESIGNACION_VIGENTE = ['PROPUESTA', 'CONFIRMADA'];

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tieneRol = (scope, rol) => (scope?.roles || []).some((r) => {
  const norm = sinTildes(r);
  return norm === rol || (rol === 'administrador' && (norm === 'admin' || norm.includes('administrad')));
});

function esFecha(texto) {
  if (typeof texto !== 'string' || !FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// Fecha de hoy en Costa Rica (UTC-6, sin horario de verano), en AAAA-MM-DD.
function hoyCR(ahora = new Date()) {
  return new Date(ahora.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Quita los caracteres que PostgREST usa como sintaxis dentro de un filtro or().
const limpiarBusqueda = (q) => String(q).replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

function filtroNombreOCedula(q) {
  const digitos = q.replace(/\D/g, '');
  const cedula = /^\d{9}$/.test(q) ? `,document_number.ilike.%${digitos[0]}-${digitos.slice(1, 5)}-${digitos.slice(5)}%` : '';
  return `first_name.ilike.%${q}%,last_name.ilike.%${q}%,document_number.ilike.%${q}%${cedula}`;
}

async function denegar(req, motivo, tabla = 'arbitraje') {
  const scope = req.userScope || {};
  await logDeniedAttempt({
    usuario: scope.userEmail || 'Anónimo',
    accion: 'ACCESO_DENEGADO',
    tabla,
    motivo,
    endpoint: `${req.method} ${req.baseUrl}${req.path}`,
    ip: getClientIp(req),
    datosIntentados: req.method === 'GET' ? req.query : req.body
  });
}

/** FECOVOL: Administrador o Personal de competencias (ámbito GLOBAL). */
function soloFecovol(req, res, next) {
  const scope = req.userScope || { isPublic: true };
  if (scope.isAdmin) return next();
  if (scope.isPublic) return next(new HttpError(401, 'Se requiere iniciar sesión.'));
  denegar(req, 'Intento de usar el módulo de arbitraje de FECOVOL sin rol de FECOVOL')
    .finally(() => next(new HttpError(403, 'Acceso denegado: esta sección es solo para FECOVOL.')));
}

/** Acreditaciones y cursos: solo la Administración de FECOVOL. */
function soloAdministracion(req, res, next) {
  const scope = req.userScope || { isPublic: true };
  if (scope.isPublic) return next(new HttpError(401, 'Se requiere iniciar sesión.'));
  if (tieneRol(scope, 'administrador')) return next();
  denegar(req, `Operación de arbitraje reservada a Administración. Roles: [${(scope.roles || []).join(', ')}]`)
    .finally(() => next(new HttpError(403, 'Acceso denegado: solo la Administración de FECOVOL puede hacer esto.')));
}

/** Valor activo de un catálogo por código, o null. */
async function valorCatalogo(catalogo, codigo) {
  if (!CODIGO.test(codigo || '')) return null;
  const { data } = await supabase
    .from('catalog_values')
    .select('id, code, value, is_active, catalogs!inner(name)')
    .eq('catalogs.name', catalogo)
    .eq('code', codigo)
    .maybeSingle();
  return data && data.is_active !== false ? data : null;
}

/** Cuenta los oficiales que ocupan puesto en cada partido. */
function oficialesVigentes(arbitraje) {
  return (arbitraje || []).filter((a) => DESIGNACION_VIGENTE.includes(a.status));
}

module.exports = {
  UUID,
  CODIGO,
  OFICIALES_POR_PARTIDO,
  DIAS_AVISO,
  DESIGNACION_VIGENTE,
  tieneRol,
  sinTildes,
  esFecha,
  hoyCR,
  sumarDias,
  texto,
  limpiarBusqueda,
  filtroNombreOCedula,
  denegar,
  soloFecovol,
  soloAdministracion,
  valorCatalogo,
  oficialesVigentes
};
