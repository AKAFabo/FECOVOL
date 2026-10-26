// Formato de salida de la API pública de noticias (lista blanca de campos).
//
// No se publica quién redactó o editó la noticia (author_id, updated_by: son cuentas del sistema),
// ni las fechas internas de creación o borrado.
const { limpiarHtml, urlImagen } = require('./htmlSeguro');
const { ESTADOS_PUBLICOS } = require('./competitionsDto');

const ESTADO_PUBLICO_NOTICIA = 'PUBLICADA';

function texto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

// La competencia relacionada solo se muestra si esa competencia también es pública.
function competencia(valor) {
  if (!valor || typeof valor !== 'object' || !ESTADOS_PUBLICOS.includes(valor.status)) return null;
  return { id: valor.id, name: texto(valor.name) };
}

function portada(fila) {
  const url = urlImagen(fila.cover_image_url);
  // Sin texto alternativo la imagen se trata como decorativa (alt vacío) en el portal.
  return url ? { url, alt: texto(fila.cover_image_alt) || '' } : null;
}

function aNoticiaResumen(fila) {
  return {
    id: fila.id,
    slug: texto(fila.slug),
    title: texto(fila.title),
    summary: texto(fila.summary),
    cover: portada(fila),
    featured: fila.is_featured === true,
    published_at: fila.published_at || null,
    competition: competencia(fila.competencia)
  };
}

function aNoticiaDetalle(fila) {
  return { ...aNoticiaResumen(fila), content_html: limpiarHtml(fila.content) };
}

module.exports = { ESTADO_PUBLICO_NOTICIA, aNoticiaResumen, aNoticiaDetalle };
