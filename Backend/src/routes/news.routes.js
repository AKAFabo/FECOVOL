const crypto = require('crypto');
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
router.param('id', validateUuidParams);

// Todo el modulo es de administracion: publicar, editar y retirar noticias.
router.use(requireAdmin);

const BUCKET = 'news';
const TAMANO_MAX_IMAGEN = 10 * 1024 * 1024;
const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ESTADOS = ['BORRADOR', 'PUBLICADA', 'ARCHIVADA'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_NEWS = `id, title, slug, summary, content, cover_image_url, cover_image_alt,
  is_featured, status, competition_id, author_id, published_at, created_at, updated_at,
  autor:user_profiles!news_author_id_fkey(id, full_name),
  competencia:competitions!news_competition_id_fkey(id, name, season)`;

function lanzar(error, contexto) {
  const err = fromSupabase(error, contexto);
  if (err) throw err;
}

// 'CD Sarchí gana el clásico' -> 'cd-sarchi-gana-el-clasico'
function slugify(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

// El slug es unico en la tabla (incluye las noticias retiradas): si ya existe se le agrega -2, -3...
async function slugDisponible(titulo) {
  const base = slugify(titulo) || 'noticia';
  const { data, error } = await supabase.from('news').select('slug').like('slug', `${base}%`);
  lanzar(error);

  const usados = new Set((data || []).map((n) => n.slug));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Valida y normaliza los campos que vienen en el cuerpo. Solo devuelve los que se enviaron.
function leerCampos(body) {
  const campos = {};

  if (body.title !== undefined) {
    campos.title = texto(body.title);
    if (!campos.title) throw new HttpError(400, 'El titulo es obligatorio');
    if (campos.title.length > 255) throw new HttpError(400, 'El titulo no puede superar 255 caracteres');
  }
  if (body.summary !== undefined) campos.summary = texto(body.summary) || null;
  if (body.content !== undefined) campos.content = typeof body.content === 'string' ? body.content : '';
  if (body.cover_image_url !== undefined) campos.cover_image_url = texto(body.cover_image_url);
  if (body.cover_image_alt !== undefined) campos.cover_image_alt = texto(body.cover_image_alt);
  if (body.is_featured !== undefined) campos.is_featured = Boolean(body.is_featured);

  if (body.status !== undefined) {
    if (!ESTADOS.includes(body.status)) throw new HttpError(400, 'status solo admite: ' + ESTADOS.join(', '));
    campos.status = body.status;
  }
  if (body.competition_id !== undefined) {
    if (body.competition_id && !UUID.test(body.competition_id)) {
      throw new HttpError(400, 'competition_id debe ser un UUID valido');
    }
    campos.competition_id = body.competition_id || null;
  }
  if (body.published_at !== undefined) {
    if (body.published_at) {
      const fecha = new Date(body.published_at);
      if (Number.isNaN(fecha.getTime())) throw new HttpError(400, 'published_at no es una fecha valida');
      campos.published_at = fecha.toISOString();
    } else {
      campos.published_at = null;
    }
  }

  return campos;
}

// Un borrador puede estar incompleto; para publicar (o programar) la noticia debe estar completa.
function validarPublicable(noticia) {
  const sinTexto = !noticia.content || !noticia.content.replace(/<[^>]*>|&nbsp;/g, '').trim();
  const faltan = [];
  if (sinTexto) faltan.push('el cuerpo de la noticia');
  if (!noticia.cover_image_url) faltan.push('la imagen destacada');
  if (!noticia.cover_image_alt) faltan.push('el texto alternativo de la imagen');
  if (faltan.length) throw new HttpError(400, 'Para publicar falta: ' + faltan.join(', '));
}

// Solo una noticia ocupa el bloque destacado de la portada.
async function quitarOtrasDestacadas(id) {
  const { error } = await supabase.from('news').update({ is_featured: false }).eq('is_featured', true).neq('id', id);
  lanzar(error);
}

async function buscarNoticia(id) {
  const { data, error } = await supabase
    .from('news')
    .select(SELECT_NEWS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(404, 'Noticia no encontrada');
  return data;
}

// GET /api/news?status=&author_id=&q=&page=1&limit=20
// status admite BORRADOR, PUBLICADA, ARCHIVADA y PROGRAMADA (publicada con fecha futura).
router.get('/', asyncHandler(async (req, res) => {
  const { status, author_id, q } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const ahora = new Date().toISOString();

  let query = supabase
    .from('news')
    .select(SELECT_NEWS, { count: 'exact' })
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status === 'PROGRAMADA') query = query.eq('status', 'PUBLICADA').gt('published_at', ahora);
  else if (status === 'PUBLICADA') query = query.eq('status', 'PUBLICADA').lte('published_at', ahora);
  else if (ESTADOS.includes(status)) query = query.eq('status', status);
  else if (status) throw new HttpError(400, 'status no valido');

  if (author_id) {
    if (!UUID.test(author_id)) throw new HttpError(400, 'author_id debe ser un UUID valido');
    query = query.eq('author_id', author_id);
  }
  if (q && texto(q)) {
    // Los comodines de LIKE se escapan para buscar el texto tal cual.
    query = query.ilike('title', `%${texto(q).replace(/[\\%_]/g, '\\$&')}%`);
  }

  const { data, error, count } = await query;
  lanzar(error);

  res.json({ data, total: count ?? data.length, page, limit });
}));

// GET /api/news/summary -> totales para el encabezado y lista de autores para el filtro
router.get('/summary', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('news')
    .select('status, published_at, autor:user_profiles!news_author_id_fkey(id, full_name)')
    .is('deleted_at', null);
  lanzar(error);

  const ahora = Date.now();
  const anio = new Date().getFullYear();
  const resumen = { total: data.length, borradores: 0, programadas: 0, publicadas_anio: 0, archivadas: 0 };
  const autores = new Map();

  for (const n of data) {
    if (n.autor) autores.set(n.autor.id, n.autor);
    if (n.status === 'BORRADOR') resumen.borradores += 1;
    else if (n.status === 'ARCHIVADA') resumen.archivadas += 1;
    else if (n.published_at && new Date(n.published_at).getTime() > ahora) resumen.programadas += 1;
    else if (n.published_at && new Date(n.published_at).getFullYear() === anio) resumen.publicadas_anio += 1;
  }

  res.json({
    data: {
      ...resumen,
      autores: [...autores.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'))
    }
  });
}));

// GET /api/news/competitions -> competencias para el select "Competencia relacionada"
router.get('/competitions', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competitions')
    .select('id, name, season')
    .order('start_date', { ascending: false });
  lanzar(error);

  res.json({ data });
}));

