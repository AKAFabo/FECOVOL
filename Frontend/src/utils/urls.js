// Direcciones que vienen de datos (archivos de contenido o la API) y terminan en un href o src.
// Solo se aceptan https://: así un valor como "javascript:..." o "http://..." nunca llega al portal.
export function urlHttps(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
