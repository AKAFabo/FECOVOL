// Agrega el token de sesión de Supabase a las solicitudes que van a la API privada del backend.
//
// El backend ya no acepta `x-user-email` ni `admin_email` para saber quién llama (cualquiera podía
// escribir el correo de un administrador). Ahora exige `Authorization: Bearer <access_token>`, que
// valida contra Supabase Auth.
//
// Hay muchas pantallas que llaman al backend con fetch directo. En lugar de tocar cada una, este
// interceptor agrega el token solo cuando:
//   - la solicitud va al mismo origen que VITE_BACKEND_URL,
//   - la ruta empieza con /api/ y no es /api/public (la API pública nunca recibe credenciales),
//   - hay una sesión iniciada.
// A cualquier otro destino el token no se envía. Además quita `x-user-email`, que ya no sirve.
import { supabase } from '../supabaseClient.js';
import { ORIGEN_BACKEND } from './backend.js';

const MARCA = Symbol.for('fecovol.fetchConSesion');

function urlDe(entrada) {
  try {
    if (typeof entrada === 'string') return new URL(entrada, window.location.href);
    if (entrada instanceof URL) return entrada;
    if (entrada && typeof entrada.url === 'string') return new URL(entrada.url);
  } catch {
    /* URL inválida: que fetch maneje el error */
  }
  return null;
}

export function esApiPrivada(url) {
  if (!url || url.origin !== ORIGEN_BACKEND) return false;
  const ruta = url.pathname;
  return ruta.startsWith('/api/') && ruta !== '/api/public' && !ruta.startsWith('/api/public/');
}

/** Token vigente (Supabase lo renueva si está por vencer) o null si no hay sesión. */
export async function tokenDeSesion() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

export function instalarSesionEnBackend() {
  if (typeof window === 'undefined' || window.fetch[MARCA]) return;
  const fetchOriginal = window.fetch.bind(window);

  async function fetchConSesion(entrada, opciones) {
    if (!esApiPrivada(urlDe(entrada))) return fetchOriginal(entrada, opciones);

    const encabezados = new Headers(opciones?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    encabezados.delete('x-user-email');
    if (!encabezados.has('Authorization')) {
      const token = await tokenDeSesion();
      if (token) encabezados.set('Authorization', `Bearer ${token}`);
    }
    return fetchOriginal(entrada, { ...opciones, headers: encabezados });
  }

  fetchConSesion[MARCA] = true;
  window.fetch = fetchConSesion;
}
