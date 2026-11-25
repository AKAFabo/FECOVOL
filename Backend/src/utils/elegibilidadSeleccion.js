// Quién puede ser convocado como atleta a una selección nacional, según su categoría y rama.
//
// Categorías (catálogo Categorías):
//   - Sub-N (código U15, U17, U19, U21… o valor "Sub-N"): la edad que la persona cumple en el año
//     del evento es menor que N. Es la regla de la FIVB: en un Sub-17 de 2026 juegan las personas
//     nacidas en 2010 o después.
//   - Mayor (código MAYOR): 18 años cumplidos a la fecha del evento. Sin edad máxima.
//   - Otra categoría sin regla reconocible: no se limita por edad.
// Rama (catálogo Ramas): Femenina exige sexo F, Masculina exige sexo M, Mixta admite ambos.
//
// La fecha de referencia es el inicio del evento de la convocatoria; sin evento, la fecha de hoy.
// El cuerpo técnico no tiene estas restricciones.
//
// El mismo cálculo está en Frontend/src/utils/elegibilidadSeleccion.js para avisar antes de
// convocar; la validación que cuenta es la del backend.

const EDAD_MAYOR = 18;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Regla de edad de una categoría: { tipo: 'SUB', limite } | { tipo: 'MAYOR', minima } | null. */
function reglaCategoria(categoria) {
  if (!categoria) return null;
  const codigo = String(categoria.code || '').toUpperCase();
  const valor = String(categoria.value || '');
  if (codigo === 'MAYOR' || /^mayor$/i.test(valor.trim())) return { tipo: 'MAYOR', minima: EDAD_MAYOR };
  const sub = /^U(\d{1,2})$/.exec(codigo) || /^sub[\s-]?(\d{1,2})$/i.exec(valor.trim());
  if (sub) return { tipo: 'SUB', limite: Number(sub[1]) };
  return null;
}

/** Sexo que exige la rama ('F', 'M') o null si admite ambos. */
function sexoDeRama(rama) {
  const codigo = String(rama?.code || '').toUpperCase();
  if (codigo === 'FEM') return 'F';
  if (codigo === 'MAS') return 'M';
  return null;
}

/** Edad cumplida a una fecha (ambas YYYY-MM-DD). */
function edadA(nacimiento, fecha) {
  const [an, mn, dn] = nacimiento.split('-').map(Number);
  const [af, mf, df] = fecha.split('-').map(Number);
  let edad = af - an;
  if (mf < mn || (mf === mn && df < dn)) edad -= 1;
  return edad;
}

const fechaLarga = (iso) => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

/** Texto corto de lo que pide la selección (para mostrarlo en pantalla). */
function descripcionRequisitos({ rama, categoria, fechaReferencia }) {
  const partes = [];
  const regla = reglaCategoria(categoria);
  if (regla?.tipo === 'SUB') partes.push(`nacidos en ${Number(fechaReferencia.slice(0, 4)) - regla.limite + 1} o después`);
  if (regla?.tipo === 'MAYOR') partes.push(`${regla.minima} años cumplidos al ${fechaLarga(fechaReferencia)}`);
  const sexo = sexoDeRama(rama);
  if (sexo) partes.push(sexo === 'F' ? 'rama femenina' : 'rama masculina');
  return partes;
}

/**
 * Motivo por el que una persona no puede ser convocada como atleta, o null si puede.
 * @param {{ birth_date?: string|null, sex?: string|null }} persona
 * @param {{ rama?: {code,value}|null, categoria?: {code,value}|null, fechaReferencia: string }} seleccion
 */
function motivoNoElegible(persona, { rama, categoria, fechaReferencia }) {
  if (!FECHA.test(fechaReferencia || '')) throw new Error('fechaReferencia inválida');
  const regla = reglaCategoria(categoria);
  const nombreCategoria = categoria?.value || categoria?.code || '';

  if (regla) {
    const nacimiento = persona?.birth_date && FECHA.test(String(persona.birth_date).slice(0, 10)) ? String(persona.birth_date).slice(0, 10) : null;
    if (!nacimiento) return `Falta la fecha de nacimiento en el padrón; sin ella no se puede comprobar la categoría ${nombreCategoria}.`;
    if (regla.tipo === 'SUB') {
      const anio = Number(fechaReferencia.slice(0, 4));
      const primerAnio = anio - regla.limite + 1;
      if (Number(nacimiento.slice(0, 4)) < primerAnio) {
        return `No es de la categoría ${nombreCategoria}: para ${anio} se admiten nacidos en ${primerAnio} o después (nació en ${nacimiento.slice(0, 4)}).`;
      }
    } else if (regla.tipo === 'MAYOR') {
      const edad = edadA(nacimiento, fechaReferencia);
      if (edad < regla.minima) {
        return `No es de la categoría ${nombreCategoria}: se requieren ${regla.minima} años cumplidos al ${fechaLarga(fechaReferencia)} y tendrá ${edad}.`;
      }
    }
  }

  const sexo = sexoDeRama(rama);
  if (sexo) {
    const sexoPersona = String(persona?.sex || '').toUpperCase();
    if (!sexoPersona) return `Falta el sexo en el padrón; sin él no se puede comprobar la rama ${rama.value || ''}.`.replace(' .', '.');
    if (sexoPersona !== sexo) return `No corresponde a la rama ${rama.value || (sexo === 'F' ? 'Femenina' : 'Masculina')} de esta selección.`;
  }
  return null;
}

module.exports = { reglaCategoria, sexoDeRama, edadA, motivoNoElegible, descripcionRequisitos, EDAD_MAYOR };
