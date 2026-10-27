import { useId } from 'react';
import './Selector.css';

// Lista desplegable de filtro con la etiqueta dentro de la caja ("Jornada: todas").
// Es un <select> nativo: funciona con teclado, lector de pantalla y en el celular sin código extra.
// opciones: [{ valor, texto }]. El primer elemento suele ser "todas".
export default function Selector({ etiqueta, valor, opciones, onCambiar }) {
  const id = useId();
  return (
    <div className="selector">
      <label htmlFor={id} className="selector__etiqueta">{etiqueta}:</label>
      <select id={id} className="selector__campo" value={valor} onChange={(e) => onCambiar(e.target.value)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
      <svg className="selector__flecha" width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
