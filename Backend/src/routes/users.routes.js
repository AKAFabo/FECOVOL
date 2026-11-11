const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const authorize = require('../middleware/authorize');
const { logDeniedAttempt, logFailedLogin, logSystemProcess, getClientIp: getAuditClientIp } = require('../utils/auditLogger');

const router = express.Router();

// POST /api/users/record-denied-attempt -> Registra en bitácora un intento denegado detectado por el frontend (RF-SEG-010)
router.post('/record-denied-attempt', asyncHandler(async (req, res) => {
  const { email, subruta, motivo, user_id, rol } = req.body;
  await logDeniedAttempt({
    usuario: email || 'Usuario anónimo',
    accion: 'ACCESO_DENEGADO',
    tabla: 'rutas_sistema',
    registroId: user_id || null,
    motivo: motivo || `Acceso denegado a "${subruta || 'subruta'}" desde el rol "${rol || 'Sin rol'}"`,
    endpoint: subruta || 'Navegación directa',
    ip: getAuditClientIp(req),
    datosIntentados: { subruta, email, rol, user_id }
  });
  res.status(201).json({ success: true, recorded: true });
}));

// POST /api/users/invite -> Invita un usuario por correo usando Supabase Auth Admin
router.post('/invite', authorize({ requiredPermission: '/admin/usuarios', resourceTable: 'auth.users' }), asyncHandler(async (req, res) => {
  const { email, full_name, role_id, role_ids, organization_id, status, admin_email } = req.body;

  if (!email || !full_name) {
    throw new HttpError(400, 'El correo y el nombre completo son obligatorios');
  }

  // Normalizar lista de roles asignados (RF-SEG-006)
  const roleIds = Array.isArray(role_ids) && role_ids.length > 0
    ? role_ids
    : (role_id ? [role_id] : []);

  const estadoFinal = status || 'PENDIENTE_CONTRASENA';

  // Validación de negocio RF-SEG-006 / RF-SEG-010: Toda cuenta activa debe tener al menos un rol asignado
  if (estadoFinal === 'ACTIVA' && roleIds.length === 0) {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'auth.users',
      motivo: 'Operación denegada: Intento de crear cuenta activa sin roles asignados',
      endpoint: 'POST /api/users/invite',
      ip: getAuditClientIp(req),
      datosIntentados: { email, full_name, status: estadoFinal }
    });

    throw new HttpError(400, 'Operación denegada: Toda cuenta activa debe tener al menos un rol asignado.');
  }

  // 1. Enviar invitación por email con Supabase Admin API
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name }
  });

  const errAuth = fromSupabase(inviteError);
  if (errAuth) throw errAuth;

  const userId = inviteData.user.id;

  // 2. Crear o actualizar el perfil en public.user_profiles
  const primaryRoleId = roleIds[0] || null;
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      email,
      full_name,
      role_id: primaryRoleId,
      organization_id: organization_id || null,
      status: estadoFinal,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  const errProfile = fromSupabase(profileError);
  if (errProfile) throw errProfile;

  // 3. Registrar roles en public.user_roles (N * M)
  if (roleIds.length > 0) {
    try {
      const rows = roleIds.map(rId => ({ user_id: userId, role_id: rId }));
      await supabase.from('user_roles').upsert(rows, { onConflict: 'user_id,role_id' });
    } catch (errUserRoles) {
      console.warn('Aviso: No se pudieron guardar user_roles en BD:', errUserRoles.message);
    }
  }

  // 4. Registrar envío de invitación en bitácora de auditoría (RF-SEG-009)
  try {
    await supabase.from('audit_logs').insert([{
      usuario: admin_email || 'Administrador',
      accion: 'INSERT',
      tabla: 'auth.users',
      registro_id: userId,
      registro_nuevo: {
        evento: 'Envío de invitación con asignación de roles',
        email,
        full_name,
        roles_asignados: roleIds,
        organization_id: organization_id || null,
        status: estadoFinal,
        enviado_por: admin_email || 'Administrador',
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {
    console.warn('Aviso: No se pudo registrar auditoría de invitación:', errAudit.message);
  }

  res.status(201).json({
    message: 'Invitación enviada con éxito',
    data: profile
  });
}));

// POST /api/users/resend-password-link -> Reenvía enlace para definir/restablecer contraseña (RF-SEG-009)
router.post('/resend-password-link', authorize({ requiredPermission: '/admin/usuarios', resourceTable: 'auth.users' }), asyncHandler(async (req, res) => {
  const { user_id, email, admin_email } = req.body;

  if (!user_id && !email) {
    throw new HttpError(400, 'El ID de usuario o el correo electrónico son obligatorios');
  }

  // 1. Obtener perfil de usuario
  let query = supabase.from('user_profiles').select('id, email, full_name, status');
  if (user_id) {
    query = query.eq('id', user_id);
  } else {
    query = query.ilike('email', email.trim());
  }

  const { data: profile, error: errProfile } = await query.maybeSingle();

  if (errProfile || !profile) {
    throw new HttpError(404, 'No se encontró la cuenta de usuario especificada');
  }

  // 2. REGLA DE SEGURIDAD CRÍTICA (RF-SEG-009 / RF-SEG-010): Cuenta suspendida no puede recibir restablecimiento
  if (profile.status === 'SUSPENDIDA') {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'auth.users',
      registroId: profile.id,
      motivo: `Operación denegada: Intento de enviar enlace de acceso a cuenta suspendida (${profile.email})`,
      endpoint: 'POST /api/users/resend-password-link',
      ip: getAuditClientIp(req),
      datosIntentados: { user_id: profile.id, email: profile.email }
    });

    throw new HttpError(
      403,
      'Operación denegada: No se puede enviar un enlace de acceso a una cuenta suspendida. Active la cuenta previamente si desea otorgarle acceso.'
    );
  }

  const emailDestino = profile.email;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // 3. Si la cuenta está ACTIVA, ponerla en PENDIENTE_CONTRASENA (obliga cambio en primer ingreso según ERS RF-SEG-009)
  let nuevoEstado = profile.status;
  if (profile.status === 'ACTIVA') {
    nuevoEstado = 'PENDIENTE_CONTRASENA';
    await supabase
      .from('user_profiles')
      .update({
        status: 'PENDIENTE_CONTRASENA',
        updated_at: new Date().toISOString()
      })
      .eq('id', profile.id);
  }

  // 4. Enviar correo de restablecimiento vía Supabase Auth
  let emailEnviado = false;
  let actionLink = null;

  try {
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailDestino, {
      redirectTo: `${frontendUrl}/restablecer-contrasena`
    });

    if (!resetErr) {
      emailEnviado = true;
    } else {
      console.warn('Aviso de Supabase resetPasswordForEmail en resend-password-link:', resetErr.message);
    }

    // Generar enlace seguro vía Admin API
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: emailDestino,
      options: {
        redirectTo: `${frontendUrl}/restablecer-contrasena`
      }
    });

    if (linkData?.properties?.action_link) {
      actionLink = linkData.properties.action_link;
      console.log('\n========================================================================');
      console.log(`[AUTH ADMIN] ENLACE DE RESTABLECIMIENTO GENERADO PARA: ${emailDestino}`);
      console.log(actionLink);
      console.log('========================================================================\n');
    }
  } catch (errAuth) {
    console.error('Error al generar enlace de restablecimiento en Supabase Auth:', errAuth);
  }

  // 5. REGISTRAR EN BITÁCORA (audit_logs) (RF-SEG-009)
  try {
    await supabase.from('audit_logs').insert([{
      usuario: admin_email || 'Administrador',
      accion: 'UPDATE',
      tabla: 'auth.users',
      registro_id: profile.id,
      registro_nuevo: {
        evento: 'Reenvío de enlace para establecer/restablecer contraseña por administrador',
        destinatario_email: emailDestino,
        destinatario_nombre: profile.full_name,
        solicitado_por: admin_email || 'Administrador',
        nuevo_estado: nuevoEstado,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {
    console.warn('Error al registrar en audit_logs el reenvío de enlace:', errAudit.message);
  }

  res.json({
    success: true,
    emailEnviado,
    nuevoEstado,
    message: `Enlace enviado con éxito a ${emailDestino} y registrado en la bitácora.`,
    devLink: process.env.NODE_ENV !== 'production' ? actionLink : undefined
  });
}));

// POST /api/users/check-pending -> Consulta si una cuenta está en estado PENDIENTE_CONTRASENA
router.post('/check-pending', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.json({ isPending: false });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, status')
    .ilike('email', email.trim())
    .maybeSingle();

  const isPending = profile && (profile.status === 'PENDIENTE_CONTRASENA' || profile.status === 'PENDIENTE');

  return res.json({ isPending: Boolean(isPending) });
}));

