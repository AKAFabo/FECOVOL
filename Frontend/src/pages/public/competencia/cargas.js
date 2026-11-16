// Cargas de datos de las pestañas de una competencia. Cada una tiene su clave para que useCarga
// la guarde y la comparta: los partidos se piden una vez y los usan Posiciones, Calendario y
// Resultados. La página precarga todo al abrirse, así cambiar de pestaña es inmediato.
import { precargar } from '../../../hooks/useCarga.js';
import {
  listarEquipos,
  obtenerEstadisticas,
  obtenerPartidos,
  obtenerPosiciones
} from '../../../services/competencias.js';

export const CARGAS = {
  posiciones: (id) => ({ clave: `competencia:${id}:posiciones`, cargar: (signal) => obtenerPosiciones(id, { signal }) }),
  partidos: (id) => ({ clave: `competencia:${id}:partidos`, cargar: (signal) => obtenerPartidos(id, { signal }) }),
  equipos: (id) => ({ clave: `competencia:${id}:equipos`, cargar: (signal) => listarEquipos(id, { signal }) }),
  estadisticas: (id) => ({ clave: `competencia:${id}:estadisticas`, cargar: (signal) => obtenerEstadisticas(id, { signal }) })
};

/** Pide en segundo plano los datos de todas las pestañas. */
export function precargarCompetencia(id) {
  for (const carga of Object.values(CARGAS)) {
    const { clave, cargar } = carga(id);
    precargar(clave, () => cargar(undefined));
  }
}
