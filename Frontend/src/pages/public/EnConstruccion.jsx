import { Link } from 'react-router-dom';
import './EnConstruccion.css';

// Página provisional para las secciones del portal que todavía no están construidas.
export default function EnConstruccion({ titulo, noEncontrada = false }) {
  return (
    <section className="en-construccion">
      <div className="contenedor en-construccion__interior">
        <span className="antetitulo">{noEncontrada ? 'Error 404' : 'Sección en desarrollo'}</span>
        <h1 className="en-construccion__titulo">{titulo}</h1>
        <p className="en-construccion__texto">
          {noEncontrada
            ? 'La dirección que buscó no existe o cambió de lugar.'
            : 'Esta sección forma parte del sistema y estará disponible en una próxima entrega.'}
        </p>
        <Link to="/" className="boton boton--primario">Volver al inicio</Link>
      </div>
    </section>
  );
}
