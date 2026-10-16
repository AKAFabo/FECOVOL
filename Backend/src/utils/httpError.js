class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Traduce los errores de Postgres y PostgREST a codigos HTTP.
function fromSupabase(error, contexto) {
  if (!error) return null;

  const code = error.code;
  const mensaje = error.message || 'Error de base de datos';

  if (code === '23505') return new HttpError(409, 'Ya existe un registro con esos datos: ' + mensaje);
  if (code === '23503') return new HttpError(409, 'El registro esta referenciado por otro: ' + mensaje);
  if (code === '23514') return new HttpError(400, 'Valor no permitido: ' + mensaje);
  if (code === '22P02' || code === '22007' || code === '22008') {
    return new HttpError(400, 'Formato de dato invalido: ' + mensaje);
  }
  if (code === 'PGRST116') return new HttpError(404, (contexto || 'Registro') + ' no encontrado');

  // RAISE EXCEPTION de los procedimientos almacenados
  if (code === 'P0001') {
    if (/^No existe/i.test(mensaje)) return new HttpError(404, mensaje);
    if (/ya existe/i.test(mensaje)) return new HttpError(409, mensaje);
    return new HttpError(400, mensaje);
  }

  const err = new HttpError(500, mensaje);
  err.detalle = error.details || null;
  return err;
}

module.exports = { HttpError, fromSupabase };