// Almacenamiento en memoria para intentos fallidos (resiliente si la tabla de BD no ha sido creada)
const loginAttemptsCache = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

// POST /api/users/check-lockout -> Consulta si un correo/IP está bloqueado temporalmente (RF-SEG-001)
router.post('/check-lockout', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.json({ isLocked: false });
  }

  const emailLimpio = email.trim().toLowerCase();
  const ip = getClientIp(req);
  const cacheKey = `${emailLimpio}::${ip}`;

  // 1. Intentar consultar en base de datos si existe la tabla auth_login_attempts
  try {
    const { data: attempt } = await supabase
      .from('auth_login_attempts')
      .select('failed_attempts, locked_until')
      .eq('email', emailLimpio)
      .eq('ip_address', ip)
      .maybeSingle();

    if (attempt?.locked_until) {
      const lockDate = new Date(attempt.locked_until);
      const now = new Date();
      if (lockDate > now) {
        const remainingMinutes = Math.ceil((lockDate.getTime() - now.getTime()) / 60000);
        return res.json({
          isLocked: true,
          minutesRemaining: remainingMinutes,
          message: `Acceso restringido temporalmente por motivos de seguridad tras 5 intentos fallidos. Intente nuevamente en ${remainingMinutes} minuto(s).`
        });
      }
    }
  } catch (errDb) {
    // Silencioso: fallback a memoria
  }

  // 2. Verificar en caché en memoria
  const cached = loginAttemptsCache.get(cacheKey);
  if (cached?.lockedUntil) {
    const now = Date.now();
    if (cached.lockedUntil > now) {
      const remainingMinutes = Math.ceil((cached.lockedUntil - now) / 60000);
      return res.json({
        isLocked: true,
        minutesRemaining: remainingMinutes,
        message: `Acceso restringido temporalmente por motivos de seguridad tras 5 intentos fallidos. Intente nuevamente en ${remainingMinutes} minuto(s).`
      });
    } else {
      // Bloqueo temporal expiró automáticamente
      loginAttemptsCache.delete(cacheKey);
    }
  }

  return res.json({ isLocked: false });
}));

