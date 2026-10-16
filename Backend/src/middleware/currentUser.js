// Mientras el modulo de Seguridad no entregue el login, el usuario que ejecuta la
// accion llega en el encabezado x-user-email. Ese valor se le pasa a los
// procedimientos almacenados (p_admin_user) para que quede en la bitacora.
module.exports = function currentUser(req, res, next) {
  req.currentUser = req.header('x-user-email') || 'sistema';
  next();
};
