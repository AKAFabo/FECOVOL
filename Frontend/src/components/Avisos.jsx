import { useEffect, useRef, useState } from 'react';
import Icono from './Icono.jsx';
import '../pages/admin/AdminCommon.css';
import './Avisos.css';

// Avisos y confirmaciones del sistema, en lugar de alert() y window.confirm() del navegador
// (que muestran "localhost dice" y no siguen el diseño).
//
//   avisar('Rol creado.', { tono: 'ok' })          → aviso flotante que se cierra solo
//   if (!(await pedirConfirmacion({ titulo, texto, textoAccion, peligro }))) return;
//
// <Avisos /> se monta una sola vez en App.jsx; las funciones se pueden llamar desde cualquier
// página sin pasar props.

let suscriptor = null;
let siguienteId = 1;

const DURACION = { ok: 4500, info: 6000, error: 8000 };

/** Muestra un aviso flotante. tono: 'ok' | 'error' | 'info'. */
export function avisar(texto, { tono = 'info' } = {}) {
  if (!texto) return;
  if (!suscriptor) { console.warn('[Avisos] sin contenedor montado:', texto); return; }
  suscriptor({ tipo: 'aviso', aviso: { id: siguienteId++, texto: String(texto), tono } });
}

/**
 * Pide confirmación con una ventana del sistema. Devuelve una promesa que se resuelve en
 * true (confirmó) o false (canceló o cerró).
 */
export function pedirConfirmacion({ titulo = 'Confirmar acción', texto = '', textoAccion = 'Confirmar', textoCancelar = 'Cancelar', peligro = false } = {}) {
  if (!suscriptor) return Promise.resolve(false);
  return new Promise((resolver) => {
    suscriptor({ tipo: 'confirmar', confirmacion: { titulo, texto, textoAccion, textoCancelar, peligro, resolver } });
  });
}

const ICONO_TONO = { ok: 'correcto', error: 'error', info: 'info' };

export default function Avisos() {
  const [avisos, setAvisos] = useState([]);
  const [confirmacion, setConfirmacion] = useState(null);
  const botonAccion = useRef(null);
  const botonCancelar = useRef(null);

  useEffect(() => {
    suscriptor = (evento) => {
      if (evento.tipo === 'aviso') {
        const { aviso } = evento;
        setAvisos((lista) => [...lista.slice(-3), aviso]);
        setTimeout(() => setAvisos((lista) => lista.filter((a) => a.id !== aviso.id)), DURACION[aviso.tono] || DURACION.info);
      } else if (evento.tipo === 'confirmar') {
        // Si ya había una abierta, la anterior se da por cancelada.
        setConfirmacion((previa) => { previa?.resolver(false); return evento.confirmacion; });
      }
    };
    return () => { suscriptor = null; };
  }, []);

  const cerrarConfirmacion = (resultado) => {
    setConfirmacion((actual) => { actual?.resolver(resultado); return null; });
  };

  useEffect(() => {
    if (!confirmacion) return undefined;
    // En acciones destructivas el foco queda en Cancelar, para que Enter no confirme sin querer.
    (confirmacion.peligro ? botonCancelar : botonAccion).current?.focus();
    const alTeclear = (e) => { if (e.key === 'Escape') cerrarConfirmacion(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [confirmacion]);

  const quitar = (id) => setAvisos((lista) => lista.filter((a) => a.id !== id));

  return (
    <>
      <div className="avisos-pila" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso-flotante aviso-flotante--${a.tono}`} role={a.tono === 'error' ? 'alert' : 'status'}>
            <Icono nombre={ICONO_TONO[a.tono] || 'info'} tam={18} />
            <p className="aviso-flotante__texto">{a.texto}</p>
            <button type="button" className="aviso-flotante__cerrar" onClick={() => quitar(a.id)} aria-label="Cerrar aviso">
              <Icono nombre="cerrar" tam={14} />
            </button>
          </div>
        ))}
      </div>

      {confirmacion && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirmacion-titulo" onClick={() => cerrarConfirmacion(false)}>
          <div className="admin-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2 id="confirmacion-titulo" className="admin-modal__title">{confirmacion.titulo}</h2>
              <button type="button" className="admin-modal__close" onClick={() => cerrarConfirmacion(false)} aria-label="Cerrar">
                <Icono nombre="cerrar" tam={16} />
              </button>
            </div>
            <div className="admin-modal__body">
              <div className="confirmacion-cuerpo">
                <span className={`confirmacion-icono${confirmacion.peligro ? ' confirmacion-icono--peligro' : ''}`}>
                  <Icono nombre={confirmacion.peligro ? 'alerta' : 'info'} tam={20} />
                </span>
                <div className="confirmacion-texto">
                  {String(confirmacion.texto).split('\n\n').filter(Boolean).map((parrafo, i) => <p key={i}>{parrafo}</p>)}
                </div>
              </div>
            </div>
            <div className="admin-modal__footer">
              <button ref={botonCancelar} type="button" className="admin-btn admin-btn--secondary" onClick={() => cerrarConfirmacion(false)}>
                {confirmacion.textoCancelar}
              </button>
              <button
                ref={botonAccion}
                type="button"
                className={`admin-btn ${confirmacion.peligro ? 'admin-btn--danger' : 'admin-btn--primary'}`}
                onClick={() => cerrarConfirmacion(true)}
              >
                {confirmacion.textoAccion}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
