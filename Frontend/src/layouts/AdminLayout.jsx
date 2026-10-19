import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import { supabase } from '../supabaseClient.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';

const NAV_ITEMS = [
  { to: '/admin/panel', texto: 'Panel general' },
  { to: '/admin/asociaciones', texto: 'Asociaciones y equipos' },
  { to: '/admin/personas', texto: 'Personas federadas' },
  { to: '/admin/competencias', texto: 'Competencias' },
  { to: '/admin/arbitraje', texto: 'Arbitraje' },
  { to: '/admin/incidentes', texto: 'Incidentes y sanciones' },
  { to: '/admin/noticias', texto: 'Noticias y comunicados' },
  { to: '/admin/listas-valores', texto: 'Listas de valores' },
  { to: '/admin/usuarios', texto: 'Usuarios y permisos' },
  { to: '/admin/auditoria', texto: 'Auditoría y respaldos' },
];

export default function AdminLayout({ breadcrumb = 'Administración FECOVOL' }) {
  const navigate = useNavigate();
  const [usuarioActual, setUsuarioActual] = useState({
    id: null,
    email: '',
    roleId: null,
    status: null,
    nombre: 'Usuario FECOVOL',
    rol: 'Administración FECOVOL',
    iniciales: 'US'
  });
  const [mostrarModalLogout, setMostrarModalLogout] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  // Vigencia de sesión: Inactividad 30 min y detección de cambio de rol/estado (RF-SEG-003)
  useVigenciaSesion({
    userId: usuarioActual.id,
    roleId: usuarioActual.roleId,
    status: usuarioActual.status,
    userEmail: usuarioActual.email,
    userName: usuarioActual.nombre
  });

  useEffect(() => {
    async function obtenerUsuario() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Intentar obtener el perfil de la base de datos
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role_id, status, full_name, roles(name)')
            .eq('id', user.id)
            .single();

          const nombre = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
          const rol = profile?.roles?.name || 'Administración FECOVOL';
          
          // Obtener iniciales (hasta 2 letras)
          const palabras = nombre.trim().split(' ').filter(Boolean);
          const iniciales = palabras.length > 1
            ? (palabras[0][0] + palabras[1][0]).toUpperCase()
            : (nombre.substring(0, 2)).toUpperCase();

          setUsuarioActual({
            id: user.id,
            email: user.email || '',
            roleId: profile?.role_id,
            status: profile?.status,
            nombre,
            rol,
            iniciales
          });
        }
      } catch (err) {
        console.error('Error al obtener usuario actual:', err);
      }
    }

    obtenerUsuario();
  }, []);

  const handleConfirmarCerrarSesion = async () => {
    setCerrandoSesion(true);
    try {
      let email = usuarioActual.email;
      let userId = usuarioActual.id;
      let nombre = usuarioActual.nombre;

      if (!userId || !email) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = userId || user.id;
          email = email || user.email;
        }
      }
      email = email || 'Usuario';

      // 1. Intentar registrar en audit_logs vía Backend (con service_role para garantizar escritura)
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        await fetch(`${backendUrl}/api/users/logout-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            email,
            full_name: nombre
          })
        });
      } catch (errBackend) {
        console.warn('Backend /api/users/logout-audit no disponible, intentando directo en Supabase:', errBackend);
        // Fallback directo a Supabase
        await supabase.from('audit_logs').insert([{
          usuario: email,
          accion: 'LOGOUT',
          tabla: 'auth.users',
          registro_id: userId ? String(userId) : null,
          registro_viejo: null,
          registro_nuevo: {
            evento: 'Cierre de sesión',
            email,
            full_name: nombre
          }
        }]);
      }
    } catch (errAudit) {
      console.error('Error al registrar auditoría de logout:', errAudit);
    } finally {
      // 2. Invalida sesión en Supabase y redirige a la vista pública de ingreso
      await supabase.auth.signOut();
      setMostrarModalLogout(false);
      setCerrandoSesion(false);
      navigate('/ingresar');
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo-wrap">
            <div className="admin-sidebar__badge-fv">FV</div>
            <div className="admin-sidebar__brand-text">
              <h1>FECOVOL</h1>
              <p>Sistema de información</p>
            </div>
          </div>
        </div>

        <div className="admin-sidebar__role-box">
          <span className="admin-sidebar__role-label">Rol</span>
          <span className="admin-sidebar__role-title">{usuarioActual.rol}</span>
        </div>

        <nav className="admin-sidebar__nav">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                  }
                >
                  <span className="admin-sidebar__icon-placeholder" aria-hidden="true" />
                  <span>{item.texto}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="admin-sidebar__footer">
          <NavLink
            to="/admin/perfil"
            className={({ isActive }) =>
              `admin-sidebar__profile-btn ${isActive ? 'admin-sidebar__profile-btn--active' : ''}`
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Mi perfil y seguridad</span>
          </NavLink>

          <button type="button" className="admin-sidebar__logout" onClick={() => setMostrarModalLogout(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="admin-main">
        {/* Top bar */}
        <header className="admin-topbar">
          <div className="admin-topbar__breadcrumb">
            <span>{breadcrumb}</span>
          </div>

          <div className="admin-topbar__right">
            <span className="admin-topbar__season">Temporada 2026</span>
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar">{usuarioActual.iniciales}</div>
              <div className="admin-topbar__user-info">
                <span className="admin-topbar__user-name">{usuarioActual.nombre}</span>
                <span className="admin-topbar__user-role">{usuarioActual.rol}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {/* Modal de confirmación de cierre de sesión con advertencia de cambios sin guardar (RF-SEG-002) */}
      {mostrarModalLogout && (
        <div 
          className="admin-modal-overlay" 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="modal-logout-titulo"
          onClick={() => !cerrandoSesion && setMostrarModalLogout(false)}
        >
          <div 
            className="admin-modal" 
            style={{ maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="modal-logout-titulo" className="admin-modal__title">Confirmar cierre de sesión</h2>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => !cerrandoSesion && setMostrarModalLogout(false)}
                disabled={cerrandoSesion}
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal__body">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '1.3rem'
                }}>
                  ⚠️
                </div>
                <div>
                  <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: 'var(--texto)', fontSize: '0.98rem' }}>
                    ¿Está seguro de que desea salir?
                  </p>
                  <p style={{ margin: 0, color: 'var(--texto-mudo)', fontSize: '0.85rem', lineHeight: '1.45' }}>
                    Podría tener cambios o información sin guardar en la pantalla actual. Si continúa, cualquier modificación no guardada se perderá.
                  </p>
                </div>
              </div>
            </div>

            <div className="admin-modal__footer">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={() => setMostrarModalLogout(false)}
                disabled={cerrandoSesion}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={handleConfirmarCerrarSesion}
                disabled={cerrandoSesion}
              >
                {cerrandoSesion ? 'Cerrando sesión…' : 'Sí, cerrar sesión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
