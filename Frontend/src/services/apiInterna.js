// Cliente HTTP de la API privada (pantallas con sesión: representante, administración, árbitro).
// Manda siempre el token de sesión y concentra en un lugar el tiempo máximo de espera, el manejo
// de errores y la URL base. Las pantallas nuevas piden datos por aquí, nunca con fetch suelto.
import { URL_BACKEND } from './backend.js';
import { tokenDeSesion } from './sesionBackend.js';

const TIEMPO_MAXIMO_MS = 15_000;

export class ApiError extends Error {
  constructor(mensaje, status = 0, extra = null) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.extra = extra;
  }
}

function mensajePorDefecto(status) {
  if (status === 401) return 'Su sesión venció. Ingrese de nuevo.';
  if (status === 403) return 'No tiene permiso para realizar esta acción.';
  if (status === 404) return 'No encontramos lo que buscaba.';
  if (status === 413) return 'El archivo supera el tamaño permitido.';
  if (status === 429) return 'Hay demasiadas solicitudes en este momento. Espere unos segundos.';
  if (status >= 500 || status === 0) return 'No fue posible completar la solicitud. Intente de nuevo en un momento.';
  return 'La solicitud no es válida.';
}

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
 * Solicitud a la API privada.
 * @param {string} ruta  Ruta desde /api, por ejemplo "/teams?association_id=…". Codificar los
 *                       parámetros con encodeURIComponent o URLSearchParams.
 * @param {{ method?: string, body?: object | FormData, signal?: AbortSignal, timeoutMs?: number }} [opciones]
 * @returns {Promise<{ data: any, [k: string]: any }>} El cuerpo JSON de la respuesta.
 */
export async function pedir(ruta, { method = 'GET', body, signal, timeoutMs = TIEMPO_MAXIMO_MS } = {}) {
  if (typeof ruta !== 'string' || !ruta.startsWith('/') || ruta.startsWith('//')) {
    throw new ApiError('Ruta de API inválida.', 0);
  }
  const token = await tokenDeSesion();
  if (!token) throw new ApiError(mensajePorDefecto(401), 401);

  const encabezados = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  let cuerpo;
  if (body instanceof FormData) cuerpo = body; // el navegador pone el Content-Type con su boundary
  else if (body !== undefined) {
    encabezados['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(body);
  }

  const { signal: senal, liberar } = senalCombinada(signal, timeoutMs);
  let respuesta;
  try {
    respuesta = await fetch(`${URL_BACKEND}/api${ruta}`, {
      method,
      headers: encabezados,
      body: cuerpo,
      credentials: 'omit',
      signal: senal
    });
  } catch (error) {
    liberar();
    if (signal?.aborted) throw error;
    throw new ApiError(mensajePorDefecto(0), 0);
  }

  try {
    const json = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      // Los mensajes del backend están escritos para el usuario; si no hay, se usa uno genérico.
      const mensaje = typeof json?.error === 'string' && json.error.length < 300 ? json.error : mensajePorDefecto(respuesta.status);
      throw new ApiError(mensaje, respuesta.status, json);
    }
    return json ?? { data: null };
  } finally {
    liberar();
  }
}

export const api = {
  get: (ruta, opciones) => pedir(ruta, { ...opciones, method: 'GET' }),
  post: (ruta, body, opciones) => pedir(ruta, { ...opciones, method: 'POST', body }),
  patch: (ruta, body, opciones) => pedir(ruta, { ...opciones, method: 'PATCH', body }),
  put: (ruta, body, opciones) => pedir(ruta, { ...opciones, method: 'PUT', body }),
  del: (ruta, opciones) => pedir(ruta, { ...opciones, method: 'DELETE' })
};
