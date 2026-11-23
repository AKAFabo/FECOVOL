// Selecciones nacionales para el portal público.
//
// Los datos vienen de GET /api/public/national-teams: selecciones activas y sus convocatorias
// publicadas, administradas en /admin/selecciones. En desarrollo (npm run dev) se puede abrir
// /selecciones?demo para ver datos de ejemplo marcados como tales; en la versión publicada
// (npm run build) ese ejemplo no existe.
//
// Forma de la respuesta (lista blanca: nada de cédulas, fechas de nacimiento ni contactos; de cada
// atleta solo nombre, número y posición):
//
// {
//   national_teams: [{ id, name, modality, branch, category,
//                      next_event: { name, start_date, end_date, venue } | null,
//                      callup_id | null }],
//   events:  [{ id, name, start_date, end_date, venue, modality, teams: [string] }],
//   callups: [{ id, team_id, title, document_url,
//               players: [{ number, name, position, club }],
//               staff:   [{ name, role }] }]
// }
import { obtener } from './apiPublica.js';
import { esIdValido } from '../utils/ids.js';
import { isoValida } from '../utils/formato.js';
import { urlHttps } from '../utils/urls.js';

const VACIO = Object.freeze({ national_teams: [], events: [], callups: [] });

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const lista = (v) => (Array.isArray(v) ? v : []);
const fecha = (v) => isoValida(v) || null;
const numero = (v) => (Number.isInteger(v) && v > 0 && v < 100 ? v : null);

function evento(e) {
  if (!e || typeof e !== 'object' || !texto(e.name)) return null;
  return { name: texto(e.name), start_date: fecha(e.start_date), end_date: fecha(e.end_date), venue: texto(e.venue) };
}

/** Valida y recorta la respuesta a los campos que usa la página (lista blanca). */
export function normalizarSelecciones(datos) {
  const selecciones = lista(datos?.national_teams)
    .filter((s) => esIdValido(s?.id) && texto(s?.name))
    .map((s) => ({
      id: s.id,
      name: texto(s.name),
      modality: texto(s.modality),
      branch: texto(s.branch),
      category: texto(s.category),
      next_event: evento(s.next_event),
      callup_id: esIdValido(s.callup_id) ? s.callup_id : null
    }));

  const compromisos = lista(datos?.events)
    .filter((e) => esIdValido(e?.id) && texto(e?.name))
    .map((e) => ({
      ...evento(e),
      id: e.id,
      modality: texto(e.modality),
      teams: lista(e.teams).map(texto).filter(Boolean)
    }))
    .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999'));

  const convocatorias = lista(datos?.callups)
    .filter((c) => esIdValido(c?.id) && esIdValido(c?.team_id))
    .map((c) => ({
      id: c.id,
      team_id: c.team_id,
      title: texto(c.title),
      document_url: urlHttps(c.document_url),
      players: lista(c.players)
        .filter((p) => texto(p?.name))
        .map((p) => ({ number: numero(p.number), name: texto(p.name), position: texto(p.position), club: texto(p.club) }))
        .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000)),
      staff: lista(c.staff)
        .filter((p) => texto(p?.name))
        .map((p) => ({ name: texto(p.name), role: texto(p.role) }))
    }));

  return { national_teams: selecciones, events: compromisos, callups: convocatorias };
}

function pideDemo() {
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ datos: ReturnType<typeof normalizarSelecciones>, ejemplo: boolean }>}
 */
export async function obtenerSelecciones(opciones) {
  // import.meta.env.DEV es false en el build de producción: Vite elimina esta rama y el archivo
  // de ejemplo no se incluye en el sitio publicado.
  if (import.meta.env.DEV && pideDemo()) {
    const { SELECCIONES_EJEMPLO } = await import('../data/selecciones.ejemplo.js');
    return { datos: normalizarSelecciones(SELECCIONES_EJEMPLO), ejemplo: true };
  }
  const respuesta = await obtener('/national-teams', opciones);
  return { datos: normalizarSelecciones(respuesta || VACIO), ejemplo: false };
}
