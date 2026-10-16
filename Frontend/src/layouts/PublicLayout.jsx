import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import './PublicLayout.css';

const NAVEGACION = [
  { to: '/', texto: 'Inicio', end: true },
  { to: '/competencias', texto: 'Competencias' },
  { to: '/selecciones', texto: 'Selecciones' },
  { to: '/asociaciones', texto: 'Asociaciones' },
  { to: '/noticias', texto: 'Noticias' },
  { to: '/federacion', texto: 'La Federación' }
];

// Redes oficiales de FECOVOL (se abren en otra pestaña).
const REDES = [
  { nombre: 'Instagram', usuario: '@fecovol_cr', url: 'https://www.instagram.com/fecovol_cr/' },
  { nombre: 'Facebook', usuario: 'FECOVOLCR', url: 'https://www.facebook.com/FECOVOLCR/' }
];

function ListaRedes({ className = '' }) {
  return (
    <ul className={`redes ${className}`.trim()} aria-label="Redes sociales de FECOVOL">
      {REDES.map((r) => (
        <li key={r.nombre}>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="redes__enlace">
            {r.nombre}
            <span className="visualmente-oculto"> (se abre en otra pestaña)</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

const PIE = [
  {
    titulo: 'Competencias',
    enlaces: [
      ['Liga Superior Femenina', '/competencias'],
      ['Liga Superior Masculina', '/competencias'],
      ['Campeonatos nacionales', '/competencias'],
      ['Circuito de playa', '/competencias']
    ]
  },
  {
    titulo: 'Federación',
    enlaces: [
      ['Quiénes somos', '/federacion'],
      ['Junta directiva', '/federacion'],
      ['Asociaciones afiliadas', '/asociaciones'],
      ['Reglamentos', '/federacion']
    ]
  },
  {
    titulo: 'Participar',
    enlaces: [
      ['Inscribir un equipo', '/ingresar'],
      ['Federar a una persona', '/ingresar'],
      ['Ser árbitro', '/federacion'],
      ['Trámites y formularios', '/federacion']
    ]
  },
  {
    titulo: 'Acceso',
    enlaces: [
      ['Administración FECOVOL', '/ingresar'],
      ['Personal de competencias', '/ingresar'],
      ['Asociaciones', '/ingresar'],
      ['Cuerpo arbitral', '/ingresar']
    ]
  }
];

export default function PublicLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al cambiar de página se cierra el menú móvil y se vuelve arriba.
  useEffect(() => {
    setMenuAbierto(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a href="#contenido" className="saltar-contenido">Saltar al contenido</a>

      <div className="barra-superior">
        <div className="contenedor barra-superior__interior">
          <p className="barra-superior__texto solo-escritorio">Federación Costarricense de Voleibol</p>
          <div className="barra-superior__acciones">
            <span className="barra-superior__idioma solo-escritorio">
              <span aria-current="true">ES</span>
              <span className="barra-superior__idioma-off" title="Versión en inglés próximamente">EN</span>
            </span>
            <ListaRedes />
          </div>
        </div>
      </div>

      <header className="encabezado">
        <div className="contenedor encabezado__interior">
          <Logo />

          <nav
            id="navegacion-principal"
            className={`navegacion${menuAbierto ? ' navegacion--abierta' : ''}`}
            aria-label="Navegación principal"
          >
            <ul>
              {NAVEGACION.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className="navegacion__enlace">
                    {item.texto}
                  </NavLink>
                </li>
              ))}
            </ul>
            <Link to="/ingresar" className="boton boton--primario boton--chico navegacion__ingresar">
              Ingresar
            </Link>
          </nav>

          <div className="encabezado__acciones">
            <Link to="/buscar" className="encabezado__buscar" aria-label="Buscar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="solo-escritorio">Buscar</span>
            </Link>
            <Link to="/ingresar" className="boton boton--primario boton--chico solo-escritorio">
              Ingresar
            </Link>
            <button
              type="button"
              className="encabezado__menu"
              aria-expanded={menuAbierto}
              aria-controls="navegacion-principal"
              onClick={() => setMenuAbierto((v) => !v)}
            >
              <span className="visualmente-oculto">{menuAbierto ? 'Cerrar menú' : 'Abrir menú'}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                {menuAbierto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main id="contenido">
        <Outlet />
      </main>

      <footer className="pie">
        <div className="contenedor">
          <div className="pie__principal">
            <div className="pie__marca">
              <Logo claro conSubtitulo={false} />
              <address className="pie__direccion">
                Federación Costarricense de Voleibol<br />
                Gimnasio Nacional, La Sabana, San José<br />
                Costa Rica
              </address>
              <p className="pie__contacto">
                <a href="mailto:info@fecovol.cr">info@fecovol.cr</a>&nbsp;&nbsp;·&nbsp;&nbsp;(506) 2222-0000
              </p>
              <ListaRedes className="redes--pie" />
            </div>

            <div className="pie__columnas">
              {PIE.map((col) => (
                <nav key={col.titulo} aria-label={col.titulo} className="pie__columna">
                  <h2 className="pie__titulo">{col.titulo}</h2>
                  <ul>
                    {col.enlaces.map(([texto, ruta]) => (
                      <li key={texto}>
                        <Link to={ruta}>{texto}</Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <div className="pie__legal">
            <p>© {new Date().getFullYear()} Federación Costarricense de Voleibol. Todos los derechos reservados.</p>
            <ul>
              <li><Link to="/federacion">Política de privacidad</Link></li>
              <li><Link to="/federacion">Términos de uso</Link></li>
              <li><a href="mailto:info@fecovol.cr">Contacto</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
