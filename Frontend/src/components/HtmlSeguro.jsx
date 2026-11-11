import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Muestra HTML que viene de la API (el cuerpo de una noticia).
//
// Es el ÚNICO lugar del portal que usa dangerouslySetInnerHTML. La API ya entrega el HTML limpio
// (Backend/src/public/htmlSeguro.js); aquí se vuelve a limpiar con DOMPurify y la misma lista
// blanca, por si algún día llega HTML por otro camino. No usar dangerouslySetInnerHTML en otro
// componente: si hace falta mostrar HTML, pasar por este.

const ETIQUETAS = [
  'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'hr'
];
const ATRIBUTOS = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height'];
const IMAGEN_PERMITIDA = /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

let configurado = false;
function configurar() {
  if (configurado) return;
  configurado = true;
  DOMPurify.addHook('afterSanitizeAttributes', (nodo) => {
    if (nodo.tagName === 'A') {
      nodo.setAttribute('target', '_blank');
      nodo.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    if (nodo.tagName === 'IMG') {
      if (!IMAGEN_PERMITIDA.test(nodo.getAttribute('src') || '')) nodo.remove();
      else nodo.setAttribute('loading', 'lazy');
    }
  });
}

export default function HtmlSeguro({ html, className }) {
  const limpio = useMemo(() => {
    configurar();
    return DOMPurify.sanitize(typeof html === 'string' ? html : '', {
      ALLOWED_TAGS: ETIQUETAS,
      ALLOWED_ATTR: [...ATRIBUTOS, 'loading'],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpe?g|gif|webp);base64,|\/(?!\/)|#)/i
    });
  }, [html]);

  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: limpio }} />;
}
