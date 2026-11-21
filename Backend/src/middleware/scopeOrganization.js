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
  const ip = getClientIp(req);
  const endpoint = `${req.method} ${req.baseUrl || ''}${req.path || ''}`;

  // Si no se envía encabezado o credencial -> Ámbito 'PUBLIC' por defecto
  if (!callerEmail || typeof callerEmail !== 'string' || !callerEmail.trim()) {
    req.userScope = {
      type: 'PUBLIC',
      isPublic: true,
      isAdmin: false,
      isAssociation: false,
      organizationId: null,
      userEmail: null,
      roles: []
    };
    return next();
  }

  const emailLimpio = callerEmail.trim().toLowerCase();

  try {
    const { data: profile, error: errProfile } = await supabase
      .from('user_profiles')
      .select(`
        id, email, status, organization_id, role_id,
        roles:roles!user_profiles_role_id_fkey(id, name),
        user_roles(roles(id, name))
      `)
      .eq('email', emailLimpio)
      .maybeSingle();

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
        roles: []
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

    // Extraer todos los roles asignados
    const roleNames = [];
    if (profile.roles?.name) roleNames.push(profile.roles.name);
    if (Array.isArray(profile.user_roles)) {
      profile.user_roles.forEach(ur => {
        if (ur.roles?.name && !roleNames.includes(ur.roles.name)) {
          roleNames.push(ur.roles.name);
        }
      });
    }

    // Determinar si tiene alcance general de FECOVOL
    const esFecovolAdmin = roleNames.some(r => {
      const n = r.toLowerCase();
      return n === 'administrador' || n === 'personal' || n.includes('fecovol');
    });

    if (esFecovolAdmin) {
      req.userScope = {
        type: 'GLOBAL',
        isPublic: false,
        isAdmin: true,
        isAssociation: false,
        organizationId: profile.organization_id || null,
        userEmail: emailLimpio,
        userId: profile.id,
        roles: roleNames
      };
      return next();
    }

    // Determinar si es Representante de Asociación
    if (profile.organization_id) {
      req.userScope = {
        type: 'ASSOCIATION',
        isPublic: false,
        isAdmin: false,
        isAssociation: true,
        organizationId: profile.organization_id,
        userEmail: emailLimpio,
        userId: profile.id,
        roles: roleNames
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
      userEmail: emailLimpio,
      userId: profile.id,
      roles: roleNames
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
