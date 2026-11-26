// Selector de archivo en español. El <input type="file"> nativo muestra el texto del navegador
// ("Choose File / No file chosen" en un Chrome en inglés); aquí queda oculto y se usa un botón.
import { useRef } from 'react';

/**
 * @param {object} props  id y aria-* (los que pasa <Campo>) van al input, para que la etiqueta funcione.
 * @param {File|null} props.archivo
 * @param {(archivo: File|null) => void} props.onElegir
 * @param {string} [props.accept]
 * @param {string} [props.capture]
 * @param {string} [props.claseBoton]
 * @param {boolean} [props.deshabilitado]
 */
export default function SelectorArchivo({ archivo, onElegir, accept, capture, claseBoton = 'g-boton g-boton--chico', deshabilitado, ...entrada }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <input
        {...entrada}
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="visualmente-oculto"
        disabled={deshabilitado}
        onChange={(e) => onElegir(e.target.files?.[0] || null)}
      />
      <button type="button" className={claseBoton} onClick={() => ref.current?.click()} disabled={deshabilitado}>
        {archivo ? 'Cambiar archivo' : 'Seleccionar archivo'}
      </button>
      <span style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)', overflowWrap: 'anywhere' }}>
        {archivo ? `${archivo.name} · ${archivo.size < 1024 * 1024 ? `${Math.max(1, Math.round(archivo.size / 1024))} KB` : `${(archivo.size / 1024 / 1024).toFixed(1)} MB`}` : 'Ningún archivo seleccionado'}
      </span>
    </div>
  );
}
