// Reglas de las sanciones disciplinarias.
//
// Cada falta del catálogo define una sanción mínima y una máxima dentro de esta escala,
// ordenada de menor a mayor gravedad. Una sanción está "dentro del rango" si queda entre
// la mínima y la máxima al comparar primero el tipo y, si el tipo es el mismo, la cantidad.
const supabase = require('../config/supabase');

const TIPOS = {
  AMONESTACION: { orden: 0, unidad: null, aplica: ['PERSONA', 'EQUIPO', 'SEDE'] },
  MULTA: { orden: 1, unidad: 'colones', aplica: ['PERSONA', 'EQUIPO', 'SEDE'] },
  SUSPENSION_PARTIDOS: { orden: 2, unidad: 'partidos', aplica: ['PERSONA'] },
  SUSPENSION_MESES: { orden: 3, unidad: 'meses', aplica: ['PERSONA'] },
  PERDIDA_PARTIDO: { orden: 4, unidad: null, aplica: ['EQUIPO'] },
  PERDIDA_PUNTOS: { orden: 5, unidad: 'puntos', aplica: ['EQUIPO'] },
  SUSPENSION_SEDE: { orden: 6, unidad: null, aplica: ['SEDE'] },
  EXPULSION: { orden: 7, unidad: null, aplica: ['PERSONA', 'EQUIPO'] }
};

const SUSPENSIONES = ['SUSPENSION_PARTIDOS', 'SUSPENSION_MESES', 'EXPULSION'];

