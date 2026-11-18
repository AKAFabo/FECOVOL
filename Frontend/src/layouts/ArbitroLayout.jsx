// Entorno del cuerpo arbitral (Figma 05). Misma estructura que los demás entornos con sesión, con
// el acento turquesa del rol; en el teléfono la navegación pasa a una barra inferior.
//
// El layout carga la ficha de quien tiene la sesión (/api/referees/me) y la pasa a las páginas por
// el contexto del Outlet. Si la cuenta no está vinculada con una persona del cuerpo arbitral, no
// muestra ninguna pantalla y explica qué hacer.
import { useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Cargando } from '../components/EstadoContenido.jsx';
import { Modal } from '../components/gestion/Gestion.jsx';
import useCarga from '../hooks/useCarga.js';
import { useVigenciaSesion } from '../hooks/useVigenciaSesion.js';
import { api } from '../services/apiInterna.js';
import { categoriaArbitral, miFichaArbitral } from '../services/arbitraje.js';
import { miPerfil, nombrePersona } from '../services/representante.js';
import { supabase } from '../supabaseClient.js';
import './AdminLayout.css';
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
  const perfil = useCarga((signal) => miPerfil({ signal }), []);
  const ficha = useCarga((signal) => miFichaArbitral({ signal }), []);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const u = perfil.datos;
  useVigenciaSesion({ userId: u?.id, roleId: u?.role_id, status: u?.status, userEmail: u?.email, userName: u?.full_name });

  // Al recargar la ficha (por ejemplo, tras inscribirse en un curso) se sigue mostrando la anterior
  // para que la página abierta no se desmonte.
  const ultima = useRef(null);
  if (ficha.datos) ultima.current = ficha.datos;
  const f = ficha.datos || (ficha.estado === 'cargando' ? ultima.current : null);
  const contexto = useMemo(() => ({ ficha: f, recargarFicha: ficha.reintentar }), [f, ficha.reintentar]);
  const nombre = f ? nombrePersona(f.persona) : u?.full_name || u?.email || '';
  const rol = f?.acreditacion ? categoriaArbitral(f.acreditacion) : 'Cuerpo arbitral';

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await api.post('/users/logout-audit', { razon: 'Cierre de sesión voluntario' }).catch(() => {});
    } finally {
      await supabase.auth.signOut();
      navigate('/ingresar', { replace: true });
    }
  }

  let contenido;
  if (ficha.estado === 'cargando' && !f) contenido = <Cargando texto="Cargando su ficha…" />;
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
        <div className="admin-sidebar__role-box">
          <span className="admin-sidebar__role-label">Rol</span>
          <span className="admin-sidebar__role-title">Cuerpo arbitral</span>
        </div>
        <nav className="admin-sidebar__nav" aria-label="Secciones del cuerpo arbitral">
          <ul>{enlaces('admin-sidebar__link')}</ul>
        </nav>
        <div className="admin-sidebar__footer">
          <button type="button" className="admin-sidebar__logout" onClick={() => setConfirmarSalida(true)}>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__breadcrumb arbitro-marca-movil">
            <span className="admin-sidebar__badge-fv" aria-hidden="true">FV</span>
            <span>Cuerpo arbitral</span>
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

      {confirmarSalida && (
        <Modal
          titulo="¿Cerrar sesión?"
          bajada="Los cambios que no haya guardado se perderán."
          onCerrar={() => setConfirmarSalida(false)}
          ocupado={saliendo}
          ancho="440px"
          pie={(
            <>
              <button type="button" className="g-boton" onClick={() => setConfirmarSalida(false)} disabled={saliendo}>Cancelar</button>
              <button type="button" className="g-boton g-boton--primario" onClick={cerrarSesion} disabled={saliendo} data-autofoco>
                {saliendo ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
            </>
          )}
        >
          <p style={{ margin: 0 }}>Para volver a entrar necesitará su correo y contraseña.</p>
        </Modal>
      )}
    </div>
  );
}
