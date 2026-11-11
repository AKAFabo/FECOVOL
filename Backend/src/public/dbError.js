const { HttpError } = require('../utils/httpError');

// Error de base de datos en la API pública: el detalle se guarda en `causa` para la consola del
// servidor y al cliente solo le llega un mensaje genérico.
function fallaBaseDatos(error) {
  const err = new HttpError(503, 'No fue posible obtener la información en este momento.');
  err.causa = error;
  return err;
}

module.exports = { fallaBaseDatos };
