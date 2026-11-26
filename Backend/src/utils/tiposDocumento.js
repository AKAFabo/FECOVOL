// Qué tipos de documento corresponden a cada titular. Una cédula o una constancia médica son de una
// persona; los estatutos o la personería jurídica, de la asociación. Los tipos que no están en estas
// listas (por ejemplo, la póliza o uno nuevo que agregue FECOVOL al catálogo) se aceptan para
// cualquier titular. Copia en Frontend/src/utils/tiposDocumento.js; si cambia, cambie las dos.

const SOLO_PERSONA = ['CED', 'DIMEX', 'PAS', 'MED', 'LIC', 'CUR'];
const SOLO_ASOCIACION = ['ACT', 'EST', 'PER'];

const NOMBRE_TITULAR = { PERSONA: 'una persona', EQUIPO: 'un equipo', ASOCIACION: 'la asociación' };

/** @param {string} codigo  Código del catálogo «Tipos de documento». @param {'PERSONA'|'EQUIPO'|'ASOCIACION'} titular */
function tipoPermitido(codigo, titular) {
  if (SOLO_PERSONA.includes(codigo)) return titular === 'PERSONA';
  if (SOLO_ASOCIACION.includes(codigo)) return titular === 'ASOCIACION';
  return true;
}

module.exports = { tipoPermitido, NOMBRE_TITULAR };
