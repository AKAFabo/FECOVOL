// Entorno del cuerpo arbitral (Figma 05). Misma estructura que los demás entornos con sesión, con
// el acento turquesa del rol; en el teléfono la navegación pasa a una barra inferior.
//
// El layout carga la ficha de quien tiene la sesión (/api/referees/me) y la pasa a las páginas por
// el contexto del Outlet. Si la cuenta no está vinculada con una persona del cuerpo arbitral, no
// muestra ninguna pantalla y explica qué hacer.
import { useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Cargando } from '../components/EstadoContenido.jsx';
import useCarga from '../hooks/useCarga.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';
import { useRolActivo } from '../hooks/useRolActivo.js';
import { api } from '../services/apiInterna.js';
import { categoriaArbitral, miFichaArbitral } from '../services/arbitraje.js';
import { miPerfil, nombrePersona } from '../services/representante.js';
import { supabase } from '../supabaseClient.js';
import { SidebarRoleBox, SidebarFooter } from '../components/SidebarComun.jsx';
import ModalConfirmarLogout from '../components/ModalConfirmarLogout.jsx';
import './AdminLayout.css';
import '../pages/admin/AdminCommon.css';
import './ArbitroLayout.css';

const NAV = [
  { to: '/arbitro', texto: 'Mis designaciones', fin: true },
  { to: '/arbitro/mi-ficha', texto: 'Mi ficha' }
];

function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2)).toUpperCase();
}

function SinFicha({ error, onReintentar }) {
  const sinVinculo = error?.status === 404 || error?.status === 403;
  return (
    <div className="arbitro-sin">
      <h1>{sinVinculo ? 'Su cuenta no tiene ficha arbitral' : 'No pudimos cargar su ficha'}</h1>
      <p>{error?.message}</p>
      {!sinVinculo && <button type="button" className="g-boton g-boton--primario" onClick={onReintentar}>Intentar de nuevo</button>}
    </div>
  );
}

export default function ArbitroLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const perfil = useCarga((signal) => miPerfil({ signal }), []);
  const ficha = useCarga((signal) => miFichaArbitral({ signal }), []);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const {
    usuarioActual,
    rolesDisponibles,
    cambiandoRol,
    cambiarRolActivo
  } = useRolActivo('Cuerpo arbitral');

  const u = perfil.datos || usuarioActual;
  useVigenciaSesion({ userId: u?.id, roleId: u?.role_id || usuarioActual?.roleId, status: u?.status, userEmail: u?.email, userName: u?.full_name || u?.nombre });

  // Al recargar la ficha (por ejemplo, tras inscribirse en un curso) se sigue mostrando la anterior
  // para que la página abierta no se desmonte.
  const ultima = useRef(null);
  if (ficha.datos) ultima.current = ficha.datos;
  const f = ficha.datos || (ficha.estado === 'cargando' ? ultima.current : null);
  const contexto = useMemo(() => ({ ficha: f, recargarFicha: ficha.reintentar }), [f, ficha.reintentar]);
  const nombre = f ? nombrePersona(f.persona) : u?.full_name || usuarioActual?.nombre || u?.email || '';
  const rol = f?.acreditacion ? categoriaArbitral(f.acreditacion) : (usuarioActual.rol || 'Cuerpo arbitral');

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await api.post('/users/logout-audit', { razon: 'Cierre de sesión manual voluntario' }).catch(() => {});
    } finally {
      await supabase.auth.signOut();
      setConfirmarSalida(false);
      setSaliendo(false);
      navigate('/ingresar', { replace: true });
    }
  }

  const esPerfil = location.pathname === '/arbitro/perfil';

  let contenido;
  if (esPerfil) contenido = <Outlet context={contexto} />;
  else if (ficha.estado === 'cargando' && !f) contenido = <Cargando texto="Cargando su ficha…" />;
  else if (ficha.estado === 'error') contenido = <SinFicha error={ficha.error} onReintentar={ficha.reintentar} />;
  else contenido = <Outlet context={contexto} />;

  const enlaces = (clase) => NAV.map((item) => (
    <li key={item.to}>
      <NavLink to={item.to} end={item.fin} className={({ isActive }) => `${clase}${isActive ? ` ${clase}--active` : ''}`}>
        <span className="admin-sidebar__icon-placeholder" aria-hidden="true" />
        <span>{item.texto}</span>
      </NavLink>
    </li>
  ));

  return (
    <div className="admin-layout admin-layout--arbitro">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__logo-wrap">
            <div className="admin-sidebar__badge-fv" aria-hidden="true">FV</div>
            <div className="admin-sidebar__brand-text">
              <p className="arbitro-marca">FECOVOL</p>
              <p>Cuerpo arbitral</p>
            </div>
          </div>
        </div>

        <SidebarRoleBox
          rolesDisponibles={rolesDisponibles}
          usuarioActual={usuarioActual}
          cambiandoRol={cambiandoRol}
          onCambiarRol={cambiarRolActivo}
          rolEntornoActual="Arbitro"
        />

        <nav className="admin-sidebar__nav" aria-label="Secciones del cuerpo arbitral">
          <ul>{enlaces('admin-sidebar__link')}</ul>
        </nav>

        <SidebarFooter
          rutaPerfil="/arbitro/perfil"
          onCerrarSesion={() => setConfirmarSalida(true)}
        />
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__breadcrumb arbitro-marca-movil">
            <span className="admin-sidebar__badge-fv" aria-hidden="true">FV</span>
            <span>{esPerfil ? 'Mi perfil y seguridad' : 'Cuerpo arbitral'}</span>
          </div>
          <div className="admin-topbar__right">
            <span className="admin-topbar__season">Temporada {new Date().getFullYear()}</span>
            <div className="admin-topbar__user">
              <div className="admin-topbar__avatar" aria-hidden="true">{iniciales(nombre)}</div>
              <div className="admin-topbar__user-info">
                <span className="admin-topbar__user-name">{nombre}</span>
                <span className="admin-topbar__user-role">{rol}</span>
              </div>
            </div>
            <button type="button" className="g-boton g-boton--chico arbitro-salir-movil" onClick={() => setConfirmarSalida(true)}>Salir</button>
          </div>
        </header>

        <main className="admin-content arbitro-contenido">{contenido}</main>
      </div>

      <nav className="arbitro-barra" aria-label="Secciones del cuerpo arbitral">
        <ul>{enlaces('arbitro-barra__enlace')}</ul>
      </nav>

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
