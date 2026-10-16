// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  res.status(status).json({
    error: err.message || 'Error interno del servidor',
    detalle: err.detalle || undefined
  });
};
