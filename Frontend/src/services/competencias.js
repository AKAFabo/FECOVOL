// Acceso a los datos públicos de competencias (GET /api/public/competitions...).
import { obtener } from './apiPublica.js';
import { esIdValido } from '../utils/ids.js';

export { esIdValido };

function ruta(id, sufijo = '') {
  if (!esIdValido(id)) throw new Error('Identificador de competencia inválido');
  return `/competitions/${encodeURIComponent(id)}${sufijo}`;
}

function rutaEquipo(id, equipoId) {
  if (!esIdValido(equipoId)) throw new Error('Identificador de equipo inválido');
  return ruta(id, `/teams/${encodeURIComponent(equipoId)}`);
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

export function obtenerEstadisticas(id, opciones) {
  return obtener(ruta(id, '/statistics'), opciones);
}

export function listarEquipos(id, opciones) {
  return obtener(ruta(id, '/teams'), opciones);
}

export function obtenerEquipo(id, equipoId, opciones) {
  return obtener(rutaEquipo(id, equipoId), opciones);
}