// POST /api/users/record-failed-login -> Registra intento fallido y bloquea al 5to intento consecutivo (RF-SEG-001)
router.post('/record-failed-login', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.json({ isLocked: false });
  }

  const emailLimpio = email.trim().toLowerCase();
  const ip = getClientIp(req);
  const cacheKey = `${emailLimpio}::${ip}`;

  let attemptsCount = 1;
  const cached = loginAttemptsCache.get(cacheKey);
  if (cached) {
    attemptsCount = (cached.count || 0) + 1;
  }

  let lockedUntil = null;
  const isLocked = attemptsCount >= 5;

  if (isLocked) {
    lockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutos de bloqueo
    loginAttemptsCache.set(cacheKey, { count: attemptsCount, lockedUntil });
    console.warn(`[SEGURIDAD] Bloqueo temporal de 30 min aplicado a: ${emailLimpio} desde IP: ${ip}`);
  } else {
    loginAttemptsCache.set(cacheKey, { count: attemptsCount, lockedUntil: null });
  }

  // Persistir en base de datos si la tabla auth_login_attempts existe
  try {
    await supabase
      .from('auth_login_attempts')
      .upsert({
        email: emailLimpio,
        ip_address: ip,
        failed_attempts: attemptsCount,
        locked_until: lockedUntil ? new Date(lockedUntil).toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'email,ip_address' });
  } catch (dbErr) {
    // Silencioso
  }

  // RF-AUD-003: Registrar en bitácora de auditoría el intento fallido
  try {
    await logFailedLogin({
      email: emailLimpio,
      motivo: isLocked
        ? `Bloqueo temporal de 30 minutos por 5 intentos fallidos consecutivos (IP: ${ip})`
        : `Intento fallido de autenticación (${attemptsCount} de 5)`,
      ip,
      isLocked
    });
  } catch (errAudit) {
    // Silencioso
  }

  return res.json({
    isLocked,
    failedAttempts: attemptsCount,
    remainingAttempts: Math.max(0, 5 - attemptsCount),
    minutesRemaining: isLocked ? 30 : 0
  });
}));

