// Asociación sobre la que se consulta (RF-SEG-011).
//
// - Representante: siempre la suya (la del perfil verificado). Si pide otra, se deniega y se anota.
// - FECOVOL: cualquiera, pero tiene que indicarla con ?association_id=.
// - Otros perfiles: no tienen acceso.
const { HttpError } = require('./httpError');
const { logDeniedAttempt, getClientIp } = require('./auditLogger');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function denegar(req, motivo, tabla) {
  await logDeniedAttempt({
    usuario: req.userScope?.userEmail || 'Anónimo',
    accion: 'ACCESO_DENEGADO',
    tabla,
    motivo,
    endpoint: `${req.method} ${req.baseUrl}${req.path}`,
    ip: getClientIp(req),
    datosIntentados: req.method === 'GET' ? req.query : req.body
  });
}

/**
 * @param {import('express').Request} req
 * @param {string} tabla  Para la bitácora de intentos denegados.
 * @returns {Promise<string>} id de la asociación
 */
async function asociacionConsultada(req, tabla) {
  const scope = req.userScope || { isPublic: true };
  const pedida = req.query.association_id ?? req.body?.association_id;

  if (scope.isPublic) throw new HttpError(401, 'Se requiere iniciar sesión.');

  if (scope.isAssociation) {
    if (pedida && pedida !== scope.organizationId) {
      await denegar(req, `Intento de consultar la información de otra asociación (${String(pedida).slice(0, 60)})`, tabla);
      throw new HttpError(403, 'Acceso denegado: solo puede consultar la información de su asociación.');
    }
    return scope.organizationId;
  }

  if (scope.isAdmin) {
    if (!UUID.test(pedida || '')) throw new HttpError(400, 'Indique la asociación (association_id).');
    return pedida;
  }

  await denegar(req, 'Intento de consultar información de una asociación sin ser su representante ni FECOVOL', tabla);
  throw new HttpError(403, 'Su rol no tiene acceso a esta información.');
}

module.exports = { asociacionConsultada, denegarAsociacion: denegar };
