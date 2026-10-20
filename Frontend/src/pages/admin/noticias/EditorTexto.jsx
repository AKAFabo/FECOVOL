import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Editor de texto enriquecido sin dependencias, basado en contentEditable + execCommand.
// Entrega el HTML resultante mediante onChange. valorInicial solo se lee al montar:
// para cargar otro contenido, remontar el componente con una key distinta.

const HERRAMIENTAS = [
  { id: 'negrita', texto: 'Negrita', titulo: 'Negrita (Ctrl+B)', clase: 'editor-barra__btn--negrita' },
  { id: 'italica', texto: 'Itálica', titulo: 'Itálica (Ctrl+I)', clase: 'editor-barra__btn--italica' },
  { id: 'subrayar', texto: 'Subrayar', titulo: 'Subrayar (Ctrl+U)', clase: 'editor-barra__btn--subrayado' },
  { id: 'h2', texto: 'H2', titulo: 'Subtítulo' },
  { id: 'h3', texto: 'H3', titulo: 'Subtítulo menor' },
  { id: 'cita', texto: '“ ”', titulo: 'Cita' },
  { id: 'lista', texto: 'Lista', titulo: 'Lista con viñetas' },
  { id: 'enlace', texto: 'Enlace', titulo: 'Insertar o quitar enlace' },
  { id: 'imagen', texto: 'Imagen', titulo: 'Insertar imagen en el texto' }
];

const BLOQUES = { h2: 'h2', h3: 'h3', cita: 'blockquote' };

const escaparHtml = (texto) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const normalizarUrl = (url) => {
  const limpia = url.trim();
  if (!limpia) return '';
  return /^(https?:\/\/|mailto:|\/)/i.test(limpia) ? limpia : `https://${limpia}`;
};

