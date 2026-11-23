// Entorno del representante de asociación (Figma 04). Usa la misma estructura que el entorno de
// administración (barra lateral oscura y barra superior) con el acento morado del rol.
//
// El layout carga el perfil de quien tiene la sesión (/api/users/me) y pasa a las páginas, por el
// contexto del Outlet, la asociación que administra. Si la cuenta no tiene asociación asignada,
// no muestra ninguna pantalla de gestión.
import { useCallback, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../components/EstadoContenido.jsx';
import useCarga from '../hooks/useCarga.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';
import { useRolActivo } from '../hooks/useRolActivo.js';
import { api } from '../services/apiInterna.js';
import { cerrarSesionAuditada } from '../services/cerrarSesion.js';
import { miPerfil } from '../services/representante.js';
import { SidebarRoleBox, SidebarFooter } from '../components/SidebarComun.jsx';
import ModalConfirmarLogout from '../components/ModalConfirmarLogout.jsx';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import './AsociacionLayout.css';

const NAV = [
  { to: '/asociacion', texto: 'Panel', fin: true },
  { to: '/asociacion/equipos', texto: 'Mis equipos' },
  { to: '/asociacion/personas', texto: 'Personas' },
  { to: '/asociacion/documentos', texto: 'Documentos' },
  { to: '/asociacion/inscripciones', texto: 'Inscripciones' },
  { to: '/asociacion/calendario', texto: 'Calendario' },
  { to: '/asociacion/reportes', texto: 'Reportes' },
  { to: '/asociacion/mi-asociacion', texto: 'Mi asociación' }
];

function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2)).toUpperCase();
}

function SinAsociacion({ perfil }) {
  return (
    <div className="asociacion-sin">
      <h1>Su cuenta no administra una asociación</h1>
      <p>
        Este entorno es para representantes de asociación. La cuenta {perfil?.email ? <strong>{perfil.email}</strong> : 'actual'} no
        tiene una asociación asignada. Si debería tenerla, solicite a FECOVOL que la vincule desde Usuarios y permisos.
      </p>
      {perfil?.rol === 'Administrador' && <Link to="/admin/panel" className="g-boton g-boton--primario">Ir a Administración</Link>}
    </div>
  );
}

export default function AsociacionLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const perfil = useCarga((signal) => miPerfil({ signal }), []);
  const [migas, setMigas] = useState([]);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const {
    usuarioActual,
    rolesDisponibles,
    cambiandoRol,
    cambiarRolActivo
  } = useRolActivo('Representante de asociación');

  const p = perfil.datos || usuarioActual;
  useVigenciaSesion({ userId: p?.id, roleId: p?.role_id || usuarioActual?.roleId, status: p?.status, userEmail: p?.email, userName: p?.full_name || p?.nombre });

  const ponerMigas = useCallback((items) => setMigas(items), []);
  const contexto = useMemo(() => ({
    perfil: p,
    asociacion: p?.organizacion || null,
    asociacionId: p?.organizacion?.id || null,
    ponerMigas
  }), [p, ponerMigas]);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await cerrarSesionAuditada({ nombre: usuarioActual?.nombre });
    } finally {
      setConfirmarSalida(false);
      setSaliendo(false);
      navigate('/ingresar', { replace: true });
    }
  }

  const nombreAsociacion = p?.organizacion?.short_name || p?.organizacion?.name || 'Asociación';
  const esPerfil = location.pathname === '/asociacion/perfil';

  let contenido;
  if (esPerfil) contenido = <Outlet context={contexto} />;
  else if (perfil.estado === 'cargando') contenido = <Cargando texto="Cargando su asociación…" />;
  else if (perfil.estado === 'error') contenido = <ErrorCarga mensaje={perfil.error.message} onReintentar={perfil.reintentar} />;
  else if (!p?.organizacion) contenido = <SinAsociacion perfil={p} />;
  else contenido = <Outlet context={contexto} />;

  return (
    <div className="admin-layout admin-layout--asociacion">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo-wrap">
            <div className="admin-sidebar__badge-fv" aria-hidden="true">FV</div>
            <div className="admin-sidebar__brand-text">
              <p className="asociacion-marca">FECOVOL</p>
              <p>{nombreAsociacion}</p>
            </div>
          </div>
        </div>

        <SidebarRoleBox
          rolesDisponibles={rolesDisponibles}
          usuarioActual={usuarioActual}
          cambiandoRol={cambiandoRol}
          onCambiarRol={cambiarRolActivo}
          rolEntornoActual="Representante"
        />

        <nav className="admin-sidebar__nav" aria-label="Secciones de la asociación">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.fin}
                  className={({ isActive }) => `admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`}
                >
                  <span className="admin-sidebar__icon-placeholder" aria-hidden="true" />
                  <span>{item.texto}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <SidebarFooter
          rutaPerfil="/asociacion/perfil"
          onCerrarSesion={() => setConfirmarSalida(true)}
        />
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <nav className="admin-topbar__breadcrumb asociacion-migas" aria-label="Ruta">
            {esPerfil ? (
              <span>Mi perfil y seguridad</span>
            ) : migas.length === 0 ? <span>Asociación</span> : (
              <ol>
                {migas.map((m, i) => (
                  <li key={`${m.texto}-${i}`}>
                    {m.to && i < migas.length - 1 ? <Link to={m.to}>{m.texto}</Link> : <span aria-current={i === migas.length - 1 ? 'page' : undefined}>{m.texto}</span>}
                  </li>
                ))}
              </ol>
            )}
          </nav>
          <div className="admin-topbar__right">
            <span className="admin-topbar__season">Temporada {new Date().getFullYear()}</span>
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar" aria-hidden="true">{iniciales(p?.full_name || p?.email || usuarioActual?.nombre)}</div>
              <div className="admin-topbar__user-info">
                <span className="admin-topbar__user-name">{p?.full_name || p?.email || usuarioActual?.nombre || ''}</span>
                <span className="admin-topbar__user-role">Representante · {nombreAsociacion}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content asociacion-contenido">{contenido}</main>
      </div>

      {/* Modal de confirmación de cierre de sesión normalizado */}
      <ModalConfirmarLogout
        abierto={confirmarSalida}
        cerrando={saliendo}
        onConfirmar={cerrarSesion}
        onCancelar={() => setConfirmarSalida(false)}
      />
    </div>
  );
}
