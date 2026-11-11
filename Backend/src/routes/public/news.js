// Noticias para el portal público (montado en /api/public/news).
//
// Una noticia es pública solo si cumple las tres condiciones:
// - está en estado PUBLICADA (no borrador ni archivada),
// - no fue borrada (deleted_at vacío),
// - su fecha de publicación ya pasó (así se pueden programar noticias a futuro).
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { HttpError } = require('../../utils/httpError');
const validateUuidParams = require('../../middleware/validateUuidParams');
const { fallaBaseDatos } = require('../../public/dbError');
const { ESTADO_PUBLICO_NOTICIA, aNoticiaResumen, aNoticiaDetalle } = require('../../public/newsDto');

const router = express.Router();
router.param('id', validateUuidParams);

const POR_PAGINA = 12;
const PAGINA_MAXIMA = 500;

const SELECT_RESUMEN = `
  id, slug, title, summary, cover_image_url, cover_image_alt, is_featured, published_at,
  competencia:competitions(id, name, status)
`;

function soloPublicas(query) {
  return query
    .eq('status', ESTADO_PUBLICO_NOTICIA)
    .is('deleted_at', null)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString());
}

// GET /api/public/news?page=1
router.get('/', asyncHandler(async (req, res) => {
  const { page = '1' } = req.query;
  if (typeof page !== 'string' || !/^\d{1,3}$/.test(page) || Number(page) < 1 || Number(page) > PAGINA_MAXIMA) {
    throw new HttpError(400, `page debe ser un número entre 1 y ${PAGINA_MAXIMA}`);
  }
  const pagina = Number(page);
  const desde = (pagina - 1) * POR_PAGINA;

  const { data, error, count } = await soloPublicas(
    supabase.from('news').select(SELECT_RESUMEN, { count: 'exact' })
  )
    .order('published_at', { ascending: false })
    .order('id')
    .range(desde, desde + POR_PAGINA - 1);
  if (error) throw fallaBaseDatos(error);

  res.json({
    data: {
      items: (data || []).map(aNoticiaResumen),
      page: pagina,
      page_size: POR_PAGINA,
      total: count || 0
    }
  });
}));

const RECIENTES_PORTADA = 4;

// GET /api/public/news/portada -> bloque de noticias de la página principal.
// featured: la noticia marcada "Destacar en portada" (aunque no sea de las más recientes);
//           si no hay ninguna, la más reciente.
// recientes: las siguientes noticias más recientes, sin repetir la destacada.
// Va antes de /:id para que "portada" no se tome como un identificador.
router.get('/portada', asyncHandler(async (req, res) => {
  const [destacadas, ultimas] = await Promise.all([
    soloPublicas(supabase.from('news').select(SELECT_RESUMEN))
      .eq('is_featured', true)
      .order('published_at', { ascending: false })
      .limit(1),
    soloPublicas(supabase.from('news').select(SELECT_RESUMEN))
      .order('published_at', { ascending: false })
      .order('id')
      .limit(RECIENTES_PORTADA + 1)
  ]);
  if (destacadas.error) throw fallaBaseDatos(destacadas.error);
  if (ultimas.error) throw fallaBaseDatos(ultimas.error);

  const lista = ultimas.data || [];
  const principal = (destacadas.data || [])[0] || lista[0] || null;
  const recientes = lista.filter((n) => !principal || n.id !== principal.id).slice(0, RECIENTES_PORTADA);

  res.json({
    data: {
      featured: principal ? aNoticiaResumen(principal) : null,
      recent: recientes.map(aNoticiaResumen)
    }
  });
}));

// GET /api/public/news/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await soloPublicas(
    supabase.from('news').select(`${SELECT_RESUMEN}, content`).eq('id', req.params.id)
  ).maybeSingle();
  if (error) throw fallaBaseDatos(error);
  // Igual respuesta para "no existe", "es un borrador" o "todavía no se publica".
  if (!data) throw new HttpError(404, 'Noticia no encontrada');

  res.json({ data: aNoticiaDetalle(data) });
}));

module.exports = router;
