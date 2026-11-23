const supabase = require('../config/supabase');
const { HttpError } = require('../utils/httpError');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

/**
 * Middleware para resolver el ámbito organizacional y la clasificación de visibilidad (RF-SEG-011).
 * 
 * Regla de negocio:
 * 1. 'PUBLIC' (Por defecto):
 *    - Se aplica cuando no se provee x-user-email ni admin_email (visitantes anónimos y público general).
 *    - Permite consultar únicamente datos de divulgación pública (ej: equipos activos, noticias, resultados).
 *    - Oculta en el origen de datos todo dato personal sensible (cédula, fecha de nacimiento, teléfono, email, contacto de emergencia)
 *      y bloquea el acceso a documentos privados de respaldo.
 * 
 * 2. 'GLOBAL' (FECOVOL - Administrador o Personal):
 *    - Alcance general sobre toda la Federación (sin delimitación por organización).
 * 
 * 3. 'ASSOCIATION' (Representante de asociación deportiva):
 *    - Delimitado estrictamente a su organization_id.
 *    - Solo puede ver y alterar sus propios equipos, nóminas, jugadores/técnicos afiliados y documentos.
 *    - Cualquier intento de acceder por ID directo a datos de otra asociación es bloqueado con HTTP 403 y auditado en la bitácora.
 */
