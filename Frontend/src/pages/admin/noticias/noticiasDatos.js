// Fuente de datos de noticias para el panel de administración.
// Aquí solo hay peticiones a la API del Backend (/api/news): las consultas a la base de datos viven allá.
import { supabase } from '../../../supabaseClient.js';
import { URL_BACKEND } from '../../../services/backend.js';

// Misma URL que el resto del frontend (VITE_BACKEND_URL, ver services/backend.js).
const API_URL = URL_BACKEND;

// La API identifica al administrador con el token de la sesión iniciada.
async function pedir(ruta, { metodo = 'GET', cuerpo, tipo } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  let body;
  if (cuerpo instanceof Blob) {
    headers['Content-Type'] = tipo || cuerpo.type;
    body = cuerpo;
  } else if (cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}/api/news${ruta}`, { method: metodo, headers, body });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifique que el Backend esté en ejecución.');
  }

  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error || `Error ${respuesta.status} del servidor`);
    error.status = respuesta.status;
    throw error;
  }
  return json;
}

// Fecha ISO de la base → valor de <input type="datetime-local"> en hora local.
function aFechaLocal(iso) {
  if (!iso) return '';
  const f = new Date(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}T${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

// En la base solo existen BORRADOR, PUBLICADA y ARCHIVADA.
// "Programada" es una noticia publicada cuya fecha de publicación todavía no llega.
function estadoVisible(fila) {
  if (fila.status === 'PUBLICADA' && fila.published_at && new Date(fila.published_at) > new Date()) {
    return 'PROGRAMADA';
  }
  return fila.status;
}

// Fila de la API → objeto que usan las pantallas.
function aNoticia(fila) {
  return {
    id: fila.id,
    slug: fila.slug,
    titulo: fila.title,
    bajada: fila.summary ?? '',
    cuerpo: fila.content ?? '',
    autor: fila.autor?.full_name ?? 'Sin autor',
    autorId: fila.author_id,
    competenciaId: fila.competition_id ?? '',
    competencia: fila.competencia ? `${fila.competencia.name} ${fila.competencia.season}` : '',
    fechaPublicacion: aFechaLocal(fila.published_at),
    estado: estadoVisible(fila),
    destacada: fila.is_featured,
    imagenUrl: fila.cover_image_url || null,
    textoAlternativo: fila.cover_image_alt ?? ''
  };
}

// Formulario → cuerpo que espera la API.
function aCuerpoApi(noticia, imagenUrl) {
  return {
    title: noticia.titulo,
    summary: noticia.bajada,
    content: noticia.cuerpo,
    cover_image_url: imagenUrl ?? '',
    cover_image_alt: noticia.textoAlternativo,
    is_featured: noticia.destacada,
    status: noticia.estado === 'PROGRAMADA' ? 'PUBLICADA' : noticia.estado,
    competition_id: noticia.competenciaId || null,
    published_at: noticia.fechaPublicacion ? new Date(noticia.fechaPublicacion).toISOString() : null
  };
}

// Devuelve { noticias, total } de la página pedida, con los filtros aplicados en el servidor.
export async function listarNoticias({ estado, autorId, busqueda, pagina = 1, porPagina = 20 } = {}) {
  const params = new URLSearchParams({ page: pagina, limit: porPagina });
  if (estado && estado !== 'todos') params.set('status', estado);
  if (autorId && autorId !== 'todos') params.set('author_id', autorId);
  if (busqueda?.trim()) params.set('q', busqueda.trim());

  const { data, total } = await pedir(`?${params}`);
  return { noticias: data.map(aNoticia), total };
}

// Totales del encabezado y autores para el filtro.
export async function obtenerResumen() {
  const { data } = await pedir('/summary');
  return {
    total: data.total,
    borradores: data.borradores,
    programadas: data.programadas,
    publicadasAnio: data.publicadas_anio,
    archivadas: data.archivadas,
    autores: data.autores.map((a) => ({ id: a.id, nombre: a.full_name }))
  };
}

// Competencias para el select "Competencia relacionada".
export async function listarCompetencias() {
  const { data } = await pedir('/competitions');
  return data.map((c) => ({ id: c.id, nombre: `${c.name} ${c.season}` }));
}

// Devuelve la noticia con ese id, o null si no existe.
export async function obtenerNoticia(id) {
  try {
    const { data } = await pedir(`/${encodeURIComponent(id)}`);
    return aNoticia(data);
  } catch (error) {
    if (error.status === 404 || error.status === 400) return null;
    throw error;
  }
}

// Crea (id vacío) o actualiza la noticia. Si hay una imagen nueva (blob recortado) la sube primero.
// imagen: { blob, url } | null — con blob null se conserva la URL ya guardada.
export async function guardarNoticia(id, noticia, imagen) {
  let imagenUrl = '';
  if (imagen?.blob) {
    const { data } = await pedir('/cover', { metodo: 'POST', cuerpo: imagen.blob, tipo: imagen.blob.type || 'image/jpeg' });
    imagenUrl = data.url;
  } else if (imagen?.url) {
    imagenUrl = imagen.url;
  }

  const cuerpo = aCuerpoApi(noticia, imagenUrl);
  const { data } = id
    ? await pedir(`/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo })
    : await pedir('', { metodo: 'POST', cuerpo });
  return aNoticia(data);
}

// Retira la noticia: deja de verse en el panel y en el sitio público.
export async function retirarNoticia(id) {
  await pedir(`/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
}
