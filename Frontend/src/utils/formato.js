// Formato de fechas para el portal. La API entrega fechas sin hora ("2026-09-12"); se interpretan
// como fechas de calendario, sin zona horaria, para que no se corran un día según el navegador.

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function aFechaUTC(iso) {
  const m = typeof iso === 'string' ? FECHA_ISO.exec(iso) : null;
  if (!m) return null;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const diaMes = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaMesAnio = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const diaSemana = new Intl.DateTimeFormat('es-CR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const limpiar = (texto) => texto.replaceAll('.', '');

/** "12 sept 2026" */
export function fechaCorta(iso) {
  const f = aFechaUTC(iso);
  return f ? limpiar(diaMesAnio.format(f)) : 'Fecha por definir';
}

/** "sáb, 12 sept" */
export function fechaConDia(iso) {
  const f = aFechaUTC(iso);
  return f ? limpiar(diaSemana.format(f)) : 'Fecha por definir';
}

/** "15 ene – 30 nov 2026" */
export function rangoFechas(inicio, fin) {
  const a = aFechaUTC(inicio);
  const b = aFechaUTC(fin);
  if (!a || !b) return a ? `Desde ${fechaCorta(inicio)}` : 'Fechas por definir';
  const mismoAnio = a.getUTCFullYear() === b.getUTCFullYear();
  return `${limpiar((mismoAnio ? diaMes : diaMesAnio).format(a))} – ${limpiar(diaMesAnio.format(b))}`;
}

/** Valor ISO usable en el atributo dateTime de <time>, o undefined. */
export function isoValida(iso) {
  return aFechaUTC(iso) ? iso : undefined;
}

// Fechas con hora (timestamptz), mostradas en la hora de Costa Rica.
const fechaPublicada = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Costa_Rica'
});

/** "20 de octubre de 2026" para un instante ISO con hora; null si no es válido. */
export function fechaLarga(isoConHora) {
  if (typeof isoConHora !== 'string') return null;
  const f = new Date(isoConHora);
  return Number.isNaN(f.getTime()) ? null : fechaPublicada.format(f);
}

const fechaHoraCR = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  timeZone: 'America/Costa_Rica'
});

/** "12 sept 2026, 21:40" (hora de Costa Rica) para un instante ISO con hora; null si no es válido. */
export function fechaHora(isoConHora) {
  if (typeof isoConHora !== 'string') return null;
  const f = new Date(isoConHora);
  return Number.isNaN(f.getTime()) ? null : limpiar(fechaHoraCR.format(f));
}

const soloDiaMes = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const soloDia = new Intl.DateTimeFormat('es-CR', { day: 'numeric', timeZone: 'UTC' });
const soloMes = new Intl.DateTimeFormat('es-CR', { month: 'long', timeZone: 'UTC' });
const semanaCorta = new Intl.DateTimeFormat('es-CR', { weekday: 'short', timeZone: 'UTC' });

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "12 de octubre" */
export function fechaDiaMes(iso) {
  const f = aFechaUTC(iso);
  return f ? soloDiaMes.format(f) : 'Fecha por definir';
}

/** "12 sept" */
export function fechaDiaMesCorto(iso) {
  const f = aFechaUTC(iso);
  return f ? limpiar(diaMes.format(f)) : null;
}

/** "Vie 19 · 20:00", "Sáb 20" o "Por definir". */
export function diaYHora(iso, hora) {
  const f = aFechaUTC(iso);
  if (!f) return 'Por definir';
  const dia = `${mayuscula(limpiar(semanaCorta.format(f)))} ${soloDia.format(f)}`;
  return hora ? `${dia} · ${hora}` : dia;
}

/**
 * Fechas de una jornada a partir de las fechas de sus partidos:
 * "12 de septiembre", "11 y 12 de septiembre", "19 al 21 de septiembre",
 * "30 de septiembre al 2 de octubre". null si ningún partido tiene fecha.
 */
export function fechasJornada(isos) {
  const fechas = [...new Set(isos)].map(aFechaUTC).filter(Boolean).sort((a, b) => a - b);
  if (!fechas.length) return null;
  const a = fechas[0];
  const b = fechas.at(-1);
  if (a.getTime() === b.getTime()) return soloDiaMes.format(a);
  const mismoMes = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (!mismoMes) return `${soloDiaMes.format(a)} al ${soloDiaMes.format(b)}`;
  const consecutivos = fechas.length === 2 && b - a === 86_400_000;
  return `${soloDia.format(a)} ${consecutivos ? 'y' : 'al'} ${soloDia.format(b)} de ${soloMes.format(b)}`;
}

/** "3 al 11 de noviembre" para un rango de fechas (inicio y fin opcionales); null si no hay ninguna. */
export function rangoDias(inicio, fin) {
  return fechasJornada([inicio, fin].filter(Boolean));
}

/** "1 equipo", "3 equipos". */
export function plural(cantidad, uno, varios) {
  return `${cantidad} ${cantidad === 1 ? uno : varios}`;
}
