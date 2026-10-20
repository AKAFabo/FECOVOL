// Acceso a los datos públicos de competencias (GET /api/public/competitions...).
import { obtener } from './apiPublica.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdValido(id) {
  return typeof id === 'string' && UUID.test(id);
}

function ruta(id, sufijo = '') {
  if (!esIdValido(id)) throw new Error('Identificador de competencia inválido');
  return `/competitions/${encodeURIComponent(id)}${sufijo}`;
}

// Cómo se muestra cada estado de competencia. `tono` corresponde a las clases .pastilla--*.
export const ESTADO_COMPETENCIA = Object.freeze({
  INSCRIPCIONES: { texto: 'Inscripciones abiertas', tono: 'aviso', grupo: 'inscripciones' },
  EN_CURSO: { texto: 'En curso', tono: 'ok', grupo: 'en-curso' },
  FINALIZADA: { texto: 'Finalizada', tono: 'neutra', grupo: 'finalizadas' },
  CERRADA: { texto: 'Finalizada', tono: 'neutra', grupo: 'finalizadas' }
});

export const ESTADO_PARTIDO = Object.freeze({
  PROGRAMADO: { texto: 'Programado', tono: 'neutra' },
  EN_CURSO: { texto: 'En juego', tono: 'ok' },
  FINALIZADO: { texto: 'Final', tono: 'neutra' },
  SUSPENDIDO: { texto: 'Suspendido', tono: 'aviso' },
  CANCELADO: { texto: 'Cancelado', tono: 'aviso' }
});

export function estadoCompetencia(status) {
  return ESTADO_COMPETENCIA[status] || { texto: 'Competencia', tono: 'neutra', grupo: 'otras' };
}

export function estadoPartido(status) {
  return ESTADO_PARTIDO[status] || { texto: 'Por confirmar', tono: 'neutra' };
}

export function listarCompetencias(opciones) {
  return obtener('/competitions', opciones);
}

export function obtenerCompetencia(id, opciones) {
  return obtener(ruta(id), opciones);
}

export function obtenerPosiciones(id, opciones) {
  return obtener(ruta(id, '/standings'), opciones);
}

export function obtenerPartidos(id, opciones) {
  return obtener(ruta(id, '/matches'), opciones);
}
