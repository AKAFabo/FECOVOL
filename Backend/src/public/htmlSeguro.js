// Limpieza del HTML de las noticias antes de publicarlo.
//
// El cuerpo de una noticia sale del editor de texto enriquecido de administración y se guarda como
// HTML. Mostrarlo tal cual permitiría que cualquiera con acceso al editor (o a la tabla) inyecte
// código que se ejecuta en el navegador de los visitantes (XSS almacenado). Aquí se deja pasar solo
// una lista blanca de etiquetas y atributos; todo lo demás se elimina.
//
// El portal vuelve a limpiar el HTML en el navegador antes de mostrarlo (defensa en profundidad).
const sanitizeHtml = require('sanitize-html');

// Imágenes incrustadas por el editor: solo formatos de mapa de bits. SVG queda fuera porque puede
// contener código.
const IMAGEN_DATA = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const OPCIONES = {
  allowedTags: [
    'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'hr'
  ],
  allowedAttributes: {
    // target y rel los fija transformTags; los que traiga el HTML original se reemplazan.
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height']
  },
  // Sin "javascript:", "vbscript:", "data:" en enlaces, etc.
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // Lo que no está permitido se descarta junto con su contenido si es peligroso
  // (script, style...), y se conserva el texto en el resto de los casos.
  disallowedTagsMode: 'discard',
  transformTags: {
    // Los enlaces se abren aparte y no le pasan al sitio destino acceso a esta página.
    a: (etiqueta, atributos) => ({
      tagName: 'a',
      attribs: { ...atributos, target: '_blank', rel: 'noopener noreferrer nofollow' }
    }),
    // Los títulos de primer nivel del editor bajan a h2: el h1 de la página es el título de la noticia.
    h1: 'h2',
    // El editor puede producir <div> en lugar de <p>.
    div: 'p'
  },
  // Una imagen solo queda si su origen es https:// o una imagen incrustada de un formato permitido.
  exclusiveFilter: (frame) =>
    frame.tag === 'img' && !(/^https:\/\//i.test(frame.attribs.src || '') || IMAGEN_DATA.test(frame.attribs.src || ''))
};

function limpiarHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  return sanitizeHtml(html, OPCIONES).trim();
}

// URL de imagen de portada: solo https. Una portada con otro esquema se omite.
function urlImagen(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

module.exports = { limpiarHtml, urlImagen };
