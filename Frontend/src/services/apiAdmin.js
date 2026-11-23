// Cliente de la API del panel de administración: envía el token de la sesión iniciada
// (Authorization: Bearer) y traduce los errores del Backend a mensajes legibles.
import { supabase } from '../supabaseClient.js';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Devuelve pedir(ruta, { metodo, cuerpo }) para un módulo montado en `base` (p. ej. '/api/incidents'). */
export function crearClienteAdmin(base) {
  return async function pedir(ruta = '', { metodo = 'GET', cuerpo } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    let body;
    if (cuerpo instanceof Blob) {
      headers['Content-Type'] = cuerpo.type;
      body = cuerpo;
    } else if (cuerpo !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
      respuesta = await fetch(`${API_URL}${base}${ruta}`, { method: metodo, headers, body });
    } catch {
      throw new Error('No se pudo conectar con el servidor. Verifique que el Backend esté en ejecución.');
    }

    const json = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = new Error(json.error || `Error ${respuesta.status} del servidor`);
      error.status = respuesta.status;
      throw error;
    }
    return json.data;
  };
}

/** '?a=1&b=2' sin los valores vacíos. */
export function consulta(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const texto = q.toString();
  return texto ? `?${texto}` : '';
}
