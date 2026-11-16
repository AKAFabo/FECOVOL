import './Segmentado.css';

// Grupo de opciones excluyentes ("Todas | Sala | Playa") para filtros sobre fondo oscuro.
// Es un <fieldset> con su <legend> (nombre del grupo para lectores de pantalla) y botones con
// aria-pressed: se recorren con Tab y se activan con Enter o Espacio.
export default function Segmentado({ etiqueta, valor, opciones, onCambiar }) {
  return (
    <fieldset className="segmentado">
      <legend className="visualmente-oculto">{etiqueta}</legend>
      <span className="segmentado__etiqueta" aria-hidden="true">{etiqueta}</span>
      <div className="segmentado__opciones">
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
    </fieldset>
  );
}
