// URL base del backend, validada una sola vez. La usan el cliente público, el interno y el
// interceptor que agrega el token de sesión.

// Quita las barras del final ("/api/" -> "/api") sin expresiones regulares.
function sinBarraFinal(ruta) {
  let fin = ruta.length;
  while (fin > 0 && ruta[fin - 1] === '/') fin -= 1;
  return ruta.slice(0, fin);
}

function leerUrl() {
  // En un build de producción sin VITE_BACKEND_URL el navegador terminaría llamando a localhost.
  if (import.meta.env.PROD && !import.meta.env.VITE_BACKEND_URL) {
    console.error('Falta VITE_BACKEND_URL en las variables del build: el frontend no sabe dónde está el backend.');
  }
  const valor = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  try {
    const url = new URL(valor);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
    return { origen: url.origin, base: url.origin + sinBarraFinal(url.pathname) };
  } catch {
    console.error('VITE_BACKEND_URL no es una URL http(s) válida:', valor);
    return { origen: 'http://localhost:4000', base: 'http://localhost:4000' };
  }
}

const { origen, base } = leerUrl();

/** Origen del backend (esquema + host + puerto), para comparar URLs. */
export const ORIGEN_BACKEND = origen;
/** URL base del backend sin barra final, por ejemplo "http://localhost:4000". */
export const URL_BACKEND = base;
