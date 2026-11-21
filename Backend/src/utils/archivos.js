// Validación de archivos subidos por los usuarios (documentos y licencias).
//
// No se confía en la extensión ni en el Content-Type que manda el navegador: los dos los escribe
// el cliente. El tipo se decide por los primeros bytes del archivo ("número mágico").
const supabase = require('../config/supabase');

const FIRMAS = [
  { formato: 'PDF', mime: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { formato: 'PNG', mime: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { formato: 'JPG', mime: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] }
];

/** Tipo real del archivo según su contenido, o null si no es PDF, PNG ni JPG. */
function detectarTipo(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return FIRMAS.find((f) => buffer.length >= f.bytes.length && f.bytes.every((b, i) => buffer[i] === b)) || null;
}

/**
 * Nombre de archivo apto para guardar y mostrar: sin rutas, sin caracteres de control ni
 * caracteres que rompan encabezados, y con un largo razonable.
 */
function nombreSeguro(original, extension) {
  const base = String(original || '')
    .split(/[\\/]/).pop()
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sinExtension = base.replace(/\.[^.]{1,5}$/, '').slice(0, 120).trim();
  return `${sinExtension || 'documento'}.${extension}`;
}

// Parámetros del sistema que limitan los archivos (RF-AUD-001). Se leen de la base con una caché
// corta para no consultar en cada subida; si faltan, se usan los valores de la ERS.
const POR_DEFECTO = { maximoMb: 10, formatos: ['PDF', 'JPG', 'PNG'] };
const TOPE_MB = 20; // nunca se acepta más que esto, diga lo que diga el parámetro
const VIGENCIA_MS = 60_000;
let cache = null;

async function limitesDeArchivos() {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  let valor = POR_DEFECTO;
  try {
    const { data } = await supabase
      .from('system_parameters')
      .select('name, value, is_active')
      .in('name', ['EVIDENCIAS_TAMANO_MAXIMO_MB', 'EVIDENCIAS_FORMATOS_PERMITIDOS']);
    const activos = Object.fromEntries((data || []).filter((p) => p.is_active !== false).map((p) => [p.name, p.value]));
    const mb = Number(activos.EVIDENCIAS_TAMANO_MAXIMO_MB);
    const formatos = String(activos.EVIDENCIAS_FORMATOS_PERMITIDOS || '')
      .split(',')
      .map((f) => f.trim().toUpperCase().replace('JPEG', 'JPG'))
      .filter((f) => FIRMAS.some((s) => s.formato === f));
    valor = {
      maximoMb: Number.isFinite(mb) && mb > 0 ? Math.min(mb, TOPE_MB) : POR_DEFECTO.maximoMb,
      formatos: formatos.length ? formatos : POR_DEFECTO.formatos
    };
  } catch {
    /* sin parámetros: valores por defecto */
  }
  cache = { valor, hasta: Date.now() + VIGENCIA_MS };
  return valor;
}

function limpiarCacheLimites() {
  cache = null;
}

module.exports = { detectarTipo, nombreSeguro, limitesDeArchivos, limpiarCacheLimites, TOPE_MB };
