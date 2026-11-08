// Piezas comunes de las pantallas con sesión. Los estilos están en styles/gestion.css.
import { useEffect, useId, useRef, useState } from 'react';
import '../../styles/gestion.css';

export function Encabezado({ titulo, bajada, acciones, children }) {
  return (
    <header className="g-encabezado">
      <div>
        <h1 className="g-encabezado__titulo">{titulo}</h1>
        {bajada && <p className="g-encabezado__bajada">{bajada}</p>}
        {children}
      </div>
      {acciones && <div className="g-encabezado__acciones">{acciones}</div>}
    </header>
  );
}

export function Cifras({ items }) {
  return (
    <ul className="g-cifras" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((c) => (
        <li key={c.texto} className={`g-cifra${c.tono ? ` g-cifra--${c.tono}` : ''}`}>
          <span className="g-cifra__valor">{c.valor ?? '—'}</span>
          <span className="g-cifra__texto">{c.texto}</span>
        </li>
      ))}
    </ul>
  );
}

const TONOS = { ok: 'ok', aviso: 'aviso', error: 'error', neutro: 'neutra', info: 'info' };
export function Estado({ tono = 'neutro', children }) {
  return <span className={`pastilla pastilla--${TONOS[tono] || 'neutra'}`}>{children}</span>;
}

export function Tarjeta({ titulo, nota, accion, pie, children, id }) {
  const generado = useId();
  const tituloId = id || generado;
  return (
    <section className="g-tarjeta" aria-labelledby={titulo ? tituloId : undefined}>
      {titulo && (
        <div className="g-tarjeta__cabecera">
          <div>
            <h2 id={tituloId} className="g-tarjeta__titulo">{titulo}</h2>
            {nota && <p className="g-tarjeta__nota">{nota}</p>}
          </div>
          {accion}
        </div>
      )}
      {children}
      {pie && <div className="g-tarjeta__pie">{pie}</div>}
    </section>
  );
}

/** Campo de formulario con etiqueta, ayuda y error asociados al control (accesible). */
export function Campo({ etiqueta, ayuda, error, ancho, obligatorio, children }) {
  const id = useId();
  const ayudaId = ayuda ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = typeof children === 'function'
    ? children({ id, 'aria-describedby': [ayudaId, errorId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? 'true' : undefined })
    : children;
  return (
    <div className={`g-campo${ancho ? ' g-campo--ancho' : ''}`}>
      <label htmlFor={id} className="g-campo__etiqueta">
        {etiqueta}{obligatorio && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      {ayuda && <p id={ayudaId} className="g-campo__ayuda">{ayuda}</p>}
      {error && <p id={errorId} className="g-campo__error">{error}</p>}
    </div>
  );
}

/**
 * Ventana modal accesible: atrapa el foco, cierra con Escape y devuelve el foco al elemento que
 * la abrió. Mientras `ocupado` es true no se puede cerrar (por ejemplo, durante una subida).
 */
export function Modal({ titulo, bajada, onCerrar, ocupado = false, pie, children, ancho }) {
  const ref = useRef(null);
  const tituloId = useId();
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const ocupadoRef = useRef(ocupado);
  ocupadoRef.current = ocupado;

  useEffect(() => {
    const previo = document.activeElement;
    const nodo = ref.current;
    const enfocables = () => nodo.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    (nodo.querySelector('[data-autofoco]') || enfocables()[0] || nodo).focus();
    const desbordePrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function alTeclear(e) {
      if (e.key === 'Escape' && !ocupadoRef.current) {
        e.stopPropagation();
        cerrarRef.current();
      }
      if (e.key !== 'Tab') return;
      const lista = Array.from(enfocables());
      if (!lista.length) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
    nodo.addEventListener('keydown', alTeclear);
    return () => {
      nodo.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = desbordePrevio;
      if (previo && typeof previo.focus === 'function') previo.focus();
    };
  }, []);

  return (
    <div className="g-modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="g-modal" style={ancho ? { maxWidth: ancho } : undefined} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}>
        <div className="g-modal__cabecera">
          <div>
            <h2 id={tituloId} className="g-modal__titulo">{titulo}</h2>
            {bajada && <p className="g-modal__bajada">{bajada}</p>}
          </div>
          <button type="button" className="g-modal__cerrar" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">×</button>
        </div>
        <div className="g-modal__cuerpo">{children}</div>
        {pie && <div className="g-modal__pie">{pie}</div>}
      </div>
    </div>
  );
}

/** Confirmación simple antes de una acción que no se puede deshacer desde la pantalla. */
export function Confirmar({ titulo, texto, textoAccion = 'Confirmar', peligro, onConfirmar, onCerrar }) {
  const [estado, setEstado] = useState({ ocupado: false, error: null });
  async function confirmar() {
    setEstado({ ocupado: true, error: null });
    try {
      await onConfirmar();
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
    }
  }
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      ocupado={estado.ocupado}
      ancho="460px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.ocupado}>Cancelar</button>
          <button type="button" className={`g-boton ${peligro ? 'g-boton--peligro' : 'g-boton--primario'}`} onClick={confirmar} disabled={estado.ocupado} data-autofoco>
            {estado.ocupado ? 'Procesando…' : textoAccion}
          </button>
        </>
      )}
    >
      <p style={{ margin: 0, lineHeight: 1.5 }}>{texto}</p>
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
    </Modal>
  );
}

/** Mensaje breve que se anuncia a lectores de pantalla y desaparece solo. */
export function useMensaje() {
  const [mensaje, setMensaje] = useState(null);
  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(null), 4000);
    return () => clearTimeout(t);
  }, [mensaje]);
  const nodo = (
    <div aria-live="polite" role="status">
      {mensaje && <div className="g-mensaje">{mensaje}</div>}
    </div>
  );
  return [nodo, setMensaje];
}

/** Selector de un catálogo ya cargado: [{ code, value }]. */
export function OpcionesCatalogo({ valores, vacia }) {
  return (
    <>
      {vacia !== undefined && <option value="">{vacia}</option>}
      {(valores || []).map((v) => (
        <option key={v.code} value={v.code}>{v.value}</option>
      ))}
    </>
  );
}
