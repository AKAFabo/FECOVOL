import './EstadoContenido.css';

// Estados de una zona que carga datos: cargando, error y sin resultados.
// Se usan igual en todas las páginas públicas para que se vean y se anuncien igual.

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="estado-contenido" role="status" aria-live="polite">
      <span className="estado-contenido__rueda" aria-hidden="true" />
      <p className="estado-contenido__texto">{texto}</p>
    </div>
  );
}

export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    <div className="estado-contenido estado-contenido--error" role="alert">
      <p className="estado-contenido__titulo">Aún no tienes datos registrados</p>
      <p className="estado-contenido__texto">{mensaje}</p>
      {onReintentar && (
        <button type="button" className="boton boton--primario boton--chico" onClick={onReintentar}>
          Intentar de nuevo
        </button>
      )}
    </div>
  );
}

export function SinResultados({ titulo, texto, children }) {
  return (
    <div className="estado-contenido">
      <p className="estado-contenido__titulo">{titulo}</p>
      {texto && <p className="estado-contenido__texto">{texto}</p>}
      {children}
    </div>
  );
}
