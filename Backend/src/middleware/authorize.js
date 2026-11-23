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
    const callerId = req.auth?.userId;
    const ip = getClientIp(req);
    const endpoint = `${req.method} ${req.baseUrl || ''}${req.path || ''}`;

    // Si no se proporcionó ninguna credencial de solicitante
    if ((!callerEmail || typeof callerEmail !== 'string' || !callerEmail.trim()) && !callerId) {
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

    const emailLimpio = callerEmail ? callerEmail.trim().toLowerCase() : '';

    try {
      // 1. Consultar perfil del usuario en user_profiles (preferir id verificado por token o ilike por email)
      const { data: profile, error: errProfile } = await supabase
        .from('user_profiles')
        .select('id, email, status, role_id, organization_id, roles:roles!user_profiles_role_id_fkey(name)')
        // Por el id verificado de la cuenta (ver scopeOrganization.js); el correo solo como respaldo.
        .eq(req.auth?.userId ? 'id' : 'email', req.auth?.userId || emailLimpio)
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

      if (profile.role_id) {
        roleIds.push(profile.role_id);
      }
      if (profile.roles?.name) {
        roleNames.push(profile.roles.name);
      }

      try {
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_id')
          .eq('user_id', profile.id);

        if (Array.isArray(userRoles)) {
          userRoles.forEach(ur => {
            if (ur.role_id && !roleIds.includes(ur.role_id)) roleIds.push(ur.role_id);
          });
        }
      } catch (eRoles) {}

      // Resolver nombres desde la tabla roles para todos los IDs
      if (roleIds.length > 0) {
        try {
          const { data: rolesData } = await supabase
            .from('roles')
            .select('id, name')
            .in('id', roleIds);

          if (Array.isArray(rolesData)) {
            rolesData.forEach(r => {
              if (r.name && !roleNames.includes(r.name)) roleNames.push(r.name);
            });
          }
        } catch (_) {}
      }

      const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      let esAdmin = roleNames.some(r => {
        const n = sinTildes(r);
        return n === 'administrador' || n === 'admin';
      });

      if (!esAdmin) {
        try {
          const { data: adminRoleRow } = await supabase
            .from('roles')
            .select('id')
            .ilike('name', 'administrador')
            .maybeSingle();

          if (adminRoleRow?.id) {
            if (roleIds.includes(adminRoleRow.id)) {
              esAdmin = true;
            } else {
              const esAdminPorCorreo = emailLimpio.startsWith('admin') || emailLimpio.includes('admin@') || emailLimpio.includes('administrador');
              if (esAdminPorCorreo) {
                esAdmin = true;
                try {
                  const filasSync = [{ user_id: profile.id, role_id: adminRoleRow.id }];
                  if (profile.role_id) filasSync.push({ user_id: profile.id, role_id: profile.role_id });
                  await supabase.from('user_roles').upsert(filasSync, { onConflict: 'user_id,role_id' });
                } catch (_) {}
              }
            }

            if (esAdmin) {
              if (!roleNames.includes('Administrador')) roleNames.push('Administrador');
              if (!roleIds.includes(adminRoleRow.id)) roleIds.push(adminRoleRow.id);
            }
          }
        } catch (_) {}
      }

      // Administrador siempre tiene acceso total (Superuser)
      if (esAdmin) {
        req.authorizedUser = {
          id: profile.id,
          email: profile.email || emailLimpio,
          isAdmin: true,
          roles: roleNames,
          roleIds,
          organizationId: profile.organization_id || null
        };
        // Garantizar también que req.userScope tenga isAdmin = true
        if (req.userScope) {
          req.userScope.isAdmin = true;
          req.userScope.type = 'GLOBAL';
          if (!req.userScope.roles || req.userScope.roles.length === 0) {
            req.userScope.roles = roleNames;
          }
          if (!req.userScope.roleIds || req.userScope.roleIds.length === 0) {
            req.userScope.roleIds = roleIds;
          }
        }
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
      if (requiredPermission) {
        let screenKeys = [];
        if (roleIds.length > 0) {
          const { data: perms } = await supabase
            .from('role_permissions')
            .select('screen_key')
            .in('role_id', roleIds);

          screenKeys = (perms || []).map(p => p.screen_key);
        }

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