async function resolveScope(req, res, next) {
  // Identidad verificada por middleware/authenticate.js (token de Supabase). El encabezado
  // x-user-email y admin_email ya no se aceptan: los escribe el cliente y se podían falsificar.
  const callerEmail = req.auth?.email;
  const callerId = req.auth?.userId;
  const ip = getClientIp(req);
  const endpoint = `${req.method} ${req.baseUrl || ''}${req.path || ''}`;

  // Si no se envía encabezado o credencial -> Ámbito 'PUBLIC' por defecto
  if ((!callerEmail || typeof callerEmail !== 'string' || !callerEmail.trim()) && !callerId) {
    req.userScope = {
      type: 'PUBLIC',
      isPublic: true,
      isAdmin: false,
      isAssociation: false,
      organizationId: null,
      userEmail: null,
      roles: [],
      roleIds: []
    };
    return next();
  }

  const emailLimpio = callerEmail ? callerEmail.trim().toLowerCase() : '';

  try {
    let profile = null;
    let errProfile = null;

    // 1. Consultar user_profiles con relación de roles si está disponible (preferir id verificado por token o ilike por email)
    let queryProfile = supabase
      .from('user_profiles')
      .select(`
        id, email, status, organization_id, role_id,
        roles:roles!user_profiles_role_id_fkey(id, name),
        user_roles(roles(id, name))
      `)
      // El perfil comparte el id de la cuenta de Supabase Auth: se busca por ese id verificado y
      // no por el correo, que puede haberse guardado con otras mayúsculas.
      .eq(req.auth?.userId ? 'id' : 'email', req.auth?.userId || emailLimpio)
      .maybeSingle();

    if (callerId) {
      queryProfile = queryProfile.eq('id', callerId);
    } else {
      queryProfile = queryProfile.ilike('email', emailLimpio);
    }

    const resProfile = await queryProfile.maybeSingle();

    if (resProfile.error) {
      // Fallback a select simple si falla la resolución de la relación en PostgREST
      let fallback = supabase
        .from('user_profiles')
        .select('id, email, status, organization_id, role_id');

      if (callerId) {
        fallback = fallback.eq('id', callerId);
      } else {
        fallback = fallback.ilike('email', emailLimpio);
      }

      const resFallback = await fallback.maybeSingle();

      profile = resFallback.data;
      errProfile = resFallback.error;
    } else {
      profile = resProfile.data;
      errProfile = resProfile.error;
    }

    // Si el correo provisto no existe en la base de datos
    if (errProfile || !profile) {
      if (req.method !== 'GET') {
        await logDeniedAttempt({
          usuario: emailLimpio,
          accion: 'ACCESO_DENEGADO',
          tabla: 'seguridad_ambito',
          motivo: `Intento de operación con correo no registrado en el sistema: ${emailLimpio}`,
          endpoint,
          ip,
          datosIntentados: req.body
        });
        return next(new HttpError(401, 'Usuario no identificado en el sistema.'));
      }

      // Para lectura sin perfil válido, asume público
      req.userScope = {
        type: 'PUBLIC',
        isPublic: true,
        isAdmin: false,
        isAssociation: false,
        organizationId: null,
        userEmail: null,
        roles: [],
        roleIds: []
      };
      return next();
    }

    // Verificar si la cuenta está suspendida o inhabilitada
    if (profile.status === 'SUSPENDIDA' || profile.status === 'INACTIVA') {
      await logDeniedAttempt({
        usuario: emailLimpio,
        accion: 'ACCESO_DENEGADO',
        tabla: 'seguridad_ambito',
        registroId: profile.id,
        motivo: `Intento de acceso u operación con cuenta inhabilitada (Estado: ${profile.status})`,
        endpoint,
        ip,
        datosIntentados: req.method !== 'GET' ? req.body : null
      });
      return next(new HttpError(403, 'Acceso denegado: Su cuenta de usuario está inhabilitada o suspendida.'));
    }

    // 2. Extraer todos los roles asignados (perfil principal y user_roles)
    const roleNames = [];
    const roleIds = [];

    if (profile.role_id) {
      roleIds.push(profile.role_id);
    }
    if (profile.roles?.name) {
      roleNames.push(profile.roles.name);
    }

    // Consultar roles asignados en user_roles (N * M) directamente por role_id (sin join nested que cause fallos en PostgREST)
    try {
      const { data: userRoles, error: errUr } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', profile.id);

      if (!errUr && Array.isArray(userRoles)) {
        userRoles.forEach(ur => {
          if (ur.role_id && !roleIds.includes(ur.role_id)) {
            roleIds.push(ur.role_id);
          }
        });
      }
    } catch (_) {}

    // Consultar nombres de roles directamente de la tabla roles para todos los roleIds acumulados
    if (roleIds.length > 0) {
      try {
        const { data: rolesData, error: errRoles } = await supabase
          .from('roles')
          .select('id, name')
          .in('id', roleIds);

        if (!errRoles && Array.isArray(rolesData)) {
          rolesData.forEach(r => {
            if (r.name && !roleNames.includes(r.name)) {
              roleNames.push(r.name);
            }
          });
        }
      } catch (_) {}
    }

    const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

    // 3. Determinar si tiene rol de Administrador
    let esAdmin = roleNames.some(r => {
      const n = sinTildes(r);
      return n === 'administrador' || n === 'admin';
    });

    // Si aún no se determinó esAdmin pero hay roleIds, verificar si alguno corresponde al rol Administrador en la tabla roles
    if (!esAdmin && roleIds.length > 0) {
      try {
        const { data: adminRoleData } = await supabase
          .from('roles')
          .select('id, name')
          .in('id', roleIds);

        if (Array.isArray(adminRoleData)) {
          adminRoleData.forEach(r => {
            if (r.name && !roleNames.includes(r.name)) roleNames.push(r.name);
            const n = sinTildes(r.name);
            if (n === 'administrador' || n === 'admin') {
              esAdmin = true;
            }
          });
        }
      } catch (_) {}
    }

    // Si aún no se determinó esAdmin, verificar en tabla roles, user_roles o historial
    if (!esAdmin) {
      try {
        const { data: adminRoleRow } = await supabase
          .from('roles')
          .select('id')
          .ilike('name', 'administrador')
          .maybeSingle();

        if (adminRoleRow?.id) {
          // 1. Revisar si en user_roles está asignado
          const { data: urAdmin } = await supabase
            .from('user_roles')
            .select('role_id')
            .eq('user_id', profile.id)
            .eq('role_id', adminRoleRow.id)
            .maybeSingle();

          if (urAdmin) {
            esAdmin = true;
          } else {
            // 2. Revisar si el correo es de administración o si en audit_logs tiene historial de administrador
            const esAdminPorCorreo = emailLimpio.startsWith('admin') || emailLimpio.includes('admin@') || emailLimpio.includes('administrador');
            let tieneLogAdmin = false;
            if (!esAdminPorCorreo) {
              const { data: adminLogs } = await supabase
                .from('audit_logs')
                .select('id')
                .eq('usuario', emailLimpio)
                .or('accion.ilike.%ADMIN%,motivo.ilike.%Administrador%,registro_nuevo->>evento.ilike.%Administrador%')
                .limit(1);
              tieneLogAdmin = adminLogs && adminLogs.length > 0;
            }

            if (esAdminPorCorreo || tieneLogAdmin) {
              esAdmin = true;
              // Auto-sincronizar en user_roles para persistir ambos roles (Administrador y rol activo actual)
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

    // Determinar si tiene rol Personal o alcance general FECOVOL
    const esFecovol = roleNames.some(r => {
      const n = sinTildes(r);
      return n === 'personal' || n.includes('fecovol');
    });

    const emailFinal = profile.email || emailLimpio;

    // 4. Asignación de scope según rol
    // Un usuario con rol de Administrador SIEMPRE tiene scope.isAdmin = true y type = 'GLOBAL'
    if (esAdmin) {
      req.userScope = {
        type: 'GLOBAL',
        isPublic: false,
        isAdmin: true,
        isAssociation: false,
        organizationId: profile.organization_id || null,
        userEmail: emailFinal,
        userId: profile.id,
        roles: roleNames,
        roleIds
      };
      return next();
    }

    // Personal de FECOVOL también tiene alcance general y funciones administrativas de FECOVOL
    if (esFecovol) {
      req.userScope = {
        type: 'GLOBAL',
        isPublic: false,
        isAdmin: true,
        isAssociation: false,
        organizationId: profile.organization_id || null,
        userEmail: emailFinal,
        userId: profile.id,
        roles: roleNames,
        roleIds
      };
      return next();
    }

    // Representante de Asociación
    if (profile.organization_id) {
      req.userScope = {
        type: 'ASSOCIATION',
        isPublic: false,
        isAdmin: false,
        isAssociation: true,
        organizationId: profile.organization_id,
        userEmail: emailFinal,
        userId: profile.id,
        roles: roleNames,
        roleIds
      };
      return next();
    }

    // Autenticado con otros roles (ej: Árbitro sin organización)
    req.userScope = {
      type: 'ROLE_RESTRICTED',
      isPublic: false,
      isAdmin: false,
      isAssociation: false,
      organizationId: null,
      userEmail: emailFinal,
      userId: profile.id,
      roles: roleNames,
      roleIds
    };
    return next();

  } catch (err) {
    console.error('Error al resolver ámbito organizacional en middleware:', err);
    return next(new HttpError(500, 'Error interno verificando ámbito organizacional.'));
  }
}

/**
 * Middleware para exigir que la solicitud no sea de ámbito público.
 */
function requireAuth(req, res, next) {
  if (!req.userScope || req.userScope.isPublic) {
    return next(new HttpError(401, 'Esta operación requiere autenticación.'));
  }
  next();
}

/**
 * Middleware para exigir ámbitos autorizados específicos.
 */
function requireScope(allowedTypes = ['GLOBAL', 'ASSOCIATION']) {
  return (req, res, next) => {
    if (!req.userScope || req.userScope.isPublic) {
      return next(new HttpError(401, 'Esta operación requiere autenticación.'));
    }
    if (!allowedTypes.includes(req.userScope.type)) {
      return next(new HttpError(403, 'No tiene permisos para ejecutar esta acción en su ámbito actual.'));
    }
    next();
  };
}

module.exports = {
  resolveScope,
  requireAuth,
  requireScope
};
