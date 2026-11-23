// Íconos de línea del sistema (SVG en línea, heredan el color del texto). Reemplazan a los emojis,
// que cambian de aspecto según el sistema operativo y no siguen la identidad visual de FECOVOL.
const TRAZOS = {
  alerta: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  info: ['M12 16v-4', 'M12 8h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  candado: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z'],
  salir: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  check: ['M20 6 9 17l-5-5'],
  cerrar: ['M18 6 6 18', 'M6 6l12 12'],
  lapiz: ['M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  campana: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
  trofeo: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0Z', 'M17 5h3v2a4 4 0 0 1-3 3.9', 'M7 5H4v2a4 4 0 0 0 3 3.9'],
  lupa: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M21 21l-4.3-4.3'],
  escudo: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'],
  estrella: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z'],
  prohibido: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M4.9 4.9l14.2 14.2'],
  reloj: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  error: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M15 9l-6 6', 'M9 9l6 6'],
  correcto: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M8 12l3 3 5-6']
};

/**
 * @param {{ nombre: keyof typeof TRAZOS, tam?: number, titulo?: string, className?: string, style?: object }} props
 * Sin `titulo`, el ícono es decorativo y se oculta a los lectores de pantalla.
 */
export default function Icono({ nombre, tam = 18, titulo, className, style }) {
  const trazos = TRAZOS[nombre];
  if (!trazos) return null;
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, verticalAlign: '-0.15em', ...style }}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : 'true'}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      {trazos.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
