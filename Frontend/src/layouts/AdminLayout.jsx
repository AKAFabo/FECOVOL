import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import './AdminLayout.css';

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

  const handleCerrarSesion = () => {
    navigate('/ingresar');
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
          <span className="admin-sidebar__role-title">Administración FECOVOL</span>
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
          <button type="button" className="admin-sidebar__logout" onClick={handleCerrarSesion}>
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
              <div className="admin-topbar__avatar">GR</div>
              <div className="admin-topbar__user-info">
                <span className="admin-topbar__user-name">Gabriela Rojas</span>
                <span className="admin-topbar__user-role">Administración FECOVOL</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
