const { HttpError } = require('../utils/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rechaza con 400 cualquier :id o :memberId que no sea un UUID, antes de ir a la base de datos.
module.exports = function validateUuidParams(req, res, next, value, name) {
  if (!UUID.test(value)) return next(new HttpError(400, `${name} debe ser un UUID valido`));
  next();
};
