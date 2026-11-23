const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');

// Exige una sesión (token ya validado por middleware/authenticate.js) de una cuenta activa con rol
// Administrador; los roles salen del ámbito que arma middleware/scopeOrganization.js.
// Deja el perfil en req.usuario ({ id, email, full_name }) para autoría y bitácora.
module.exports = asyncHandler(async (req, res, next) => {
  const scope = req.userScope;
  if (!req.auth || !scope || scope.isPublic) throw new HttpError(401, 'Debe iniciar sesion');

  const esAdmin = (scope.roles || []).some((r) => String(r).trim().toLowerCase() === 'administrador');
  if (!esAdmin) throw new HttpError(403, 'Solo un administrador puede realizar esta accion');

  const id = scope.userId || req.auth.userId;
  const { data: perfil } = await supabase.from('user_profiles').select('id, full_name').eq('id', id).maybeSingle();

  req.usuario = { id, email: req.auth.email, full_name: perfil?.full_name || req.auth.email };
  req.currentUser = req.auth.email;
  next();
});
