// Fecha de nacimiento de una persona del padrón: fecha real (no 2026-02-30), no futura, desde 1920
// y con al menos EDAD_MINIMA años (el padrón no registra a menores de esa edad).
// Mismo criterio en Frontend/src/utils/fechaNacimiento.js.

const EDAD_MINIMA = 4;
const DESDE = '1920-01-01';

const hoyCR = (ahora = new Date()) => new Date(ahora.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);

/** Mensaje de error o null si la fecha es válida. */
function errorFechaNacimiento(valor, ahora = new Date()) {
  const t = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 'La fecha de nacimiento no es válida (AAAA-MM-DD).';
  const [a, m, d] = t.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return 'La fecha de nacimiento no existe.';
  const hoy = hoyCR(ahora);
  if (t > hoy) return 'La fecha de nacimiento no puede ser futura.';
  if (t < DESDE) return 'La fecha de nacimiento no puede ser anterior a 1920.';
  const limite = `${Number(hoy.slice(0, 4)) - EDAD_MINIMA}${hoy.slice(4)}`;
  if (t > limite) return `La persona debe tener al menos ${EDAD_MINIMA} años.`;
  return null;
}

module.exports = { errorFechaNacimiento, EDAD_MINIMA };
