const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');

// Exige un token de sesion de Supabase (Authorization: Bearer <token>) de una cuenta
// activa con rol Administrador. Deja el perfil en req.usuario.
module.exports = asyncHandler(async (req, res, next) => {
  const encabezado = req.header('authorization') || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Debe iniciar sesion');

  const { data: auth, error: errorAuth } = await supabase.auth.getUser(token);
  if (errorAuth || !auth?.user) throw new HttpError(401, 'La sesion no es valida o ya vencio');

  const { data: perfil, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, status, rol:roles!user_profiles_role_id_fkey(name)')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error || !perfil) throw new HttpError(403, 'El usuario no tiene un perfil en el sistema');
  if (perfil.status === 'SUSPENDIDA') throw new HttpError(403, 'La cuenta esta suspendida');

  // El rol puede estar en user_profiles.role_id (rol principal) o en user_roles (roles adicionales).
  const { data: adicionales, error: errorRoles } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', perfil.id);
  if (errorRoles) throw new HttpError(500, 'No se pudieron consultar los roles del usuario');

  const nombres = [perfil.rol, ...(adicionales || []).map((r) => r.roles)]
    .flat()
    .map((r) => (r?.name || '').trim().toLowerCase());
  if (!nombres.includes('administrador')) {
    throw new HttpError(403, 'Solo un administrador puede realizar esta accion');
  }

  req.usuario = { id: perfil.id, email: perfil.email, full_name: perfil.full_name };
  req.currentUser = perfil.email;
  next();
});
