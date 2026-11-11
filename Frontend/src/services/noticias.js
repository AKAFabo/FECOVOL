// Acceso a las noticias publicadas (GET /api/public/news...).
import { obtener } from './apiPublica.js';
import { esIdValido } from '../utils/ids.js';

export { esIdValido };

export const PAGINA_MAXIMA = 500;

/** Devuelve { items, page, page_size, total }. */
export function listarNoticias(pagina, opciones) {
  const n = Number.isInteger(pagina) && pagina >= 1 && pagina <= PAGINA_MAXIMA ? pagina : 1;
  return obtener(`/news?page=${n}`, opciones);
}

export function obtenerNoticia(id, opciones) {
  if (!esIdValido(id)) throw new Error('Identificador de noticia inválido');
  return obtener(`/news/${encodeURIComponent(id)}`, opciones);
}
