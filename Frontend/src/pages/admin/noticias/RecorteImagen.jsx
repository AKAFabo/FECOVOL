import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Modal de recorte con proporción fija: la imagen se arrastra dentro del marco y se acerca con el zoom.
// El recorte se guarda como { zoom, cx, cy }, donde (cx, cy) es el centro en píxeles de la imagen original,
// para poder reabrirlo y seguir ajustando sobre el archivo original.

const ZOOM_MAX = 4;
const ANCHO_SALIDA_MAX = 1600;
const PASO_TECLADO = 10;

export default function RecorteImagen({ src, aspecto, recorteInicial, onCancelar, onAplicar }) {
  const marcoRef = useRef(null);
  const arrastre = useRef(null);
  const [imagen, setImagen] = useState(null);
  const [marco, setMarco] = useState({ ancho: 0, alto: 0 });
  const [zoom, setZoom] = useState(recorteInicial?.zoom ?? 1);
  const [centro, setCentro] = useState(recorteInicial ? { x: recorteInicial.cx, y: recorteInicial.cy } : null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const img = new Image();
    // Imágenes ya guardadas (p. ej. Supabase Storage) vienen de otro dominio: sin CORS el canvas
    // queda bloqueado y no se puede exportar el recorte.
    if (!/^(blob|data):/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => setImagen(img);
    img.src = src;
  }, [src]);

  useLayoutEffect(() => {
    const el = marcoRef.current;
    const medir = () => setMarco({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const listo = imagen && marco.ancho > 0;

  // Escala para que la imagen cubra el marco con zoom 1, y escala efectiva con el zoom aplicado.
  const escalaBase = listo ? Math.max(marco.ancho / imagen.naturalWidth, marco.alto / imagen.naturalHeight) : 1;
  const escala = escalaBase * zoom;
  const visibleAncho = marco.ancho / escala;
  const visibleAlto = marco.alto / escala;

  function limitar(c) {
    const limitarEje = (v, visible, total) => Math.min(Math.max(v, visible / 2), total - visible / 2);
    return {
      x: limitarEje(c.x, visibleAncho, imagen.naturalWidth),
      y: limitarEje(c.y, visibleAlto, imagen.naturalHeight)
    };
  }

  const centroActual = listo
    ? limitar(centro ?? { x: imagen.naturalWidth / 2, y: imagen.naturalHeight / 2 })
    : { x: 0, y: 0 };

  function iniciarArrastre(e) {
    if (!listo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, centro: centroActual };
  }

  function moverArrastre(e) {
    if (!arrastre.current) return;
    const dx = e.clientX - arrastre.current.x;
    const dy = e.clientY - arrastre.current.y;
    setCentro(limitar({ x: arrastre.current.centro.x - dx / escala, y: arrastre.current.centro.y - dy / escala }));
  }

  function terminarArrastre() {
    arrastre.current = null;
  }

  function moverConTeclado(e) {
    const desplazamientos = {
      ArrowLeft: [-PASO_TECLADO, 0],
      ArrowRight: [PASO_TECLADO, 0],
      ArrowUp: [0, -PASO_TECLADO],
      ArrowDown: [0, PASO_TECLADO]
    };
    const d = desplazamientos[e.key];
    if (!d || !listo) return;
    e.preventDefault();
    setCentro(limitar({ x: centroActual.x + d[0] / escala, y: centroActual.y + d[1] / escala }));
  }

  function aplicar() {
    setProcesando(true);
    const anchoSalida = Math.round(Math.min(ANCHO_SALIDA_MAX, visibleAncho));
    const altoSalida = Math.round(anchoSalida / aspecto);
    const canvas = document.createElement('canvas');
    canvas.width = anchoSalida;
    canvas.height = altoSalida;
    const ctx = canvas.getContext('2d');
    // Fondo blanco para que los PNG con transparencia no queden en negro al pasar a JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, anchoSalida, altoSalida);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      imagen,
      centroActual.x - visibleAncho / 2,
      centroActual.y - visibleAlto / 2,
      visibleAncho,
      visibleAlto,
      0,
      0,
      anchoSalida,
      altoSalida
    );
    canvas.toBlob(
      (blob) => {
        setProcesando(false);
        onAplicar({
          blob,
          url: URL.createObjectURL(blob),
          recorte: { zoom, cx: centroActual.x, cy: centroActual.y }
        });
      },
      'image/jpeg',
      0.9
    );
  }

  return (
    <div className="admin-modal-overlay" onClick={onCancelar}>
      <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <div>
            <h3 className="admin-modal__title">Editar recorte</h3>
            <p className="admin-side-card__subtitle">Arrastre la imagen para encuadrarla y use el zoom para acercarla.</p>
          </div>
          <button type="button" className="admin-modal__close" aria-label="Cerrar" onClick={onCancelar}>
            &times;
          </button>
        </div>

        <div className="admin-modal__body">
          <div
            ref={marcoRef}
            className="recorte-marco"
            style={{ aspectRatio: aspecto }}
            tabIndex={0}
            role="application"
            aria-label="Área de recorte. Use las flechas para mover la imagen."
            onPointerDown={iniciarArrastre}
            onPointerMove={moverArrastre}
            onPointerUp={terminarArrastre}
            onPointerCancel={terminarArrastre}
            onKeyDown={moverConTeclado}
          >
            {listo && (
              <img
                src={src}
                alt=""
                draggable={false}
                className="recorte-marco__imagen"
                style={{
                  width: imagen.naturalWidth * escala,
                  height: imagen.naturalHeight * escala,
                  left: marco.ancho / 2 - centroActual.x * escala,
                  top: marco.alto / 2 - centroActual.y * escala
                }}
              />
            )}
            <div className="recorte-marco__guias" aria-hidden="true" />
          </div>

          <div className="recorte-zoom">
            <label className="redactar-campo__etiqueta" htmlFor="recorte-zoom">Zoom</label>
            <input
              id="recorte-zoom"
              type="range"
              min={1}
              max={ZOOM_MAX}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <span className="recorte-zoom__valor">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <div className="admin-modal__footer">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={aplicar} disabled={!listo || procesando}>
            {procesando ? 'Procesando…' : 'Aplicar recorte'}
          </button>
        </div>
      </div>
    </div>
  );
}
