// Fechas y horas de partidos: no se programa ni se reprograma un partido para un momento que ya
// pasó. La hora de referencia es la de Costa Rica (UTC-6, sin horario de verano).
const { HttpError } = require('./httpError');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/** Fecha y hora actuales en Costa Rica: { fecha: 'YYYY-MM-DD', hora: 'HH:MM' }. */
function ahoraCR(ahora = new Date()) {
  const iso = new Date(ahora.getTime() - 6 * 3600 * 1000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

/** true si la fecha (y la hora, si viene) es posterior a este momento en Costa Rica. */
function esFutura(fecha, hora, ahora = new Date()) {
  const { fecha: hoy, hora: horaActual } = ahoraCR(ahora);
  if (fecha > hoy) return true;
  if (fecha < hoy) return false;
  return Boolean(hora) && String(hora).slice(0, 5) > horaActual;
}

/** Lanza 400 si la fecha u hora no tienen formato válido o ya pasaron. */
function exigirFechaFutura(fecha, hora, que = 'El partido') {
  if (!FECHA.test(String(fecha || ''))) throw new HttpError(400, 'La fecha no es válida (AAAA-MM-DD).');
  if (hora !== undefined && hora !== null && !HORA.test(String(hora))) throw new HttpError(400, 'La hora no es válida (HH:MM).');
  if (!esFutura(fecha, hora || null)) {
    throw new HttpError(400, `${que} no se puede programar para una fecha u hora que ya pasó.`);
  }
}

module.exports = { ahoraCR, esFutura, exigirFechaFutura };