// POST /api/users/record-successful-login -> Reinicia el contador tras autenticación correcta
router.post('/record-successful-login', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.json({ success: true });
  }

  const emailLimpio = email.trim().toLowerCase();
  const ip = getClientIp(req);
  const cacheKey = `${emailLimpio}::${ip}`;

  loginAttemptsCache.delete(cacheKey);

  try {
    await supabase
      .from('auth_login_attempts')
      .delete()
      .eq('email', emailLimpio);
  } catch (e) {
    // Silencioso
  }

  return res.json({ success: true });
}));

// POST /api/users/request-password-reset -> Procesa la solicitud de recuperación de contraseña
router.post('/request-password-reset', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    throw new HttpError(400, 'El correo electrónico es obligatorio');
  }

  const emailLimpio = email.trim().toLowerCase();

  // 1. Buscar perfil del usuario en la base de datos
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, email, status, full_name')
    .ilike('email', emailLimpio)
    .maybeSingle();

  // Si no existe, responder genéricamente sin revelar si el usuario existe (RF-SEG-001)
  if (!profile) {
    return res.json({
      success: true,
      message: 'Si el correo está registrado y activo, se ha enviado un enlace seguro para restablecer la contraseña.'
    });
  }

  // 2. REGLA DE SEGURIDAD CRÍTICA:
  // Si la cuenta está SUSPENDIDA, NO se debe cambiar su estado ni permitir restablecer contraseña.
  if (profile.status === 'SUSPENDIDA') {
    console.warn(`[SEGURIDAD] Intento de cambio de contraseña ignorado para cuenta suspendida: ${emailLimpio}`);
    return res.json({
      success: true,
      message: 'Si el correo está registrado y activo, se ha enviado un enlace seguro para restablecer la contraseña.'
    });
  }

  // 3. Si la cuenta está ACTIVA (o PENDIENTE_CONTRASENA), actualizar su estado a PENDIENTE_CONTRASENA
  const { error: errUpdate } = await supabase
    .from('user_profiles')
    .update({
      status: 'PENDIENTE_CONTRASENA',
      updated_at: new Date().toISOString()
    })
    .eq('id', profile.id);

  if (errUpdate) {
    console.error('Error al actualizar estado a PENDIENTE_CONTRASENA:', errUpdate);
  }

  // 4. Enviar correo de restablecimiento vía Supabase Auth
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  let emailEnviado = false;
  let devActionLink = null;

  try {
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailLimpio, {
      redirectTo: `${frontendUrl}/restablecer-contrasena`
    });

    if (resetErr) {
      console.warn('Aviso de Supabase resetPasswordForEmail (posible rate limit):', resetErr.message);
    } else {
      emailEnviado = true;
    }

    // Generar enlace seguro mediante Admin API como respaldo para desarrollo y testing
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: emailLimpio,
      options: {
        redirectTo: `${frontendUrl}/restablecer-contrasena`
      }
    });

    if (!linkErr && linkData?.properties?.action_link) {
      devActionLink = linkData.properties.action_link;
      console.log('\n========================================================================');
      console.log(`[AUTH] ENLACE DE RECUPERACIÓN GENERADO PARA: ${emailLimpio}`);
      console.log('Copie y pegue esta URL en su navegador para probar la recuperación segura:');
      console.log(devActionLink);
      console.log('========================================================================\n');
    }
  } catch (errAuth) {
    console.error('Excepción al solicitar recuperación en Supabase Auth:', errAuth);
  }

  // Registrar en bitácora de auditoría (RF-SEG-008, RF-SEG-009)
  try {
    await supabase.from('audit_logs').insert([{
      usuario: emailLimpio,
      accion: 'UPDATE',
      tabla: 'auth.users',
      registro_id: profile.id,
      registro_nuevo: {
        evento: 'Solicitud de restablecimiento de contraseña (público)',
        email: emailLimpio,
        nombre: profile.full_name,
        ip: getClientIp(req),
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {
    console.warn('Aviso: No se pudo registrar auditoría de solicitud de restablecimiento:', errAudit.message);
  }

  // Limpiar cualquier bloqueo de intentos fallidos al solicitar recuperación
  const ip = getClientIp(req);
  loginAttemptsCache.delete(`${emailLimpio}::${ip}`);

  return res.json({
    success: true,
    emailEnviado,
    message: 'Si el correo está registrado y activo, se ha enviado un enlace seguro para restablecer la contraseña. Revise su bandeja de entrada (y carpeta de spam).',
    devLink: process.env.NODE_ENV !== 'production' ? devActionLink : undefined
  });
}));

// POST /api/users/establish-password -> Permite establecer la contraseña de una cuenta con contraseña pendiente
router.post('/establish-password', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new HttpError(400, 'El correo y la nueva contraseña son obligatorios');
  }

  if (password.length < 6) {
    throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  }

  // 1. Verificar que el usuario exista y tenga contraseña pendiente
  const { data: profile, error: errProfile } = await supabase
    .from('user_profiles')
    .select('id, email, status, organization_id, roles(name)')
    .ilike('email', email.trim())
    .maybeSingle();

  if (errProfile || !profile) {
    throw new HttpError(400, 'No se encontró una cuenta pendiente con ese correo');
  }

  // REGLA DE SEGURIDAD CRÍTICA: Cuenta suspendida no puede cambiar contraseña ni reactivarse
  if (profile.status === 'SUSPENDIDA') {
    throw new HttpError(403, 'Acceso denegado: Esta cuenta se encuentra suspendida. No está autorizada para cambiar contraseña ni acceder al sistema.');
  }

  if (profile.status !== 'PENDIENTE_CONTRASENA' && profile.status !== 'PENDIENTE') {
    throw new HttpError(400, 'Esta cuenta no tiene un cambio de contraseña pendiente');
  }

  // 2. Establecer contraseña en Supabase Auth mediante API Admin
  const { error: errAuth } = await supabase.auth.admin.updateUserById(profile.id, {
    password
  });

  if (errAuth) {
    const err = fromSupabase(errAuth);
    throw err || new HttpError(500, 'Error al actualizar la contraseña');
  }

  // 3. Actualizar estado a ACTIVA en user_profiles
  const { error: errUpdate } = await supabase
    .from('user_profiles')
    .update({
      status: 'ACTIVA',
      last_login: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', profile.id);

  if (errUpdate) {
    const err = fromSupabase(errUpdate);
    throw err || new HttpError(500, 'Error al actualizar el estado de la cuenta');
  }

  res.status(200).json({
    message: 'Contraseña establecida exitosamente',
    data: { id: profile.id, email: profile.email }
  });
}));

// GET /api/users -> Lista todos los usuarios con sus roles (bypasses RLS con service_role)
router.get('/', authorize({ requiredPermission: '/admin/usuarios', resourceTable: 'user_profiles' }), asyncHandler(async (req, res) => {
  let profiles = [];
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        full_name,
        status,
        last_login,
        role_id,
        organization_id,
        roles:roles!user_profiles_role_id_fkey ( id, name ),
        user_roles (
          role_id,
          roles ( id, name )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback a select sin user_roles si la tabla aún no se ha creado
      const { data: fallbackData, error: errFallback } = await supabase
        .from('user_profiles')
        .select(`
          id,
          email,
          full_name,
          status,
          last_login,
          role_id,
          organization_id,
          roles:roles!user_profiles_role_id_fkey ( id, name )
        `)
        .order('created_at', { ascending: false });
      if (errFallback) throw errFallback;
      profiles = fallbackData || [];
    } else {
      profiles = data || [];
    }
  } catch (err) {
    const httpErr = fromSupabase(err);
    throw httpErr || new HttpError(500, 'Error al obtener usuarios');
  }

  // Normalizar los roles para cada usuario
  const formatProfiles = profiles.map(p => {
    let rolesList = [];
    if (Array.isArray(p.user_roles) && p.user_roles.length > 0) {
      rolesList = p.user_roles.map(ur => ur.roles).filter(Boolean);
    } else if (p.roles) {
      rolesList = [p.roles];
    }
    return {
      ...p,
      roles_list: rolesList,
      role_ids: rolesList.map(r => r.id),
      roles_names: rolesList.map(r => r.name),
      primary_role: p.roles?.name || (rolesList[0]?.name || 'Sin rol')
    };
  });

  res.json({ data: formatProfiles });
}));