export default function EditorTexto({ valorInicial = '', onChange, placeholder = 'Escriba el cuerpo de la noticia…' }) {
  const editorRef = useRef(null);
  const inputImagenRef = useRef(null);
  const rangoGuardado = useRef(null);
  const [activos, setActivos] = useState({});
  const [vacio, setVacio] = useState(true);
  const [modalEnlace, setModalEnlace] = useState(null); // { url, texto, conSeleccion } | null

  useLayoutEffect(() => {
    const editor = editorRef.current;
    editor.innerHTML = valorInicial;
    setVacio(!editor.textContent.trim() && !editor.querySelector('img'));
  }, []);

  // Los saltos de línea generan <p> en lugar de <div>.
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []);

  // Refleja en la barra el formato donde está el cursor.
  useEffect(() => {
    function actualizarActivos() {
      const sel = window.getSelection();
      if (!sel.rangeCount || !editorRef.current?.contains(sel.anchorNode)) return;
      const bloque = String(document.queryCommandValue('formatBlock')).toLowerCase();
      const nodo = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      setActivos({
        negrita: document.queryCommandState('bold'),
        italica: document.queryCommandState('italic'),
        subrayar: document.queryCommandState('underline'),
        lista: document.queryCommandState('insertUnorderedList'),
        h2: bloque === 'h2',
        h3: bloque === 'h3',
        cita: bloque === 'blockquote',
        enlace: Boolean(nodo?.closest('a'))
      });
    }
    document.addEventListener('selectionchange', actualizarActivos);
    return () => document.removeEventListener('selectionchange', actualizarActivos);
  }, []);

  function notificarCambio() {
    const editor = editorRef.current;
    setVacio(!editor.textContent.trim() && !editor.querySelector('img'));
    onChange?.(editor.innerHTML);
  }

  function guardarSeleccion() {
    const sel = window.getSelection();
    if (sel.rangeCount && editorRef.current.contains(sel.anchorNode)) {
      rangoGuardado.current = sel.getRangeAt(0).cloneRange();
    } else {
      rangoGuardado.current = null;
    }
  }

  function restaurarSeleccion() {
    editorRef.current.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (rangoGuardado.current) {
      sel.addRange(rangoGuardado.current);
    } else {
      // Sin selección previa: el cursor va al final del texto.
      const rango = document.createRange();
      rango.selectNodeContents(editorRef.current);
      rango.collapse(false);
      sel.addRange(rango);
    }
  }

  function ejecutar(comando, valor = null) {
    editorRef.current.focus();
    document.execCommand(comando, false, valor);
    notificarCambio();
  }

  function aplicarHerramienta(id) {
    switch (id) {
      case 'negrita':
        return ejecutar('bold');
      case 'italica':
        return ejecutar('italic');
      case 'subrayar':
        return ejecutar('underline');
      case 'lista':
        return ejecutar('insertUnorderedList');
      case 'h2':
      case 'h3':
      case 'cita':
        // Si el bloque ya tiene ese formato, vuelve a párrafo normal.
        return ejecutar('formatBlock', activos[id] ? 'p' : BLOQUES[id]);
      case 'enlace':
        if (activos.enlace) return ejecutar('unlink');
        guardarSeleccion();
        setModalEnlace({
          url: '',
          texto: '',
          conSeleccion: Boolean(rangoGuardado.current && !rangoGuardado.current.collapsed)
        });
        return;
      case 'imagen':
        guardarSeleccion();
        inputImagenRef.current.click();
        return;
      default:
    }
  }

  function confirmarEnlace(e) {
    e.preventDefault();
    const url = normalizarUrl(modalEnlace.url);
    if (!url) return;
    restaurarSeleccion();
    if (modalEnlace.conSeleccion) {
      document.execCommand('createLink', false, url);
    } else {
      const texto = modalEnlace.texto.trim() || url;
      document.execCommand('insertHTML', false, `<a href="${escaparHtml(url)}">${escaparHtml(texto)}</a>&nbsp;`);
    }
    setModalEnlace(null);
    notificarCambio();
  }

  function insertarImagen(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo || !archivo.type.startsWith('image/')) return;
    const lector = new FileReader();
    lector.onload = () => {
      restaurarSeleccion();
      document.execCommand('insertImage', false, lector.result);
      notificarCambio();
    };
    lector.readAsDataURL(archivo);
  }

  // Pegar como texto plano para no arrastrar estilos de Word o de otras páginas.
  function pegarTextoPlano(e) {
    e.preventDefault();
    const texto = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, texto);
  }

  return (
    <>
      <div className="editor-barra" role="toolbar" aria-label="Formato del texto">
        {HERRAMIENTAS.map((h) => (
          <button
            key={h.id}
            type="button"
            title={h.titulo}
            aria-pressed={h.id === 'imagen' ? undefined : Boolean(activos[h.id])}
            className={`editor-barra__btn ${h.clase ?? ''} ${activos[h.id] ? 'editor-barra__btn--activo' : ''}`}
            // Evita que el botón le quite el foco (y la selección) al editor.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => aplicarHerramienta(h.id)}
          >
            {h.id === 'enlace' && activos.enlace ? 'Quitar enlace' : h.texto}
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        className={`editor-contenido ${vacio ? 'editor-contenido--vacio' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Cuerpo de la noticia"
        data-placeholder={placeholder}
        onInput={notificarCambio}
        onPaste={pegarTextoPlano}
      />

      <input ref={inputImagenRef} type="file" accept="image/*" hidden onChange={insertarImagen} />

      {modalEnlace && (
        <div className="admin-modal-overlay" onClick={() => setModalEnlace(null)}>
          <form className="admin-modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()} onSubmit={confirmarEnlace}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Insertar enlace</h3>
              <button type="button" className="admin-modal__close" aria-label="Cerrar" onClick={() => setModalEnlace(null)}>
                &times;
              </button>
            </div>
            <div className="admin-modal__body">
              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="enlace-url">Dirección (URL)</label>
                <input
                  id="enlace-url"
                  type="text"
                  autoFocus
                  className="redactar-campo__input"
                  placeholder="https://"
                  value={modalEnlace.url}
                  onChange={(e) => setModalEnlace({ ...modalEnlace, url: e.target.value })}
                />
              </div>
              {!modalEnlace.conSeleccion && (
                <div className="redactar-campo">
                  <label className="redactar-campo__etiqueta" htmlFor="enlace-texto">Texto a mostrar</label>
                  <input
                    id="enlace-texto"
                    type="text"
                    className="redactar-campo__input"
                    placeholder="Si se deja vacío se muestra la URL"
                    value={modalEnlace.texto}
                    onChange={(e) => setModalEnlace({ ...modalEnlace, texto: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalEnlace(null)}>
                Cancelar
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={!modalEnlace.url.trim()}>
                Insertar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
