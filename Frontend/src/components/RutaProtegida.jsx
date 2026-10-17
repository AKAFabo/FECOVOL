import { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';

const RUTA_POR_ROL = {
  'Administrador': '/admin',
  'Personal':      '/personal',
  'Representante': '/asociacion',
  'Arbitro':       '/arbitro',
};

/**
 * Componente Guard que protege rutas que requieren autenticación y roles específicos.
 * @param {Array<string>} rolesPermitidos - Lista de nombres de rol autorizados (ej: ['Administrador']).
 * Si se omite o está vacío, solo requiere estar autenticado.
 */
export default function RutaProtegida({ rolesPermitidos = [] }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [estado, setEstado] = useState({
    cargando: true,
    autenticado: false,
    autorizado: false,
    rolUsuario: null,
    motivoDenegado: null // 'no_auth' | 'suspendida' | 'rol_no_autorizado'
  });

  const rolesPermitidosClave = Array.isArray(rolesPermitidos) ? rolesPermitidos.join(',') : '';

  useEffect(() => {
    let montado = true;

    async function verificarSesion() {
      try {
        // 1. Verificar si hay sesión activa en Supabase
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (montado) {
            setEstado({
              cargando: false,
              autenticado: false,
              autorizado: false,
              rolUsuario: null,
              motivoDenegado: 'no_auth'
            });
          }
          return;
        }

        // 2. Obtener el perfil y rol del usuario
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('status, roles(name)')
          .eq('id', session.user.id)
          .single();

        if (error || !profile) {
          if (montado) {
            setEstado({
              cargando: false,
              autenticado: false,
              autorizado: false,
              rolUsuario: null,
              motivoDenegado: 'no_auth'
            });
          }
          return;
        }

        // 3. Validar si la cuenta está suspendida
        if (profile.status === 'SUSPENDIDA') {
          await supabase.auth.signOut();
          if (montado) {
            setEstado({
              cargando: false,
              autenticado: false,
              autorizado: false,
              rolUsuario: null,
              motivoDenegado: 'suspendida'
            });
          }
          return;
        }

        // 4. Validar rol si se especificaron roles permitidos
        const rolUsuario = (Array.isArray(profile.roles) ? profile.roles[0]?.name : profile.roles?.name)?.trim();
        const listaPermitidos = rolesPermitidosClave ? rolesPermitidosClave.split(',').map(r => r.trim().toLowerCase()) : [];
        const tieneRol = listaPermitidos.length === 0 || (rolUsuario && listaPermitidos.includes(rolUsuario.toLowerCase()));

        if (montado) {
          setEstado({
            cargando: false,
            autenticado: true,
            autorizado: tieneRol,
            rolUsuario: rolUsuario || 'Sin rol',
            motivoDenegado: tieneRol ? null : 'rol_no_autorizado'
          });
        }
      } catch (err) {
        console.error('Error verificando sesión en RutaProtegida:', err);
        if (montado) {
          setEstado({
            cargando: false,
            autenticado: false,
            autorizado: false,
            rolUsuario: null,
            motivoDenegado: 'no_auth'
          });
        }
      }
    }

    verificarSesion();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (montado) {
          setEstado({
            cargando: false,
            autenticado: false,
            autorizado: false,
            rolUsuario: null,
            motivoDenegado: 'no_auth'
          });
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        verificarSesion();
      }
    });

    return () => {
      montado = false;
      subscription?.unsubscribe();
    };
  }, [rolesPermitidosClave]);

  // Mientras verifica en Supabase
  if (estado.cargando) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Source Sans 3', system-ui, sans-serif",
        color: '#5d6b7a',
        fontSize: '0.95rem'
      }}>
        Verificando credenciales de acceso...
      </div>
    );
  }

  // Si no está autenticado o está suspendido -> Redirigir a login preservando la ruta solicitada
  if (!estado.autenticado) {
    return <Navigate to="/ingresar" state={{ from: location }} replace />;
  }

  // Si está autenticado pero su rol no tiene permiso para esta sección (ej: un árbitro entrando a /admin)
  if (!estado.autorizado) {
    const rutaMiPortal = RUTA_POR_ROL[estado.rolUsuario] || '/';

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Source Sans 3', system-ui, sans-serif",
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#fee2e2',
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
          fontWeight: 700,
          marginBottom: '16px'
        }}>
          !
        </div>
        <h1 style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontSize: '1.5rem', margin: '0 0 8px 0', color: '#17212b' }}>
          Acceso no autorizado
        </h1>
        <p style={{ color: '#5d6b7a', margin: '0 0 6px 0', maxWidth: '420px', fontSize: '0.9rem' }}>
          Su perfil de usuario (<strong>{estado.rolUsuario}</strong>) no cuenta con los permisos requeridos para acceder a este módulo.
        </p>
        <p style={{ color: '#94a3b8', margin: '0 0 24px 0', maxWidth: '420px', fontSize: '0.8rem' }}>
          Consulte con la administración de FECOVOL si considera que esto es un error.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate(rutaMiPortal)}
            style={{
              padding: '9px 20px',
              background: '#082846',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem'
            }}
          >
            Ir a mi panel
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/ingresar');
            }}
            style={{
              padding: '9px 16px',
              background: '#fff',
              color: '#5d6b7a',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem'
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // Autenticado y autorizado: renderizar las rutas hijas
  return <Outlet />;
}
