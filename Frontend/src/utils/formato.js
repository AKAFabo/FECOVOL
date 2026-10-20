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

const limpiar = (texto) => texto.replace(/\./g, '');

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