// PUT /api/users/:id -> Actualiza perfil de usuario y gestiona múltiples roles (RF-SEG-006 / RF-SEG-010)
router.put('/:id', authorize({ requiredPermission: '/admin/usuarios', resourceTable: 'user_profiles' }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { full_name, role_id, role_ids, organization_id, status, admin_email } = req.body;

  // 1. Consultar estado previo para detectar cambios sensibles (rol o estado)
  const { data: usuarioPrevio } = await supabase
    .from('user_profiles')
    .select('role_id, status, email, full_name, organization_id, roles:roles!user_profiles_role_id_fkey(name)')
    .eq('id', id)
    .single();

  // Consultar roles asignados previamente en user_roles
  let rolesPreviosIds = [];
  try {
    const { data: prevRoles } = await supabase
      .from('user_roles')
      .select('role_id, roles(name)')
      .eq('user_id', id);
    if (prevRoles && prevRoles.length > 0) {
      rolesPreviosIds = prevRoles.map(r => r.role_id);
    } else if (usuarioPrevio?.role_id) {
      rolesPreviosIds = [usuarioPrevio.role_id];
    }
  } catch (e) {
    if (usuarioPrevio?.role_id) rolesPreviosIds = [usuarioPrevio.role_id];
  }

  // Normalizar nuevos role_ids (RF-SEG-006)
  let nuevosRoleIds = null;
  if (Array.isArray(role_ids)) {
    nuevosRoleIds = role_ids;
  } else if (role_id) {
    nuevosRoleIds = [role_id];
  }

  const nuevoEstado = status !== undefined ? status : usuarioPrevio?.status;

  // Validación de negocio RF-SEG-006 / RF-SEG-010: Toda cuenta activa debe tener al menos un rol asignado
  if (nuevoEstado === 'ACTIVA' && nuevosRoleIds !== null && nuevosRoleIds.length === 0) {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'user_profiles',
      registroId: id,
      motivo: `Operación denegada: Intento de dejar cuenta activa sin roles (${usuarioPrevio?.email})`,
      endpoint: `PUT /api/users/${id}`,
      ip: getAuditClientIp(req),
      datosIntentados: { id, email: usuarioPrevio?.email, nuevosRoleIds }
    });

    throw new HttpError(400, 'Operación denegada: Toda cuenta activa debe tener al menos un rol asignado.');
  }

  // Validación RF-SEG-004 / RF-SEG-010: Impedir desactivar o quitar Administrador a la única cuenta Administrador activa
  const tieneRolAdminPrevio = usuarioPrevio?.roles?.name === 'Administrador';
  const esAdminActivo = tieneRolAdminPrevio && usuarioPrevio?.status === 'ACTIVA';
  const vaADesactivar = nuevoEstado && nuevoEstado !== 'ACTIVA';
  
  let vaAQuitarAdmin = false;
  if (esAdminActivo && nuevosRoleIds !== null) {
    const { data: rolAdminData } = await supabase.from('roles').select('id').eq('name', 'Administrador').single();
    if (rolAdminData && !nuevosRoleIds.includes(rolAdminData.id)) {
      vaAQuitarAdmin = true;
    }
  }

  if (esAdminActivo && (vaADesactivar || vaAQuitarAdmin)) {
    const { count, error: errCount } = await supabase
      .from('user_profiles')
      .select('id, roles:roles!user_profiles_role_id_fkey!inner(name)', { count: 'exact', head: true })
      .eq('roles.name', 'Administrador')
      .eq('status', 'ACTIVA')
      .neq('id', id);

    if (!errCount && count === 0) {
      await logDeniedAttempt({
        usuario: admin_email || req.authorizedUser?.email || 'Administrador',
        accion: 'OPERACION_INVALIDA',
        tabla: 'user_profiles',
        registroId: id,
        motivo: `Operación denegada: Intento de remover o desactivar el único Administrador activo (${usuarioPrevio?.email})`,
        endpoint: `PUT /api/users/${id}`,
        ip: getAuditClientIp(req),
        datosIntentados: { id, email: usuarioPrevio?.email, nuevoEstado, nuevosRoleIds }
      });

      throw new HttpError(
        400,
        'Operación denegada: No se puede desactivar o quitar el rol Administrador a la única cuenta Administrador activa en el sistema.'
      );
    }
  }

  // 2. Actualizar user_profiles (solo las celdas provistas de forma aislada, sin efectos colaterales)
  const updatePayload = {
    updated_at: new Date().toISOString()
  };
  if (full_name !== undefined) updatePayload.full_name = full_name;
  if (organization_id !== undefined) updatePayload.organization_id = organization_id || null;
  if (status !== undefined) updatePayload.status = status;
  if (nuevosRoleIds !== null && nuevosRoleIds.length > 0) {
    updatePayload.role_id = nuevosRoleIds[0];
  } else if (nuevosRoleIds !== null && nuevosRoleIds.length === 0) {
    updatePayload.role_id = null;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update(updatePayload)
    .eq('id', id)
    .select(`
      id,
      email,
      full_name,
      status,
      last_login,
      role_id,
      organization_id,
      roles ( id, name )
    `)
    .single();

  if (error) {
    const err = fromSupabase(error);
    throw err || new HttpError(500, 'Error al actualizar usuario');
  }

  // 3. Sincronizar tabla user_roles (N * M)
  if (nuevosRoleIds !== null) {
    try {
      await supabase.from('user_roles').delete().eq('user_id', id);
      if (nuevosRoleIds.length > 0) {
        const rows = nuevosRoleIds.map(rId => ({ user_id: id, role_id: rId }));
        await supabase.from('user_roles').insert(rows);
      }
    } catch (errUr) {
      console.warn('Aviso: Error sincronizando user_roles:', errUr.message);
    }
  }

  // 4. Auditar cambios de roles o alcance organizacional (RF-SEG-006)
  const orgCambio = usuarioPrevio && organization_id !== undefined && usuarioPrevio.organization_id !== organization_id;
  const rolesCambiaron = nuevosRoleIds !== null && (
    nuevosRoleIds.length !== rolesPreviosIds.length ||
    nuevosRoleIds.some(r => !rolesPreviosIds.includes(r))
  );

  if (orgCambio || rolesCambiaron) {
    try {
      await supabase.from('audit_logs').insert([{
        usuario: admin_email || 'Administrador',
        accion: 'UPDATE',
        tabla: 'user_profiles',
        registro_id: id,
        registro_viejo: {
          organization_id: usuarioPrevio?.organization_id,
          roles_ids: rolesPreviosIds
        },
        registro_nuevo: {
          evento: 'Modificación de roles y alcance organizacional',
          organization_id: organization_id !== undefined ? organization_id : usuarioPrevio?.organization_id,
          roles_ids: nuevosRoleIds || rolesPreviosIds,
          solicitado_por: admin_email
        }
      }]);
    } catch (e) {}
  }

  // 5. Comprobar si hubo cambio de rol o de estado para revocar sesión activa (RF-SEG-003)
  const estadoCambio = usuarioPrevio && status && (
    (status === 'SUSPENDIDA' && usuarioPrevio.status !== 'SUSPENDIDA') ||
    (status === 'PENDIENTE_CONTRASENA' && usuarioPrevio.status !== 'PENDIENTE_CONTRASENA')
  );

  let razonRevocacion = null;
  if (rolesCambiaron) {
    razonRevocacion = 'Revocación de sesión por cambio de roles';
  } else if (estadoCambio) {
    razonRevocacion = `Revocación de sesión por cambio de estado a ${status}`;
  }

  if (razonRevocacion) {
    try {
      await supabase.from('audit_logs').insert([{
        usuario: admin_email || 'Administrador',
        accion: 'LOGOUT',
        tabla: 'auth.users',
        registro_id: id,
        registro_viejo: {
          role_id: usuarioPrevio?.role_id,
          rol_nombre: usuarioPrevio?.roles?.name,
          status: usuarioPrevio?.status
        },
        registro_nuevo: {
          evento: razonRevocacion,
          email: data.email,
          nuevo_estado: status,
          razon: razonRevocacion
        }
      }]);
    } catch (errAudit) {}

    try {
      await supabase.rpc('fn_revoke_user_sessions', { p_user_id: id });
    } catch (errRpc) {}
  }

  res.json({
    message: 'Usuario actualizado exitosamente',
    data: {
      ...data,
      role_ids: nuevosRoleIds || rolesPreviosIds
    },
    sessionRevoked: Boolean(razonRevocacion),
    revocationReason: razonRevocacion
  });
}));

