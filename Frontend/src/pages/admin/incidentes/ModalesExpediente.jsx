import { useEffect, useState } from 'react';
import { GRAVEDAD, aplicarSancion, archivarExpediente, vistaPreviaSancion } from './incidentesDatos.js';

function Modal({ titulo, subtitulo, onCerrar, children, pie }) {
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="admin-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="inc-modal-titulo">
        <div className="admin-modal__header">
          <div>
            <h2 id="inc-modal-titulo" className="admin-modal__title">{titulo}</h2>
            {subtitulo && <p className="inc-modal-subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="admin-modal__close" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="admin-modal__body">{children}</div>
        <div className="admin-modal__footer">{pie}</div>
      </div>
    </div>
  );
}

// Archivar exige una justificación: el expediente no se borra nunca.
export function ArchivarModal({ caso, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const archivar = async () => {
    setError('');
    if (motivo.trim().length < 10) return setError('Explique por qué se archiva (al menos 10 caracteres).');
    setGuardando(true);
    try {
      await archivarExpediente(caso.id, motivo.trim());
      onListo();
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={`Archivar · ${caso.numero}`}
      subtitulo="El expediente no se elimina: queda archivado con su justificación."
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="admin-btn admin-btn--primary" disabled={guardando} onClick={archivar}>
            {guardando ? 'Archivando…' : 'Archivar'}
          </button>
        </>
      }
    >
      <label className="arb-campo">
        <span className="arb-campo__etiqueta">Justificación *</span>
        <textarea className="arb-campo__input" maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <p className="arb-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </Modal>
  );
}

// Confirmación de la sanción con el detalle de la propuesta y cuándo se cumple.
export function AplicarSancionModal({ caso, propuesta, onCerrar, onListo }) {
  const [vista, setVista] = useState(null);
  const [fundamento, setFundamento] = useState(propuesta.basis || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // La propuesta llega como objeto nuevo en cada render: se compara por contenido.
  const clave = JSON.stringify(propuesta);
  useEffect(() => {
    vistaPreviaSancion(caso.id, JSON.parse(clave)).then(setVista).catch((e) => setError(e.message));
  }, [caso.id, clave]);

  const aplicar = async () => {
    setError('');
    if (!fundamento.trim()) return setError('Escriba el fundamento de la sanción.');
    setGuardando(true);
    try {
      await aplicarSancion(caso.id, { ...propuesta, basis: fundamento.trim() });
      onListo();
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  const persona = caso.involucrados.find((i) => i.id === propuesta.party_id);
  const esSuspension = ['SUSPENSION_PARTIDOS', 'SUSPENSION_MESES', 'EXPULSION'].includes(propuesta.sanction_type);
  const esEquipo = ['PERDIDA_PARTIDO', 'PERDIDA_PUNTOS'].includes(propuesta.sanction_type);
  const gravedad = vista ? GRAVEDAD[vista.gravedad] : null;

  return (
    <Modal
      titulo={`Aplicar sanción · ${caso.numero}`}
      subtitulo="La falta y la sanción se eligen en la propuesta de resolución del expediente."
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="admin-btn admin-btn--sancion" disabled={guardando || !vista} onClick={aplicar}>
            {guardando ? 'Aplicando…' : 'Aplicar sanción'}
          </button>
        </>
      }
    >
      {!vista && !error && <p className="arb-vacio">Calculando la sanción…</p>}
      {vista && (
        <ul className="arb-datos">
          <li>
            {persona?.tipo === 'PERSONA' ? 'Persona' : persona?.tipo === 'EQUIPO' ? 'Equipo' : 'Sede'}
            <strong>{[persona?.nombre, persona?.participa, persona?.tipo === 'PERSONA' ? persona?.equipo : null].filter(Boolean).join(' · ')}</strong>
          </li>
          <li>Falta del catálogo <strong>{vista.falta}</strong></li>
          <li>Gravedad <strong><span className={`inc-gravedad ${gravedad?.clase}`}>{gravedad?.texto}</span></strong></li>
          <li>Sanción <strong>{vista.etiqueta}</strong></li>
          <li>Rango permitido <strong>{vista.rango}</strong></li>
          <li>Se cumple en <strong>{vista.texto}</strong></li>
        </ul>
      )}
      <label className="arb-campo" style={{ marginTop: 14 }}>
        <span className="arb-campo__etiqueta">Fundamento *</span>
        <textarea className="arb-campo__input" maxLength={2000} value={fundamento} onChange={(e) => setFundamento(e.target.value)} />
      </label>
      {esSuspension && (
        <div className="arb-aviso arb-aviso--naranja inc-modal-aviso">
          <p>Mientras dure la suspensión, el sistema no permite inscribir a la persona en la nómina de ninguna competencia.</p>
        </div>
      )}
      {esEquipo && (
        <div className="arb-aviso arb-aviso--naranja inc-modal-aviso">
          <p>La sanción queda registrada en el expediente. Registre también el resultado especial del partido desde Competencias para que afecte la tabla.</p>
        </div>
      )}
      {error && <p className="arb-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </Modal>
  );
}

export function AnularSancionModal({ sancion, onCerrar, onConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const anular = async () => {
    setError('');
    if (!motivo.trim()) return setError('Indique el motivo de la anulación.');
    setGuardando(true);
    try {
      await onConfirmar(motivo.trim());
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Anular sanción"
      subtitulo={sancion.etiqueta}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="admin-btn admin-btn--danger" disabled={guardando} onClick={anular}>
            {guardando ? 'Anulando…' : 'Anular sanción'}
          </button>
        </>
      }
    >
      <label className="arb-campo">
        <span className="arb-campo__etiqueta">Motivo *</span>
        <textarea className="arb-campo__input" maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <p className="arb-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </Modal>
  );
}
