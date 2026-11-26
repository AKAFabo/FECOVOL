// Qué tipos de documento corresponden a cada titular. Una cédula o una constancia médica son de una
// persona; los estatutos o la personería jurídica, de la asociación. Los tipos que no están en estas
// listas (por ejemplo, la póliza o uno nuevo que agregue FECOVOL al catálogo) se aceptan para
// cualquier titular. Copia de Backend/src/utils/tiposDocumento.js (manda el backend); si cambia, cambie las dos.

const SOLO_PERSONA = ['CED', 'DIMEX', 'PAS', 'MED', 'LIC', 'CUR'];
const SOLO_ASOCIACION = ['ACT', 'EST', 'PER'];

export const NOMBRE_TITULAR = { PERSONA: 'una persona', EQUIPO: 'un equipo', ASOCIACION: 'la asociación' };

/** @param {string} codigo  Código del catálogo «Tipos de documento». @param {'PERSONA'|'EQUIPO'|'ASOCIACION'} titular */
export function tipoPermitido(codigo, titular) {
  if (SOLO_PERSONA.includes(codigo)) return titular === 'PERSONA';
  if (SOLO_ASOCIACION.includes(codigo)) return titular === 'ASOCIACION';
  return true;
}