// POST /api/news/cover -> sube la imagen destacada (cuerpo binario) y devuelve su URL publica
router.post(
  '/cover',
  express.raw({ type: Object.keys(EXTENSIONES), limit: TAMANO_MAX_IMAGEN }),
  asyncHandler(async (req, res) => {
    const tipo = (req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    const extension = EXTENSIONES[tipo];
    if (!extension) throw new HttpError(400, 'La imagen debe ser JPG, PNG o WebP');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No se recibio la imagen');

    const ruta = `covers/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;
    const subir = () => supabase.storage.from(BUCKET).upload(ruta, req.body, { contentType: tipo });

    let { error } = await subir();
    if (error && /bucket not found/i.test(error.message || '')) {
      // Primera vez: el bucket publico de noticias todavia no existe.
      const { error: errorBucket } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: TAMANO_MAX_IMAGEN,
        allowedMimeTypes: Object.keys(EXTENSIONES)
      });
      if (errorBucket && !/already exists/i.test(errorBucket.message || '')) {
        throw new HttpError(500, 'No se pudo crear el almacenamiento de imagenes: ' + errorBucket.message);
      }
      ({ error } = await subir());
    }
    if (error) throw new HttpError(500, 'No se pudo guardar la imagen: ' + error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
    res.status(201).json({ data: { url: data.publicUrl, path: ruta } });
  })
);

// GET /api/news/:id
router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await buscarNoticia(req.params.id) });
}));

// POST /api/news -> crea la noticia (borrador por defecto) a nombre del usuario en sesion
router.post('/', asyncHandler(async (req, res) => {
  const campos = leerCampos(req.body || {});
  if (!campos.title) throw new HttpError(400, 'El titulo es obligatorio');

  const noticia = {
    summary: null,
    content: '',
    cover_image_url: '',
    cover_image_alt: '',
    is_featured: false,
    status: 'BORRADOR',
    competition_id: null,
    published_at: null,
    ...campos,
    slug: await slugDisponible(campos.title),
    author_id: req.usuario.id,
    updated_by: req.usuario.id
  };

  if (noticia.status === 'PUBLICADA') {
    validarPublicable(noticia);
    if (!noticia.published_at) noticia.published_at = new Date().toISOString();
  }

  const { data: creada, error } = await supabase.from('news').insert(noticia).select('id').single();
  lanzar(error);

  if (noticia.is_featured) await quitarOtrasDestacadas(creada.id);

  res.status(201).json({ data: await buscarNoticia(creada.id) });
}));

// PATCH /api/news/:id -> edita, publica, programa o archiva
router.patch('/:id', asyncHandler(async (req, res) => {
  const campos = leerCampos(req.body || {});
  if (!Object.keys(campos).length) throw new HttpError(400, 'No se envio ningun campo para actualizar');

  const actual = await buscarNoticia(req.params.id);
  const resultado = { ...actual, ...campos };

  if (resultado.status === 'PUBLICADA') {
    validarPublicable(resultado);
    if (!resultado.published_at) campos.published_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('news')
    .update({ ...campos, updated_by: req.usuario.id, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  lanzar(error, 'Noticia');

  if (campos.is_featured) await quitarOtrasDestacadas(req.params.id);

  res.json({ data: await buscarNoticia(req.params.id) });
}));

// DELETE /api/news/:id -> retira la noticia (borrado logico, queda quien y cuando)
router.delete('/:id', asyncHandler(async (req, res) => {
  await buscarNoticia(req.params.id);

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('news')
    .update({
      deleted_at: ahora,
      deleted_by: req.usuario.id,
      is_featured: false,
      updated_by: req.usuario.id,
      updated_at: ahora
    })
    .eq('id', req.params.id);
  lanzar(error, 'Noticia');

  res.json({ data: { id: req.params.id, deleted_at: ahora } });
}));

module.exports = router;
