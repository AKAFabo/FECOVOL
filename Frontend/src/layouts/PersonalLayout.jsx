import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import { supabase } from '../supabaseClient.js';
import { api } from '../services/apiInterna.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';
import { SidebarRoleBox, SidebarFooter } from '../components/SidebarComun.jsx';
import ModalConfirmarLogout from '../components/ModalConfirmarLogout.jsx';

// Define el menú lateral para el personal de competencias
const NAV_ITEMS = [
  { to: '/personal', texto: 'Competencias' },
  { to: '/personal/inscripciones', texto: 'Inscripciones' },
  { to: '/personal/calendario', texto: 'Calendario y partidos' },
  { to: '/personal/resultados', texto: 'Resultados' },
  { to: '/personal/designaciones', texto: 'Designaciones arbitrales' },
  { to: '/personal/reportes', texto: 'Reportes' },
];

const RUTA_POR_ROL = {
  'Administrador': '/admin/panel',
  'Personal': '/personal',
  'Representante': '/asociacion',
  'Arbitro': '/arbitro',
};

export default function PersonalLayout({ breadcrumb = 'Personal de competencias' }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Declara el estado del usuario
  const [usuarioActual, setUsuarioActual] = useState({
    id: null, email: '', roleId: null, status: null,
    nombre: 'Usuario', rol: 'Personal de competencias', iniciales: 'US'
  });

  // Declara los estados para el cambio de rol y el modal de cierre
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [cambiandoRol, setCambiandoRol] = useState(false);
  const [mostrarModalLogout, setMostrarModalLogout] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  // Gestiona la vigencia de la sesión y los cambios de rol/estado en segundo plano
  useVigenciaSesion({
    userId: usuarioActual.id,
    roleId: usuarioActual.roleId,
    status: usuarioActual.status,
    userEmail: usuarioActual.email,
    userName: usuarioActual.nombre,
  });

  // Carga el usuario autenticado al montar el layout
  useEffect(() => {
    async function obtenerUsuario() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id, status, full_name, roles:roles!user_profiles_role_id_fkey(name)')
          .eq('id', user.id)
          .single();

        const nombre = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
        const rol = profile?.roles?.name || 'Personal de competencias';
        const palabras = nombre.trim().split(' ').filter(Boolean);
        const iniciales = palabras.length > 1
          ? (palabras[0][0] + palabras[1][0]).toUpperCase()
          : nombre.substring(0, 2).toUpperCase();

        // Obtén los roles asignados desde la tabla muchos a muchos
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
          id: user.id, email: user.email || '', roleId: profile?.role_id,
          status: profile?.status, nombre, rol, iniciales,
        });
      } catch (err) {
        console.error('Error al obtener usuario:', err);
      }
    }
    obtenerUsuario();
  }, []);

  // Determina si un item del menú debe mostrarse activo según la ruta actual
  const esRutaActiva = (itemTo) => {
    if (itemTo === '/personal') {
      // Mantén activo "Competencias" en la lista y en el detalle de una competencia
      return location.pathname === '/personal' || location.pathname.startsWith('/personal/competencia');
    }
    return location.pathname === itemTo || location.pathname.startsWith(itemTo + '/');
  };

  // Cambia la vista de rol y redirige al entorno correspondiente (sin modificar la base de datos)
  const handleCambiarRolActivo = async (nuevoRoleId) => {
    if (!usuarioActual.id) return;
    const rolObj = rolesDisponibles.find(r => r.id === nuevoRoleId);
    if (!rolObj) return;

    setCambiandoRol(true);
    try {
      sessionStorage.setItem('fecovol_role_switched_locally', 'true');
      sessionStorage.setItem('fecovol_active_role_id', nuevoRoleId);
      sessionStorage.setItem('fecovol_active_role_name', rolObj.name);

      setUsuarioActual(prev => ({ ...prev, rol: rolObj.name }));
      navigate(RUTA_POR_ROL[rolObj.name] || '/personal');
    } catch (err) {
      console.error('Error al cambiar de rol:', err);
    } finally {
      setCambiandoRol(false);
    }
  };

  // Confirma y ejecuta el cierre de sesión con auditoría
  const handleConfirmarCerrarSesion = async () => {
    setCerrandoSesion(true);
    try {
      let email = usuarioActual.email;
      let userId = usuarioActual.id;
      if (!userId || !email) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { userId = userId || user.id; email = email || user.email; }
      }
      email = email || 'Usuario';
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        await fetch(`${backendUrl}/api/users/logout-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, email, full_name: usuarioActual.nombre }),
        });
      } catch (e) {}
    } finally {
      await supabase.auth.signOut();
      setMostrarModalLogout(false);
      setCerrandoSesion(false);
      navigate('/ingresar');
    }
  };

  const esPerfil = location.pathname === '/personal/perfil';

  return (
    <div className="admin-layout admin-layout--personal">
      {/* Sidebar con acentos en verde para el rol de Personal */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo-wrap">
            <div className="admin-sidebar__badge-fv" style={{ background: '#1b6b31' }}>FV</div>
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
          rolEntornoActual="Personal"
        />

        <nav className="admin-sidebar__nav">
          <ul>
            {NAV_ITEMS.map((item) => {
              const activo = esRutaActiva(item.to);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={`admin-sidebar__link ${activo ? 'admin-sidebar__link--active' : ''}`}
                    style={activo ? { background: 'rgba(27, 107, 49, 0.85)' } : undefined}
                  >
                    <span className="admin-sidebar__icon-placeholder" aria-hidden="true" />
                    <span>{item.texto}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <SidebarFooter
          rutaPerfil="/personal/perfil"
          onCerrarSesion={() => setMostrarModalLogout(true)}
        />
      </aside>

      {/* Contenido principal */}
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__breadcrumb">
            <span>{esPerfil ? 'Mi perfil y seguridad' : breadcrumb}</span>
          </div>
          <div className="admin-topbar__right">
            <span className="admin-topbar__season">Temporada 2026</span>
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar" style={{ background: '#1b6b31' }}>{usuarioActual.iniciales}</div>
              <div className="admin-topbar__user-info">
                <span className="admin-topbar__user-name">{usuarioActual.nombre}</span>
                <span className="admin-topbar__user-role">{usuarioActual.rol}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {/* Modal de confirmación de cierre de sesión normalizado */}
      <ModalConfirmarLogout
        abierto={mostrarModalLogout}
        cerrando={cerrandoSesion}
        onConfirmar={handleConfirmarCerrarSesion}
        onCancelar={() => setMostrarModalLogout(false)}
      />
    </div>
  );
}