// Ilustraciones vectoriales del portal. Son decorativas (aria-hidden) y ocupan el lugar
// de las fotografías hasta que la Federación aporte sus propias imágenes.

// Cancha en perspectiva con red y balón: imagen principal de la portada.
export function CanchaPerspectiva({ className }) {
  const mallaX = [];
  for (let x = 139; x < 400; x += 14) mallaX.push(x);

  return (
    <svg className={className} viewBox="0 0 532 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="puntos" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#ffffff" opacity="0.07" />
        </pattern>
        <linearGradient id="piso" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#174a80" />
          <stop offset="1" stopColor="#0f3a68" />
        </linearGradient>
      </defs>
      <rect width="532" height="340" fill="#0a2e54" />
      <rect width="532" height="340" fill="url(#puntos)" />

      {/* Piso y líneas de la cancha */}
      <polygon points="96,300 436,300 376,120 156,120" fill="url(#piso)" />
      <g fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2">
        <polygon points="96,300 436,300 376,120 156,120" />
        <line x1="119" y1="231" x2="413" y2="231" />
        <line x1="148" y1="145" x2="384" y2="145" strokeOpacity="0.25" />
      </g>

      {/* Sombra del balón */}
      <ellipse cx="352" cy="266" rx="30" ry="7" fill="#000" opacity="0.25" />

      {/* Red */}
      <line x1="125" y1="150" x2="125" y2="198" stroke="#cfd9e6" strokeWidth="3" />
      <line x1="407" y1="150" x2="407" y2="198" stroke="#cfd9e6" strokeWidth="3" />
      <rect x="125" y="158" width="282" height="34" fill="#ffffff" opacity="0.06" />
      <g stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1">
        {mallaX.map((x) => (
          <line key={x} x1={x} y1="158" x2={x} y2="192" />
        ))}
        <line x1="125" y1="169" x2="407" y2="169" />
        <line x1="125" y1="181" x2="407" y2="181" />
      </g>
      <rect x="125" y="155" width="282" height="5" rx="1.5" fill="#ffffff" opacity="0.9" />

      {/* Trayectoria y balón */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 8">
        <path d="M170 228 C 220 90, 320 40, 376 70" />
      </g>
      <g transform="translate(410 80)">
        <circle r="34" fill="#ffffff" />
        <g fill="none" stroke="#0e3b6b" strokeWidth="2.4" strokeLinecap="round">
          <path d="M-30 -14 C -10 -6, 10 -6, 30 -16" />
          <path d="M-22 24 C -14 2, -2 -16, 6 -33" />
          <path d="M28 18 C 14 8, 4 -6, 0 -34" />
        </g>
        <circle r="34" fill="none" stroke="#c8102e" strokeWidth="3" strokeOpacity="0.9" />
      </g>
    </svg>
  );
}

// Cancha vista desde arriba: marca de agua para tarjetas de competencias y noticias.
export function CanchaPlano({ className }) {
  return (
    <svg className={className} viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="2">
        <rect x="110" y="25" width="180" height="100" />
        <line x1="200" y1="25" x2="200" y2="125" strokeWidth="3" strokeOpacity="0.3" />
        <line x1="170" y1="25" x2="170" y2="125" />
        <line x1="230" y1="25" x2="230" y2="125" />
      </g>
      <circle cx="318" cy="46" r="14" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="2" />
    </svg>
  );
}

// Balón de voleibol en línea: marca de agua para las selecciones.
export function Balon({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round">
        <circle cx="50" cy="50" r="34" />
        <path d="M18 40 C 38 48, 62 48, 84 38" />
        <path d="M28 76 C 36 54, 48 34, 56 16" />
        <path d="M80 66 C 64 56, 54 40, 50 16" />
      </g>
    </svg>
  );
}
