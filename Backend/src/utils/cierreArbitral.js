// Reglas del cierre arbitral (RF-ARB-005): coherencia del marcador por sets y resultados
// especiales. Se valida aquí para dar mensajes claros; el procedimiento almacenado vuelve a
// revisar lo esencial antes de guardar.
const { HttpError } = require('./httpError');

const RESULTADOS = Object.freeze({
  NORMAL: 'Resultado normal',
  NO_PRESENTADO_LOCAL: 'No se presentó el equipo local',
  NO_PRESENTADO_VISITANTE: 'No se presentó el equipo visitante',
  GANADO_POR_DEFECTO_LOCAL: 'Gana el local por defecto',
  GANADO_POR_DEFECTO_VISITANTE: 'Gana el visitante por defecto',
  SUSPENDIDO_DEFINITIVO: 'Partido suspendido'
});

const TIPOS_EVIDENCIA = Object.freeze({
  HOJA_ANOTACION: 'Hoja de anotación',
  FOTO_EQUIPO: 'Fotografía de equipo',
  OTRO: 'Otro documento'
});

/**
 * Valida y normaliza los sets de un partido de voleibol de sala al mejor de cinco:
 * los sets 1 a 4 se ganan a 25 y el quinto a 15, siempre con dos puntos de diferencia; el
 * partido termina cuando un equipo gana tres sets.
 * Con `completo` (al enviar) exige un partido terminado; sin él (borrador) acepta sets parciales.
 */
function validarSets(entrada, { completo }) {
  if (!Array.isArray(entrada)) throw new HttpError(400, 'Los sets deben venir en una lista.');
  if (entrada.length > 5) throw new HttpError(400, 'Un partido no tiene más de cinco sets.');

  const sets = [];
  let local = 0;
  let visita = 0;
  entrada.forEach((s, i) => {
    const n = i + 1;
    const a = Number(s?.home_points);
    const b = Number(s?.away_points);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
      throw new HttpError(400, `Los puntos del set ${n} deben ser números enteros entre 0 y 99.`);
    }
    if (local === 3 || visita === 3) {
      throw new HttpError(400, `El partido ya estaba decidido antes del set ${n}.`);
    }
    const meta = n === 5 ? 15 : 25;
    const ganador = Math.max(a, b);
    const perdedor = Math.min(a, b);
    if (a === b || ganador < meta || ganador - perdedor < 2 || (ganador > meta && ganador - perdedor !== 2)) {
      throw new HttpError(400, `El marcador del set ${n} (${a}-${b}) no es válido: se gana a ${meta} puntos con dos de diferencia.`);
    }
    if (a > b) local += 1; else visita += 1;
    sets.push({ set_number: n, home_points: a, away_points: b });
  });

  if (completo && local !== 3 && visita !== 3) {
    throw new HttpError(400, 'El partido no está completo: un equipo debe ganar tres sets.');
  }
  return { sets, local, visita };
}

/** Datos del cierre que manda el árbitro, ya validados. */
function leerCierre(body, enviar) {
  const b = body || {};
  const tipo = b.result_type || 'NORMAL';
  if (!RESULTADOS[tipo]) throw new HttpError(400, 'El tipo de resultado no es válido.');
  const observaciones = typeof b.observations === 'string' ? b.observations.trim() : '';
  if (observaciones.length > 2000) throw new HttpError(400, 'Las observaciones admiten hasta 2000 caracteres.');
  if (tipo !== 'NORMAL' && enviar && observaciones.length < 10) {
    throw new HttpError(400, 'Explique en las observaciones lo ocurrido con el partido (al menos 10 caracteres).');
  }
  const { sets } = tipo === 'NORMAL' ? validarSets(b.sets || [], { completo: enviar }) : { sets: [] };
  return { tipo, sets, observaciones };
}

module.exports = { RESULTADOS, TIPOS_EVIDENCIA, validarSets, leerCierre };
