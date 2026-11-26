// Reglas del marcador por sets (voleibol de sala, al mejor de cinco): los sets 1 a 4 se ganan a 25 y
// el quinto a 15, siempre con dos puntos de diferencia; si se pasa de la meta, la diferencia es
// exactamente dos (26-24, 27-25…). El partido termina cuando un equipo gana tres sets.
// Es la misma regla que aplica el backend (Backend/src/utils/cierreArbitral.js → validarSets).

/**
 * Revisa los sets tal como están escritos en el formulario.
 * @param {{ home_points: number, away_points: number }[]} sets
 * @returns {{ valido: boolean, completo: boolean, local: number, visita: number, mensaje: string }}
 *   valido: cada set cumple la regla; completo: además un equipo ganó tres sets.
 */
export function revisarSets(sets) {
  const lista = Array.isArray(sets) ? sets : [];
  if (lista.length === 0) return { valido: false, completo: false, local: 0, visita: 0, mensaje: 'Registre al menos un set.' };
  if (lista.length > 5) return { valido: false, completo: false, local: 0, visita: 0, mensaje: 'Un partido no tiene más de cinco sets.' };

  let local = 0;
  let visita = 0;
  for (let i = 0; i < lista.length; i += 1) {
    const n = i + 1;
    const a = Number(lista[i]?.home_points);
    const b = Number(lista[i]?.away_points);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
      return { valido: false, completo: false, local, visita, mensaje: `Los puntos del set ${n} deben ser números enteros entre 0 y 99.` };
    }
    if (local === 3 || visita === 3) {
      return { valido: false, completo: false, local, visita, mensaje: `El partido ya estaba decidido antes del set ${n}; quite ese set.` };
    }
    const meta = n === 5 ? 15 : 25;
    const ganador = Math.max(a, b);
    const perdedor = Math.min(a, b);
    if (a === b || ganador < meta || ganador - perdedor < 2 || (ganador > meta && ganador - perdedor !== 2)) {
      return { valido: false, completo: false, local, visita, mensaje: `Set ${n} (${a}-${b}): se gana a ${meta} puntos con dos de diferencia.` };
    }
    if (a > b) local += 1; else visita += 1;
  }

  const completo = local === 3 || visita === 3;
  return {
    valido: true,
    completo,
    local,
    visita,
    mensaje: completo
      ? `Sets consistentes: local ${local} – visita ${visita}.`
      : `Sets válidos, pero el partido no está completo (${local}-${visita}): un equipo debe ganar tres sets.`
  };
}