const colones = (n) => `₡${String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Texto de una sanción: 'Suspensión de 2 partidos', 'Multa ₡50 000'... */
function etiqueta(tipo, cantidad) {
  switch (tipo) {
    case 'AMONESTACION': return 'Amonestación';
    case 'MULTA': return cantidad ? `Multa ${colones(cantidad)}` : 'Multa';
    case 'SUSPENSION_PARTIDOS': return cantidad ? `Suspensión de ${plural(cantidad, 'partido', 'partidos')}` : 'Suspensión por partidos';
    case 'SUSPENSION_MESES': return cantidad ? `Suspensión de ${plural(cantidad, 'mes', 'meses')}` : 'Suspensión por meses';
    case 'PERDIDA_PARTIDO': return 'Pérdida del partido';
    case 'PERDIDA_PUNTOS': return cantidad ? `Pérdida del partido y ${plural(cantidad, 'punto', 'puntos')}` : 'Pérdida de puntos';
    case 'SUSPENSION_SEDE': return 'Suspensión de la sede';
    case 'EXPULSION': return 'Expulsión';
    default: return tipo;
  }
}

/** Texto corto para la tabla del catálogo: '1 partido', 'Multa ₡50 000', 'Expulsión'. */
function etiquetaCorta(tipo, cantidad) {
  if (tipo === 'SUSPENSION_PARTIDOS' && cantidad) return plural(cantidad, 'partido', 'partidos');
  if (tipo === 'SUSPENSION_MESES' && cantidad) return plural(cantidad, 'mes', 'meses');
  if (tipo === 'PERDIDA_PUNTOS' && cantidad) return `Pérdida + ${plural(cantidad, 'punto', 'puntos')}`;
  return etiqueta(tipo, cantidad);
}

const comparar = (a, b) => TIPOS[a.tipo].orden - TIPOS[b.tipo].orden || (a.cantidad || 0) - (b.cantidad || 0);

/** Valida que la definición de una falta sea coherente. Devuelve un mensaje de error o null. */
function validarRango({ aplica, minTipo, minCantidad, maxTipo, maxCantidad }) {
  for (const [tipo, cantidad, nombre] of [[minTipo, minCantidad, 'mínima'], [maxTipo, maxCantidad, 'máxima']]) {
    const def = TIPOS[tipo];
    if (!def) return `La sanción ${nombre} no es válida`;
    if (!def.aplica.includes(aplica)) return `La sanción ${nombre} (${etiqueta(tipo)}) no aplica a ${aplica.toLowerCase()}`;
    if (def.unidad && !(Number.isInteger(cantidad) && cantidad > 0)) return `Indique la cantidad de la sanción ${nombre}`;
    if (!def.unidad && cantidad) return `La sanción ${nombre} (${etiqueta(tipo)}) no lleva cantidad`;
  }
  if (comparar({ tipo: minTipo, cantidad: minCantidad }, { tipo: maxTipo, cantidad: maxCantidad }) > 0) {
    return 'La sanción mínima no puede ser más grave que la máxima';
  }
  return null;
}

/**
 * Sanciones que se pueden elegir para una falta:
 * [{ tipo, etiqueta, unidad, cantidadMin, cantidadMax }] (cantidadMax null = sin tope dentro del tipo).
 */
function opcionesDeFalta(falta) {
  return Object.entries(TIPOS)
    .filter(([, def]) =>
      def.aplica.includes(falta.applies_to) &&
      def.orden >= TIPOS[falta.min_sanction].orden &&
      def.orden <= TIPOS[falta.max_sanction].orden)
    .map(([tipo, def]) => ({
      tipo,
      etiqueta: etiqueta(tipo),
      unidad: def.unidad,
      cantidadMin: def.unidad ? (tipo === falta.min_sanction ? falta.min_quantity : 1) : null,
      cantidadMax: def.unidad ? (tipo === falta.max_sanction ? falta.max_quantity : null) : null
    }));
}

/** Texto del rango: '1 a 3 partidos', 'Amonestación a Multa ₡50 000'. */
function textoRango(falta) {
  if (falta.min_sanction === falta.max_sanction && TIPOS[falta.min_sanction].unidad) {
    const unidad = TIPOS[falta.min_sanction].unidad;
    if (falta.min_quantity === falta.max_quantity) return etiquetaCorta(falta.min_sanction, falta.min_quantity);
    return unidad === 'colones'
      ? `${colones(falta.min_quantity)} a ${colones(falta.max_quantity)}`
      : `${falta.min_quantity} a ${falta.max_quantity} ${unidad}`;
  }
  return `${etiqueta(falta.min_sanction, falta.min_quantity)} a ${etiqueta(falta.max_sanction, falta.max_quantity).toLowerCase()}`;
}

/** ¿La sanción elegida está dentro del rango de la falta y aplica al tipo de involucrado? Devuelve un error o null. */
function validarSancion(falta, tipoInvolucrado, tipo, cantidad) {
  if (falta.applies_to !== tipoInvolucrado) {
    return `La falta ${falta.code} aplica a ${falta.applies_to.toLowerCase()}, no a ${tipoInvolucrado.toLowerCase()}`;
  }
  const opcion = opcionesDeFalta(falta).find((o) => o.tipo === tipo);
  if (!opcion) return `${etiqueta(tipo)} está fuera del rango de la falta ${falta.code} (${textoRango(falta)})`;
  if (opcion.unidad) {
    if (!Number.isInteger(cantidad) || cantidad < 1) return 'Indique la cantidad de la sanción';
    if (cantidad < opcion.cantidadMin || (opcion.cantidadMax !== null && cantidad > opcion.cantidadMax)) {
      return `${etiqueta(tipo, cantidad)} está fuera del rango de la falta ${falta.code} (${textoRango(falta)})`;
    }
  } else if (cantidad) {
    return `${etiqueta(tipo)} no lleva cantidad`;
  }
  return null;
}

/** ¿La persona tiene una suspensión o expulsión en curso? (false si el módulo aún no está instalado) */
async function personaSuspendida(personId) {
  const { data, error } = await supabase.rpc('fn_person_is_suspended', { p_person_id: personId });
  if (error) return false;
  return data === true;
}

module.exports = {
  TIPOS,
  SUSPENSIONES,
  etiqueta,
  etiquetaCorta,
  validarRango,
  opcionesDeFalta,
  textoRango,
  validarSancion,
  personaSuspendida
};
