// Reglas comunes de ámbito para las rutas de asociaciones, equipos, personas y documentos.
//
// Solo dos ámbitos gestionan estos datos: FECOVOL (Administrador o Personal, ámbito GLOBAL) y el
// representante de una asociación (ámbito ASSOCIATION, limitado a su organización). Un usuario con
// sesión pero de otro rol (por ejemplo, Árbitro) se trata como público para estos datos: no ve
// cédulas, fechas de nacimiento, contactos ni documentos, y no puede crear ni modificar nada.
const { HttpError } = require('./httpError');

function puedeVerPrivado(scope) {
  return Boolean(scope && (scope.isAdmin || scope.isAssociation));
}

function exigirGestion(scope, accion = 'realizar esta operación') {
  if (!scope || scope.isPublic) {
    throw new HttpError(401, `Se requiere iniciar sesión para ${accion}.`);
  }
  if (!scope.isAdmin && !scope.isAssociation) {
    throw new HttpError(403, `Su rol no tiene permiso para ${accion}.`);
  }
}

// Un representante solo actúa sobre registros de su propia asociación. Un registro sin asociación
// (por ejemplo, un árbitro independiente) NO es de su asociación.
function esDeOtraAsociacion(scope, associationId) {
  return Boolean(scope?.isAssociation) && associationId !== scope.organizationId;
}

module.exports = { puedeVerPrivado, exigirGestion, esDeOtraAsociacion };
