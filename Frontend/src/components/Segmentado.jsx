import './Segmentado.css';

// Grupo de opciones excluyentes ("Todas | Sala | Playa") para filtros sobre fondo oscuro.
// Botones con aria-pressed dentro de un grupo con nombre: se recorren con Tab y se activan con
// Enter o Espacio.
export default function Segmentado({ etiqueta, valor, opciones, onCambiar }) {
  return (
    <div className="segmentado">
      <span className="segmentado__etiqueta" aria-hidden="true">{etiqueta}</span>
      <div className="segmentado__opciones" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={`segmentado__opcion${o.valor === valor ? ' segmentado__opcion--activa' : ''}`}
            aria-pressed={o.valor === valor}
            onClick={() => onCambiar(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
