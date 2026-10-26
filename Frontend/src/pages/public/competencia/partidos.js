// Utilidades puras sobre la lista de partidos de una competencia (la que entrega
// GET /api/public/competitions/:id/matches). Sin React, para poder reutilizarlas en cada pestaña.

export const terminado = (p) => p.status === 'FINALIZADO';
export const pendiente = (p) => p.status !== 'FINALIZADO' && p.status !== 'CANCELADO';

const cronologico = (a, b) =>
  (a.date || '9999').localeCompare(b.date || '9999') ||
  (a.time || '99').localeCompare(b.time || '99') ||
  a.number - b.number;

/** [{ numero, partidos }] ordenado por número de jornada; los partidos de cada una, por fecha y hora. */
export function porJornada(partidos) {
  const mapa = new Map();
  for (const p of partidos) {
    if (!mapa.has(p.matchday)) mapa.set(p.matchday, []);
    mapa.get(p.matchday).push(p);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, lista]) => ({ numero, partidos: lista.sort(cronologico) }));
}

/** Primera jornada con algún partido por jugar, o null. */
export function proximaJornada(partidos) {
  return porJornada(partidos.filter(pendiente))[0] || null;
}

/** Última jornada con partidos finalizados (solo esos partidos), o null. */
export function ultimaJornadaJugada(partidos) {
  const jornadas = porJornada(partidos.filter(terminado));
  return jornadas[jornadas.length - 1] || null;
}

/** Equipos que aparecen en una lista de partidos, ordenados por nombre: [{ id, name }]. */
export function equiposDe(partidos) {
  const mapa = new Map();
  for (const p of partidos) {
    for (const e of [p.home, p.away]) if (e?.id && e.name) mapa.set(e.id, e);
  }
  return [...mapa.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function juegaEn(partido, equipoId) {
  return partido.home?.id === equipoId || partido.away?.id === equipoId;
}

const decimal2 = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal1 = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entero = new Intl.NumberFormat('es-CR');

/** "2,71"; "—" si no hay valor (por ejemplo, ningún set perdido). */
export function cociente(valor) {
  return Number.isFinite(valor) ? decimal2.format(valor) : '—';
}

export function unDecimal(valor) {
  return Number.isFinite(valor) ? decimal1.format(valor) : '—';
}

export function numero(valor) {
  return Number.isFinite(valor) ? entero.format(valor) : '—';
}

/** "Jugadoras" o "Jugadores" según la rama de la competencia. */
export function palabraJugadores(rama) {
  return rama === 'Femenina' ? 'Jugadoras' : 'Jugadores';
}

/** "Jugadoras inscritas" o "Jugadores inscritos". */
export function etiquetaInscritos(rama) {
  return rama === 'Femenina' ? 'Jugadoras inscritas' : 'Jugadores inscritos';
}
