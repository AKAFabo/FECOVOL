import { CanchaPlano } from './Ilustraciones.jsx';
import './CabeceraSeccion.css';

// Franja azul con el título de una sección del portal (Competencias, Selecciones, Noticias...).
// `antes` va sobre el título (migas, pastilla de estado) y `children` debajo de la bajada.
// `imagen={false}` quita la ilustración de la derecha (páginas con filtros o datos en la franja).
export default function CabeceraSeccion({ antetitulo, titulo, bajada, antes, children, imagen = true }) {
  return (
    <header className="cabecera-seccion">
      <div className={`contenedor cabecera-seccion__interior${imagen ? '' : ' cabecera-seccion__interior--sin-imagen'}`}>
        <div className="cabecera-seccion__texto">
          {antes}
          {antetitulo && <span className="antetitulo antetitulo--claro">{antetitulo}</span>}
          <h1 className="cabecera-seccion__titulo">{titulo}</h1>
          {bajada && <p className="cabecera-seccion__bajada">{bajada}</p>}
          {children}
        </div>
        {imagen && (
          <div className="cabecera-seccion__imagen" aria-hidden="true">
            <CanchaPlano />
          </div>
        )}
      </div>
    </header>
  );
}