// POST /api/users/switch-active-role -> Permite al usuario cambiar su visualización / rol activo (RF-SEG-006 / RF-SEG-010)
router.post('/switch-active-role', asyncHandler(async (req, res) => {
  const { user_id, role_id } = req.body;

  if (!user_id || !role_id) {
    throw new HttpError(400, 'user_id y role_id son requeridos');
  }

  // Verificar cuenta en user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, email, status, role_id')
    .eq('id', user_id)
    .maybeSingle();

  if (!profile || profile.status === 'SUSPENDIDA') {
    await logDeniedAttempt({
      usuario: profile?.email || user_id,
      accion: 'ACCESO_DENEGADO',
      tabla: 'user_profiles',
      registroId: user_id,
      motivo: `Intento de cambio de rol activo desde cuenta ${profile ? profile.status : 'inexistente'}`,
      endpoint: 'POST /api/users/switch-active-role',
      ip: getAuditClientIp(req),
      datosIntentados: { user_id, role_id }
    });

    throw new HttpError(403, 'Acceso denegado: Cuenta suspendida o inexistente.');
  }

  // 1. Verificar que el usuario tenga ese rol asignado en user_roles
  let tieneRol = false;
  try {
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user_id)
      .eq('role_id', role_id)
      .maybeSingle();

    if (userRole) {
      tieneRol = true;
    }
  } catch (e) {}

  if (!tieneRol && profile.role_id === role_id) {
    tieneRol = true;
  }

  if (!tieneRol) {
    await logDeniedAttempt({
      usuario: profile.email || user_id,
      accion: 'ACCESO_DENEGADO',
      tabla: 'user_roles',
      registroId: user_id,
      motivo: `Intento no autorizado de activar rol no asignado (escalación de privilegios para role_id: ${role_id})`,
      endpoint: 'POST /api/users/switch-active-role',
      ip: getAuditClientIp(req),
      datosIntentados: { user_id, role_id, email: profile.email }
    });

    throw new HttpError(403, 'No tiene asignado el rol solicitado');
  }

  // 2. Actualizar role_id activo en user_profiles
  const { data: updated, error } = await supabase
    .from('user_profiles')
    .update({ role_id, updated_at: new Date().toISOString() })
    .eq('id', user_id)
    .select('id, role_id, roles(id, name)')
    .single();

  if (error) {
    throw fromSupabase(error) || new HttpError(500, 'Error al cambiar rol activo');
  }

  res.json({
    success: true,
    message: 'Rol activo actualizado',
    active_role: updated.roles?.name,
    role_id: updated.role_id
  });
}));

