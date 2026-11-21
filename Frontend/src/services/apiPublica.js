// Cliente HTTP del portal público. Todas las páginas públicas piden datos por aquí, nunca con
// fetch suelto, para que el manejo de errores, el tiempo máximo de espera y la URL base estén en
// un solo lugar.
//
// Solo hace GET a /api/public, que es la parte de la API pensada para el público: no envía
// credenciales ni encabezados de usuario.

import { URL_BACKEND } from './backend.js';

const TIEMPO_MAXIMO_MS = 10_000;

const BASE = `${URL_BACKEND}/api/public`;

export class ApiError extends Error {
  constructor(mensaje, status = 0) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
  }
}

function mensajePara(status) {
  if (status === 404) return 'No encontramos lo que buscaba.';
  if (status === 429) return 'Hay demasiadas consultas en este momento. Espere unos segundos e intente de nuevo.';
  if (status >= 500 || status === 0) return 'No fue posible cargar la información. Intente de nuevo en un momento.';
  return 'La solicitud no es válida.';
}

// Une la señal de cancelación de quien llama (por ejemplo, el componente se desmontó) con la del
// tiempo máximo de espera.
function senalCombinada(externa, timeoutMs) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(new DOMException('Tiempo agotado', 'TimeoutError')), timeoutMs);
  const alCancelar = () => control.abort(externa.reason);
  if (externa) {
    if (externa.aborted) control.abort(externa.reason);
    else externa.addEventListener('abort', alCancelar, { once: true });
  }
  return {
    signal: control.signal,
    liberar() {
      clearTimeout(temporizador);
      externa?.removeEventListener('abort', alCancelar);
    }
  };
}

/**
 * GET a la API pública.
 * @param {string} ruta  Ruta relativa a /api/public, ya con sus parámetros codificados
 *                       (usar las funciones de services/competencias.js).
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} opciones
 * @returns {Promise<any>} El contenido de `data` de la respuesta.
 */
export async function obtener(ruta, { signal, timeoutMs = TIEMPO_MAXIMO_MS } = {}) {
  const { signal: senal, liberar } = senalCombinada(signal, timeoutMs);
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: senal
    });
  } catch (error) {
    liberar();
    // Si quien llamó canceló la solicitud, se propaga tal cual para que se ignore.
    if (signal?.aborted) throw error;
    throw new ApiError(mensajePara(0), 0);
  }

  try {
    if (!respuesta.ok) throw new ApiError(mensajePara(respuesta.status), respuesta.status);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!cuerpo || !('data' in cuerpo)) throw new ApiError(mensajePara(500), 500);
    return cuerpo.data;
  } finally {
    liberar();
  }
}

export function esCancelacion(error) {
  return error?.name === 'AbortError';
}
