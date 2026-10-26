const supabase = require('../config/supabase');

/**
 * Obtiene la dirección IP del cliente a partir de la petición Express.
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

/**
 * Registra un intento denegado o una operación inválida en public.audit_logs (RF-AUD-003 / RF-SEG-010)
 * Garantiza trazabilidad de accesos denegados por rol, permisos o reglas de negocio.
 */
async function logDeniedAttempt({
  usuario = 'Desconocido',
  accion = 'ACCESO_DENEGADO',
  tabla = 'seguridad',
  registroId = null,
  motivo,
  endpoint,
  ip = null,
  datosIntentados = null
}) {
  try {
    await supabase.from('audit_logs').insert([{
      usuario: (usuario || 'Desconocido').substring(0, 255),
      accion: (accion || 'ACCESO_DENEGADO').substring(0, 50),
      tabla: (tabla || 'seguridad').substring(0, 100),
      registro_id: registroId ? String(registroId).substring(0, 255) : null,
      registro_nuevo: {
        evento: 'Operación denegada',
        motivo: motivo || 'Operación no permitida o perfil no autorizado',
        endpoint: endpoint || null,
        ip: ip || null,
        datos_intentados: datosIntentados || null,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (err) {
    console.error('Error al registrar intento denegado en audit_logs:', err.message);
  }
}

/**
 * Registra un intento fallido de autenticación en public.audit_logs (RF-AUD-003 / RF-SEG-001)
 */
async function logFailedLogin({
  email = 'Desconocido',
  motivo = 'Credenciales inválidas',
  ip = null,
  isLocked = false
}) {
  try {
    await supabase.from('audit_logs').insert([{
      usuario: (email || 'Desconocido').substring(0, 255),
      accion: 'INTENTO_FALLIDO',
      tabla: 'auth',
      registro_id: null,
      registro_nuevo: {
        evento: isLocked ? 'Cuenta bloqueada temporalmente tras múltiples intentos fallidos' : 'Intento fallido de inicio de sesión',
        email: email,
        motivo: motivo || 'Credenciales de acceso incorrectas',
        ip: ip || null,
        bloqueado: Boolean(isLocked),
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (err) {
    console.error('Error al registrar intento fallido en audit_logs:', err.message);
  }
}

/**
 * Registra la ejecución de procesos automáticos o tareas de fondo del sistema en public.audit_logs (RF-AUD-003)
 */
async function logSystemProcess({
  proceso = 'Mantenimiento del sistema',
  accion = 'PROCESO_AUTOMATICO',
  tabla = 'sistema',
  registroId = null,
  detalles = null
}) {
  try {
    await supabase.from('audit_logs').insert([{
      usuario: 'Sistema (Proceso automático)',
      accion: (accion || 'PROCESO_AUTOMATICO').substring(0, 50),
      tabla: (tabla || 'sistema').substring(0, 100),
      registro_id: registroId ? String(registroId).substring(0, 255) : null,
      registro_nuevo: {
        evento: proceso,
        detalles: detalles || null,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (err) {
    console.error('Error al registrar proceso de sistema en audit_logs:', err.message);
  }
}

module.exports = {
  logDeniedAttempt,
  logFailedLogin,
  logSystemProcess,
  getClientIp
};