// POST /api/users/logout-audit -> Registra en audit_logs el evento de cierre de sesión
router.post('/logout-audit', asyncHandler(async (req, res) => {
  const { user_id, email, full_name, razon } = req.body;
  const usuario = email || 'Usuario';

  const { data, error } = await supabase
    .from('audit_logs')
    .insert([{
      usuario,
      accion: 'LOGOUT',
      tabla: 'auth.users',
      registro_id: user_id ? String(user_id) : null,
      registro_viejo: null,
      registro_nuevo: {
        evento: 'Cierre de sesión',
        email: email || null,
        full_name: full_name || null,
        razon: razon || 'Cierre de sesión manual voluntario',
        timestamp: new Date().toISOString()
      }
    }])
    .select()
    .single();

  if (error) {
    console.error('Error al registrar logout en audit_logs:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ message: 'Logout registrado en bitácora', data });
}));

// GET /api/users/sessions/:userId -> Consulta sesiones activas de un usuario (RF-SEG-003, RF-SEG-007)
router.get('/sessions/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  let sessions = [];
  try {
    const { data, error } = await supabase.rpc('fn_get_user_sessions', { p_user_id: userId });
    if (!error && Array.isArray(data)) {
      sessions = data;
    }
  } catch (err) {
    console.warn('RPC fn_get_user_sessions no disponible:', err.message);
  }

  // Fallback estructurado si la migración de DB no se ha corrido o no hay registros
  if (sessions.length === 0) {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Navegador Web';
    sessions = [{
      id: 'current-session',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ip: clientIp,
      user_agent: userAgent,
      es_actual: true
    }];
  }

  res.json({ data: sessions });
}));

// POST /api/users/revoke-other-sessions -> Cierra otras sesiones abiertas (RF-SEG-007)
router.post('/revoke-other-sessions', asyncHandler(async (req, res) => {
  const { user_id, current_session_id, email } = req.body;

  if (!user_id) {
    throw new HttpError(400, 'El user_id es obligatorio');
  }

  try {
    await supabase.rpc('fn_revoke_other_sessions', {
      p_user_id: user_id,
      p_current_session_id: current_session_id || null
    });
  } catch (errRpc) {
    console.warn('RPC fn_revoke_other_sessions no disponible:', errRpc.message);
  }

  // Auditar evento en bitácora
  try {
    await supabase.from('audit_logs').insert([{
      usuario: email || 'Usuario',
      accion: 'LOGOUT',
      tabla: 'auth.users',
      registro_id: user_id,
      registro_nuevo: {
        evento: 'Cierre de otras sesiones abiertas tras cambio de contraseña',
        email,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (e) {}

  res.json({ message: 'Otras sesiones revocadas con éxito' });
}));

module.exports = router;
