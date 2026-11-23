import { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import { supabase } from '../supabaseClient.js';
import { api } from '../services/apiInterna.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';
import { SidebarRoleBox, SidebarFooter } from '../components/SidebarComun.jsx';
import ModalConfirmarLogout from '../components/ModalConfirmarLogout.jsx';

const NAV_ITEMS = [
  { to: '/admin/panel', texto: 'Panel general', subruta: '/admin' },

  { to: '/admin/asociaciones', texto: 'Asociaciones y equipos', subruta: '/admin' },
  { to: '/admin/personas', texto: 'Personas federadas', subruta: '/admin' },
  { to: '/admin/documentos', texto: 'Documentos y licencias', subruta: '/admin' },
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
            .select('full_name, roles!user_profiles_role_id_fkey(name)')
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

          // Si el usuario es Administrador, tiene acceso a alternar entre cualquiera de los roles del sistema
          if (rol === 'Administrador' && listaRoles.length <= 1) {
            try {
              const { data: todosRoles } = await supabase.from('roles').select('id, name');
              if (todosRoles && todosRoles.length > 0) {
                listaRoles = todosRoles;
              }
            } catch (eRoles) {}
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
  // NO modifica la base de datos: un usuario.role_id mantiene el rol de mayor prioridad
  const handleCambiarRolActivo = async (nuevoRoleId) => {
    if (!usuarioActual.id) return;
    const rolObj = rolesDisponibles.find(r => r.id === nuevoRoleId);
    if (!rolObj) return;

    setCambiandoRol(true);
    try {
      sessionStorage.setItem('fecovol_role_switched_locally', 'true');
      sessionStorage.setItem('fecovol_active_role_id', nuevoRoleId);
      sessionStorage.setItem('fecovol_active_role_name', rolObj.name);

      setUsuarioActual(prev => ({
        ...prev,
        rol: rolObj.name
      }));

      // Redirigir a la vista correspondiente al nuevo rol
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

        <SidebarRoleBox
          rolesDisponibles={rolesDisponibles}
          usuarioActual={usuarioActual}
          cambiandoRol={cambiandoRol}
          onCambiarRol={handleCambiarRolActivo}
          rolEntornoActual="Administrador"
        />

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

        <SidebarFooter
          rutaPerfil="/admin/perfil"
          onCerrarSesion={() => setMostrarModalLogout(true)}
        />
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
      <ModalConfirmarLogout
        abierto={mostrarModalLogout}
        cerrando={cerrandoSesion}
        onConfirmar={handleConfirmarCerrarSesion}
        onCancelar={() => setMostrarModalLogout(false)}
      />
    </div>
  );
}
