// Criterios de los avisos de Competencias (Administración y Personal). Son los mismos que usa
// GET /api/competitions/:id/metrics para contar, así el número de la tarjeta coincide con la lista
// que se abre al pulsar el botón.

/** Fecha de hoy en Costa Rica (UTC-6), YYYY-MM-DD. */
export const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

const EN_JUEGO = ['PROGRAMADO', 'REPROGRAMADO', 'EN_CURSO'];
const POR_JUGAR = ['PROGRAMADO', 'REPROGRAMADO'];

/** Oficiales que siguen designados (las anuladas y rechazadas no cuentan). */
export const oficialesVigentes = (partido) => (partido.arbitraje || []).filter((a) => !['ANULADA', 'RECHAZADA'].includes(a.status));

/** Partido ya disputado (fecha de hoy o anterior) al que le falta el resultado. */
export const pendienteDeResultado = (partido, hoy = hoyCR()) =>
  EN_JUEGO.includes(partido.status) && Boolean(partido.scheduled_date) && partido.scheduled_date <= hoy;

/** Partido por jugarse (hoy o después) que no tiene ningún oficial designado. */
export const sinArbitro = (partido, hoy = hoyCR()) =>
  POR_JUGAR.includes(partido.status) && (!partido.scheduled_date || partido.scheduled_date >= hoy) && oficialesVigentes(partido).length === 0;

/** Filtros que se pueden pedir por la URL (?filtro=) desde las tarjetas del panel. */
export const FILTROS_ATENCION = {
  reprogramacion: 'Con solicitud de reprogramación',
  'sin-arbitro': 'Sin árbitro designado'
};
