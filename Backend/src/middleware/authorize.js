const supabase = require('../config/supabase');
const { HttpError } = require('../utils/httpError');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

/**
 * Middleware para autorizar operaciones según el perfil y permisos del usuario (RF-SEG-010).
 * Si la autorización falla:
 * 1. Registra automáticamente el intento denegado en public.audit_logs.
 * 2. Responde con HTTP 403 Forbidden o HTTP 401 Unauthorized.
 * 
 * @param {Object} options
 * @param {string} [options.requiredPermission] - Subruta requerida en role_permissions (ej. '/admin/usuarios', '/admin/listas-valores')
 * @param {boolean} [options.requireAdmin] - Si true, exige rol Administrador obligatoriamente
 * @param {string} [options.resourceTable] - Nombre de la tabla para registrar en la bitácora
 *
 * También acepta una lista de roles permitidos: authorize(['Administrador', 'Personal']).
 * Antes esa forma se ignoraba en silencio (se desestructuraba como objeto) y dejaba pasar a
 * cualquier usuario con perfil.
 */
function authorize(options = {}) {
  const allowedRoles = Array.isArray(options) ? options.map((r) => String(r).toLowerCase()) : null;
  const { requiredPermission = null, requireAdmin = false, resourceTable = 'seguridad' } = Array.isArray(options) ? {} : options;
  return async (req, res, next) => {
    // Identidad verificada por middleware/authenticate.js (token de Supabase), nunca un valor que
    // mande el cliente.
    const callerEmail = req.auth?.email;
    const ip = getClientIp(req);
    const endpoint = `${req.method} ${req.baseUrl || ''}${req.path || ''}`;

    // Si no se proporcionó ningún email del solicitante
    if (!callerEmail || typeof callerEmail !== 'string' || !callerEmail.trim()) {
      await logDeniedAttempt({
        usuario: 'Anónimo / Sin encabezado',
        accion: 'ACCESO_DENEGADO',
        tabla: resourceTable,
        motivo: 'Petición administrativa rechazada: la solicitud no trae una sesión válida',
        endpoint,
        ip,
        datosIntentados: req.method !== 'GET' ? req.body : null
      });

      return next(new HttpError(401, 'Acceso denegado: Petición no identificada. Se requiere autenticación.'));
    }

    const emailLimpio = callerEmail.trim().toLowerCase();

    try {
      // 1. Consultar perfil del usuario en user_profiles
      const { data: profile, error: errProfile } = await supabase
        .from('user_profiles')
        .select('id, email, status, role_id, organization_id, roles:roles!user_profiles_role_id_fkey(name)')
        .eq('email', emailLimpio)
        .maybeSingle();

      if (errProfile || !profile) {
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: resourceTable,
          motivo: `El usuario "${emailLimpio}" no existe en user_profiles`,
          endpoint,
          ip,
          datosIntentados: req.method !== 'GET' ? req.body : null
        });

        return next(new HttpError(403, 'Acceso denegado: Perfil de usuario no encontrado en el sistema.'));
      }

      // 2. Verificar que la cuenta no esté suspendida o inhabilitada
      if (profile.status === 'SUSPENDIDA' || profile.status === 'INACTIVA') {
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: resourceTable,
          registroId: profile.id,
          motivo: `Intento de operación con cuenta inhabilitada (Estado: ${profile.status})`,
          endpoint,
          ip,
          datosIntentados: req.method !== 'GET' ? req.body : null
        });

        return next(new HttpError(403, 'Acceso denegado: Su cuenta de usuario está inhabilitada o suspendida.'));
      }

      // 3. Obtener roles asignados desde user_roles (N * M) y perfil base
      const roleIds = [];
      const roleNames = [];

      try {
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_id, roles(id, name)')
          .eq('user_id', profile.id);

        if (userRoles && userRoles.length > 0) {
          userRoles.forEach(ur => {
            if (ur.role_id) roleIds.push(ur.role_id);
            if (ur.roles?.name) roleNames.push(ur.roles.name);
          });
        }
      } catch (eRoles) {}

      if (profile.role_id && !roleIds.includes(profile.role_id)) {
        roleIds.push(profile.role_id);
      }
      if (profile.roles?.name && !roleNames.includes(profile.roles.name)) {
        roleNames.push(profile.roles.name);
      }

      const esAdmin = roleNames.some(r => r.toLowerCase() === 'administrador');

      // Administrador siempre tiene acceso total (Superuser)
      if (esAdmin) {
        req.authorizedUser = {
          id: profile.id,
          email: emailLimpio,
          isAdmin: true,
          roles: roleNames,
          roleIds,
          organizationId: profile.organization_id || null
        };
        return next();
      }

      // Lista de roles permitidos: basta con tener uno de ellos.
      if (allowedRoles) {
        if (roleNames.some((r) => allowedRoles.includes(r.toLowerCase()))) {
          req.authorizedUser = {
            id: profile.id,
            email: emailLimpio,
            isAdmin: false,
            roles: roleNames,
            roleIds,
            organizationId: profile.organization_id || null
          };
          return next();
        }
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: resourceTable,
          registroId: profile.id,
          motivo: `Operación reservada a [${allowedRoles.join(', ')}]. Roles del usuario: [${roleNames.join(', ')}]`,
          endpoint,
          ip,
          datosIntentados: req.method !== 'GET' ? req.body : null
        });
        return next(new HttpError(403, 'Acceso denegado: Su rol no tiene permiso para esta operación.'));
      }

      // Si se requería específicamente rol Administrador y no lo es
      if (requireAdmin) {
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: resourceTable,
          registroId: profile.id,
          motivo: `Operación exclusiva de Administrador. Roles del usuario: [${roleNames.join(', ')}]`,
          endpoint,
          ip,
          datosIntentados: req.method !== 'GET' ? req.body : null
        });

        return next(new HttpError(403, 'Acceso denegado: Esta operación requiere permisos exclusivos de Administrador.'));
      }

      // Si se requería un permiso específico en role_permissions
      if (requiredPermission && roleIds.length > 0) {
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('screen_key')
          .in('role_id', roleIds);

        const screenKeys = (perms || []).map(p => p.screen_key);

        const tienePermiso = screenKeys.includes(requiredPermission) || 
          screenKeys.includes('/admin') ||
          (requiredPermission.startsWith('/admin') && screenKeys.includes('/admin'));

        if (tienePermiso) {
          req.authorizedUser = {
            id: profile.id,
            email: emailLimpio,
            isAdmin: false,
            roles: roleNames,
            roleIds,
            permissions: screenKeys,
            organizationId: profile.organization_id || null
          };
          return next();
        }

        // No tiene el permiso requerido
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: resourceTable,
          registroId: profile.id,
          motivo: `El usuario no tiene el permiso requerido: "${requiredPermission}". Permisos actuales: [${screenKeys.join(', ')}]`,
          endpoint,
          ip,
          datosIntentados: req.method !== 'GET' ? req.body : null
        });

        return next(new HttpError(403, `Acceso denegado: No cuenta con permisos para acceder a ${requiredPermission}.`));
      }

      // Si no se requirió permiso específico pero tampoco es admin
      req.authorizedUser = {
        id: profile.id,
        email: emailLimpio,
        isAdmin: false,
        roles: roleNames,
        roleIds,
        organizationId: profile.organization_id || null
      };
      return next();

    } catch (err) {
      console.error('Error durante verificación de autorización server-side:', err);
      return next(new HttpError(500, 'Error interno verificando permisos de acceso.'));
    }
  };
}

module.exports = authorize;
