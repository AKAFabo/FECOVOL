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
 * Registra un intento denegado o una operación inválida en public.audit_logs (RF-SEG-010)
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
      accion: (accion || 'ACCESO_DENEGADO').substring(0, 20),
      tabla: (tabla || 'seguridad').substring(0, 100),
      registro_id: registroId ? String(registroId).substring(0, 255) : null,
      registro_nuevo: {
        evento: 'Operación denegada (RF-SEG-010)',
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

module.exports = {
  logDeniedAttempt,
  getClientIp
};
