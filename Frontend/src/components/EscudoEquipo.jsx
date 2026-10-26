import { sigla } from '../utils/sigla.js';
import './EscudoEquipo.css';

const HEX = /^#[0-9a-f]{6}$/i;

// Texto oscuro o claro según la luminosidad del color del equipo, para que la sigla siempre se lea.
function textoSobre(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const lineal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
  return luminancia > 0.4 ? '#17212b' : '#ffffff';
}

// Distintivo circular de un equipo con su sigla, mientras los equipos no tengan logo.
// Es decorativo: el nombre del equipo siempre aparece al lado como texto.
export default function EscudoEquipo({ equipo, tamano = 'm' }) {
  const color = HEX.test(equipo?.color || '') ? equipo.color : null;
  const estilo = color ? { background: color, color: textoSobre(color) } : undefined;
  return (
    <span className={`escudo-equipo escudo-equipo--${tamano}`} style={estilo} aria-hidden="true">
      {sigla(equipo?.short_name, equipo?.name)}
    </span>
  );
}
