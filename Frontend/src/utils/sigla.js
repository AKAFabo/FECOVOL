// Sigla de 2-3 letras para el distintivo de una asociación o un equipo mientras no tengan logo.
// Ignora las palabras genéricas ("Asociación Deportiva", "AD", "CD"...) para que no todas
// terminen como "AD": "AD Cartago" → "CAR", "San Carlos VC" → "SC".
const GENERICAS = new Set([
  'asociacion', 'deportiva', 'deportivo', 'club', 'ad', 'cd', 'de', 'del', 'la', 'el', 'los', 'las',
  'y', 'voleibol', 'vc', 'universitaria'
]);

function sinTildes(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function sigla(corto, nombre) {
  const base = (corto || nombre || '').trim();
  if (/^[\p{L}\d]{2,4}$/u.test(base)) return base.toUpperCase();

  const palabras = base
    .split(/[\s\-_.]+/)
    .filter((p) => p && !GENERICAS.has(sinTildes(p).toLowerCase()));
  if (palabras.length === 0) return (base.slice(0, 2) || '?').toUpperCase();
  if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase();
  return palabras.slice(0, 3).map((p) => p[0]).join('').toUpperCase();
}
