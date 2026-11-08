// Usuario que ejecuta la acción, para la bitácora (los procedimientos almacenados lo reciben como
// p_admin_user). Sale del token verificado en middleware/authenticate.js; sin sesión queda
// 'sistema'. Nunca se toma de un encabezado o del cuerpo de la solicitud.
module.exports = function currentUser(req, res, next) {
  req.currentUser = req.auth?.email || 'sistema';
  next();
};
