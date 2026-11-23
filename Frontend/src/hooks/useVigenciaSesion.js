import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { cerrarSesionAuditada } from '../services/cerrarSesion.js';

// Límite de inactividad: 30 minutos (RF-SEG-003)
const TIEMPO_INACTIVIDAD_MS = 30 * 60 * 1000;
const INTERVALO_REVISION_MS = 10 * 1000;
const CLAVE_LOCALSTORAGE_ACTIVIDAD = 'fecovol_last_activity';

/**
 * Hook para gestionar la vigencia de sesión (RF-SEG-003):
 * 1. Expiración automática tras 30 minutos de inactividad.
 * 2. Cierre de sesión automático si un administrador cambia el rol del usuario.
 * 3. Cierre de sesión automático si el estado cambia a SUSPENDIDA o PENDIENTE_CONTRASENA.
 */
export function useVigenciaSesion({
  userId,
  roleId,
  status,
  userEmail = '',
  userName = ''
}) {
  const navigate = useNavigate();
  const refRolInicial = useRef(roleId);
  const refStatusInicial = useRef(status);
  const refUltimaActividad = useRef(Date.now());
  const refInicioSesion = useRef(Date.now());
  const refDesconectando = useRef(false);

  // Mantener actualizadas las referencias de los valores iniciales
  useEffect(() => {
    if (roleId && !refRolInicial.current) {
      refRolInicial.current = roleId;
    }
  }, [roleId]);

  useEffect(() => {
    if (status && !refStatusInicial.current) {
      refStatusInicial.current = status;
    }
  }, [status]);

  // Función común para registrar auditoría y cerrar sesión
  const auditarYDesconectar = useCallback(async (mensajeUsuario, razonAuditoria) => {
    if (refDesconectando.current) return;
    refDesconectando.current = true;
    try {
      await cerrarSesionAuditada({ razon: razonAuditoria, nombre: userName });
    } finally {
      navigate('/ingresar', {
        state: { mensaje: mensajeUsuario, vista: 'login', email: userEmail },
        replace: true
      });
    }
  }, [userEmail, userName, navigate]);

  // 1. GESTIÓN DE INACTIVIDAD (30 minutos)
  useEffect(() => {
    if (!userId) return;

    // Inicializar timestamp si no existe
    if (!localStorage.getItem(CLAVE_LOCALSTORAGE_ACTIVIDAD)) {
      localStorage.setItem(CLAVE_LOCALSTORAGE_ACTIVIDAD, Date.now().toString());
    }

    let throttleTimer = null;
    const registrarActividad = () => {
      const ahora = Date.now();
      refUltimaActividad.current = ahora;

      // Throttle a 3 segundos para no sobrecargar localStorage
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          localStorage.setItem(CLAVE_LOCALSTORAGE_ACTIVIDAD, ahora.toString());
          throttleTimer = null;
        }, 3000);
      }
    };

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach((evt) => window.addEventListener(evt, registrarActividad, { passive: true }));

    // Intervalo de chequeo de inactividad
    const timerInactividad = setInterval(() => {
      const stored = Number(localStorage.getItem(CLAVE_LOCALSTORAGE_ACTIVIDAD)) || refUltimaActividad.current;
      const tiempoInactivo = Date.now() - stored;

      if (tiempoInactivo >= TIEMPO_INACTIVIDAD_MS) {
        auditarYDesconectar(
          'Su sesión ha expirado tras 30 minutos de inactividad por motivos de seguridad.',
          'Expiración automática por inactividad (30 minutos)'
        );
      }
    }, INTERVALO_REVISION_MS);

    return () => {
      eventos.forEach((evt) => window.removeEventListener(evt, registrarActividad));
      clearInterval(timerInactividad);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [userId, auditarYDesconectar]);

  // 2. VIGILANCIA DE CAMBIO DE ROL, ESTADO O CONTRASEÑA EN SEGUNDO PLANO (RF-SEG-003, RF-SEG-007)
  useEffect(() => {
    if (!userId) return;

    const verificarEstadoPerfil = async (perfilActual) => {
      if (!perfilActual || refDesconectando.current) return;

      const rolInicial = refRolInicial.current;
      const statusInicial = refStatusInicial.current;

      // A) Cambio de rol
      if (rolInicial && perfilActual.role_id && perfilActual.role_id !== rolInicial) {
        const justSwitched = sessionStorage.getItem('fecovol_role_switched_locally');
        if (justSwitched) {
          sessionStorage.removeItem('fecovol_role_switched_locally');
          refRolInicial.current = perfilActual.role_id;
          return;
        }
        await auditarYDesconectar(
          'Su rol de usuario ha sido modificado por un administrador. Inicie sesión nuevamente para acceder con sus nuevos permisos.',
          'Revocación de sesión por cambio de rol'
        );
        return;
      }

      // B) Cambio de estado a SUSPENDIDA
      if (perfilActual.status === 'SUSPENDIDA' && statusInicial !== 'SUSPENDIDA') {
        await auditarYDesconectar(
          'Su cuenta ha sido suspendida por la administración de la federación.',
          'Cierre forzado: cuenta suspendida'
        );
        return;
      }

      // C) Cambio de estado a PENDIENTE_CONTRASENA
      if (perfilActual.status === 'PENDIENTE_CONTRASENA' && statusInicial !== 'PENDIENTE_CONTRASENA') {
        await auditarYDesconectar(
          'Se ha solicitado restablecer o definir la contraseña de su cuenta. Inicie sesión mediante el enlace seguro enviado a su correo.',
          'Cierre forzado: cambio de contraseña pendiente'
        );
        return;
      }
    };

    // Consulta periódica (Polling cada 15s + al volver a enfocar la ventana)
    const comprobarDesdeDB = async () => {
      try {
        // 1. Revisar estado del perfil de usuario
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, role_id, status')
          .eq('id', userId)
          .single();

        if (!error && data) {
          verificarEstadoPerfil(data);
        }

        // 2. Revisar bitácora para detectar si hubo cambio de contraseña en otra sesión (RF-SEG-007)
        const { data: logPass } = await supabase
          .from('audit_logs')
          .select('fecha_hora, registro_nuevo')
          .eq('tabla', 'auth.users')
          .eq('registro_id', userId)
          .order('fecha_hora', { ascending: false })
          .limit(1);

        if (logPass && logPass.length > 0) {
          const evento = logPass[0].registro_nuevo?.evento || '';
          if (evento.toLowerCase().includes('contraseña')) {
            const fechaLog = new Date(logPass[0].fecha_hora).getTime();
            const justChangedLocally = sessionStorage.getItem('fecovol_password_changed_locally');
            if (fechaLog > refInicioSesion.current && !justChangedLocally) {
              await auditarYDesconectar(
                'Su contraseña ha sido actualizada desde otra sesión o dispositivo. Inicie sesión nuevamente con su nueva contraseña.',
                'Cierre forzado: contraseña actualizada en otra sesión'
              );
              return;
            }
          }
        }
      } catch (e) {
        // Silenciar errores de red puntuales
      }
    };

    const timerPoller = setInterval(comprobarDesdeDB, 15000);
    window.addEventListener('focus', comprobarDesdeDB);

    // Suscripción Realtime en Supabase (si está disponible)
    const canalRealtime = supabase
      .channel(`user-profile-watcher-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          if (payload?.new) {
            verificarEstadoPerfil(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(timerPoller);
      window.removeEventListener('focus', comprobarDesdeDB);
      supabase.removeChannel(canalRealtime);
    };
  }, [userId, auditarYDesconectar]);
}
