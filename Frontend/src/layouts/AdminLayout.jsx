import { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import { supabase } from '../supabaseClient.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';

const NAV_ITEMS = [
  { to: '/admin/panel', texto: 'Panel general', subruta: '/admin' },

  { to: '/admin/asociaciones', texto: 'Asociaciones y equipos', subruta: '/admin' },
  { to: '/admin/personas', texto: 'Personas federadas', subruta: '/admin' },
  { to: '/admin/competencias', texto: 'Competencias', subruta: '/admin' },
  { to: '/admin/arbitraje', texto: 'Arbitraje', subruta: '/admin' },
  { to: '/admin/incidentes', texto: 'Incidentes y sanciones', subruta: '/admin' },
  { to: '/admin/noticias', texto: 'Noticias y comunicados', subruta: '/admin' },
  { to: '/admin/usuarios', texto: 'Usuarios y permisos', subruta: '/admin/usuarios' },
  { to: '/admin/listas-valores', texto: 'Listas de valores', subruta: '/admin/listas-valores' },
  { to: '/admin/parametros', texto: 'Parámetros del sistema', subruta: '/admin/parametros' },
  { to: '/admin/auditoria', texto: 'Auditoría y respaldos', subruta: '/admin/auditoria' },
];

export default function AdminLayout({ breadcrumb = 'Administración FECOVOL' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [usuarioActual, setUsuarioActual] = useState({
    id: null,
    email: '',
    roleId: null,
    status: null,
    nombre: 'Usuario FECOVOL',
    rol: 'Administración FECOVOL',
    iniciales: 'US'
  });
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [permisosActivos, setPermisosActivos] = useState([]);
  const [cambiandoRol, setCambiandoRol] = useState(false);
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
            .select('role_id, status, full_name, roles:roles!user_profiles_role_id_fkey(name)')
            .eq('id', user.id)
            .single();

          const nombre = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
          const rol = profile?.roles?.name || 'Administración FECOVOL';
          
          // Obtener iniciales (hasta 2 letras)
          const palabras = nombre.trim().split(' ').filter(Boolean);
          const iniciales = palabras.length > 1
            ? (palabras[0][0] + palabras[1][0]).toUpperCase()
            : (nombre.substring(0, 2)).toUpperCase();

          // Obtener todos los roles asignados desde public.user_roles (RF-SEG-006)
          let listaRoles = [];
          try {
            const { data: userRoles } = await supabase
              .from('user_roles')
              .select('role_id, roles(id, name)')
              .eq('user_id', user.id);

            if (userRoles && userRoles.length > 0) {
              listaRoles = userRoles.map(ur => ur.roles).filter(Boolean);
            }
          } catch (e) {}

          if (listaRoles.length === 0 && profile?.roles) {
            listaRoles = [{ id: profile.role_id, name: profile.roles.name }];
          }

          setRolesDisponibles(listaRoles);

          setUsuarioActual({
            id: user.id,
            email: user.email || '',
            roleId: profile?.role_id,
            status: profile?.status,
            nombre,
            rol,
            iniciales
          });

          await cargarPermisosDeRol(profile?.role_id, rol);
        }
      } catch (err) {
        console.error('Error al obtener usuario actual:', err);
      }
    }

    obtenerUsuario();
  }, []);

  // Cargar matriz de permisos del rol activo (RF-SEG-005)
  async function cargarPermisosDeRol(roleId, rolNombre) {
    if (rolNombre === 'Administrador') {
      setPermisosActivos(['/admin', '/arbitro', '/asociacion', '/personal', '/admin/usuarios', '/admin/listas-valores', '/admin/auditoria', '/admin/perfil']);
      return;
    }

    try {
      if (roleId) {
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('screen_key')
          .eq('role_id', roleId);

        if (perms && perms.length > 0) {
          setPermisosActivos(perms.map(p => p.screen_key));
          return;
        }
      }
      setPermisosActivos(['/admin']);
    } catch (e) {
      console.warn('Aviso al cargar permisos del rol activo:', e);
      setPermisosActivos(['/admin']);
    }
  }

  // Filtrar los items de navegación visibles según la matriz de permisos (RF-SEG-005)
  const navItemsVisibles = useMemo(() => {
    if (usuarioActual.rol === 'Administrador') return NAV_ITEMS;
    if (permisosActivos.length === 0) return NAV_ITEMS;
    return NAV_ITEMS.filter(it => 
      permisosActivos.includes(it.subruta) || 
      permisosActivos.includes('/admin') ||
      permisosActivos.includes(it.to)
    );
  }, [usuarioActual.rol, permisosActivos]);

  // Verificar si la pantalla actual está permitida para el rol
  const rutaActualItem = NAV_ITEMS.find(it => location.pathname === it.to || location.pathname.startsWith(it.to + '/'));
  const tienePermisoRuta = !rutaActualItem || navItemsVisibles.some(it => it.to === rutaActualItem.to);

  // Cambiar visualización/rol activo desde el dropdown del sidebar (RF-SEG-006)
  const handleCambiarRolActivo = async (nuevoRoleId) => {
    if (!usuarioActual.id || nuevoRoleId === usuarioActual.roleId) return;
    const rolObj = rolesDisponibles.find(r => r.id === nuevoRoleId);
    if (!rolObj) return;

    setCambiandoRol(true);
    try {
      // 1. Notificar a useVigenciaSesion que el cambio de rol fue voluntario por el usuario
      sessionStorage.setItem('fecovol_role_switched_locally', 'true');

      // 2. Actualizar rol activo en el backend / base de datos
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      await fetch(`${backendUrl}/api/users/switch-active-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: usuarioActual.id,
          role_id: nuevoRoleId
        })
      });

      setUsuarioActual(prev => ({
        ...prev,
        roleId: nuevoRoleId,
        rol: rolObj.name
      }));

      await cargarPermisosDeRol(nuevoRoleId, rolObj.name);

      // 3. Redirigir a la vista correspondiente al nuevo rol
      const RUTA_POR_ROL = {
        'Administrador': '/admin/panel',
        'Personal':      '/personal',
        'Representante': '/asociacion',
        'Arbitro':       '/arbitro',
      };
      navigate(RUTA_POR_ROL[rolObj.name] || '/admin/panel');
    } catch (err) {
      console.error('Error al cambiar de rol activo:', err);
    } finally {
      setCambiandoRol(false);
    }
  };

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <span className="admin-sidebar__role-label">Rol</span>
            {rolesDisponibles.length > 1 && (
              <span style={{ fontSize: '0.62rem', color: '#fca5a5', opacity: 0.85, fontWeight: 700 }}>
                {rolesDisponibles.length} roles
              </span>
            )}
          </div>
          {rolesDisponibles.length > 1 ? (
            <select
              className="admin-sidebar__role-select"
              value={usuarioActual.roleId || ''}
              onChange={(e) => handleCambiarRolActivo(e.target.value)}
              disabled={cambiandoRol}
              aria-label="Cambiar visualización de rol"
            >
              {rolesDisponibles.map((r) => (
                <option key={r.id} value={r.id} style={{ color: '#0f172a', background: '#fff' }}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="admin-sidebar__role-title">{usuarioActual.rol}</span>
          )}
        </div>

        <nav className="admin-sidebar__nav">
          <ul>
            {navItemsVisibles.map((item) => (
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
          {tienePermisoRuta ? (
            <Outlet />
          ) : (
            <div style={{ padding: '36px', maxWidth: '600px', margin: '40px auto', textAlign: 'center', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔒</div>
              <h2 style={{ color: 'var(--texto)', marginBottom: '8px', fontSize: '1.4rem' }}>Acceso restringido</h2>
              <p style={{ color: 'var(--texto-suave)', lineHeight: 1.5, marginBottom: '20px' }}>
                Su rol actual (<strong>{usuarioActual.rol}</strong>) no tiene autorización en la matriz de permisos para acceder al módulo de <strong>{rutaActualItem?.texto}</strong>.
              </p>
              <button 
                type="button" 
                className="admin-btn admin-btn--primary"
                onClick={() => navigate(navItemsVisibles[0]?.to || '/admin/panel')}
              >
                Ir a una sección autorizada
              </button>
            </div>
          )}
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
