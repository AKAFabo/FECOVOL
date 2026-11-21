// FECOVOL revisa un documento: lo aprueba (queda vigente) o lo rechaza con el motivo, que la
// asociación ve junto al documento para corregirlo.
import { useState } from 'react';
import { Campo, Estado, Modal } from '../../../components/gestion/Gestion.jsx';
import { revisarDocumento } from '../../../services/administracion.js';
import { abrirDocumento, estadoDocumento } from '../../../services/representante.js';
import { fechaCorta } from '../../../utils/formato.js';
import { titularDocumento } from '../../asociacion/TablaDocumentos.jsx';

export default function RevisarDocumento({ documento: d, onCerrar, onRevisado }) {
  const [decision, setDecision] = useState('VIGENTE');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const titular = titularDocumento(d);
  const actual = estadoDocumento(d);

  async function guardar() {
    if (decision === 'RECHAZADO' && motivo.trim().length < 5) {
      setError('Explique qué debe corregir la asociación.');
      return;
    }
    setError(null);
    setEstado({ guardando: true, error: null });
    try {
      await revisarDocumento(d.id, decision, decision === 'RECHAZADO' ? motivo.trim() : undefined);
      onRevisado(decision);
    } catch (e) {
      setEstado({ guardando: false, error: e.message });
    }
  }

  async function ver() {
    try {
      await abrirDocumento(d.id);
    } catch (e) {
      setEstado((x) => ({ ...x, error: e.message }));
    }
  }

  return (
    <Modal
      titulo="Revisar documento"
      bajada={`${d.tipo?.value || 'Documento'} · ${titular.nombre}`}
      onCerrar={onCerrar}
      ocupado={estado.guardando}
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.guardando}>Cancelar</button>
          <button type="button" className={`g-boton ${decision === 'RECHAZADO' ? 'g-boton--peligro' : 'g-boton--primario'}`} onClick={guardar} disabled={estado.guardando}>
            {estado.guardando ? 'Guardando…' : decision === 'RECHAZADO' ? 'Rechazar documento' : 'Aprobar documento'}
          </button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <dl className="g-datos" style={{ border: '1px solid var(--linea)', borderRadius: 'var(--radio-sm)' }}>
        <div className="g-datos__fila"><dt>Titular</dt><dd>{titular.nombre} ({titular.detalle.toLowerCase()})</dd></div>
        {d.asociacion && d.titular !== 'ASOCIACION' && <div className="g-datos__fila"><dt>Asociación</dt><dd>{d.asociacion.name}</dd></div>}
        <div className="g-datos__fila"><dt>Emisión</dt><dd>{d.issue_date ? fechaCorta(d.issue_date) : '—'}</dd></div>
        <div className="g-datos__fila"><dt>Vencimiento</dt><dd>{d.expiry_date ? fechaCorta(d.expiry_date) : 'Sin vencimiento'}</dd></div>
        <div className="g-datos__fila"><dt>Estado actual</dt><dd><Estado tono={actual.tono}>{actual.texto}</Estado></dd></div>
        <div className="g-datos__fila"><dt>Cargado por</dt><dd>{d.uploaded_by || '—'}</dd></div>
      </dl>

      {d.tiene_archivo && (
        <div><button type="button" className="g-boton g-boton--chico" onClick={ver}>Ver archivo{d.file_name ? `: ${d.file_name}` : ''}</button></div>
      )}

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: 20 }}>
        <legend className="g-campo__etiqueta" style={{ marginBottom: 6 }}>Decisión</legend>
        {[['VIGENTE', 'Aprobar'], ['RECHAZADO', 'Rechazar']].map(([valor, texto]) => (
          <label key={valor} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
            <input type="radio" name="decision-documento" value={valor} checked={decision === valor} onChange={() => setDecision(valor)} />
            {texto}
          </label>
        ))}
      </fieldset>

      {decision === 'RECHAZADO' && (
        <Campo etiqueta="Motivo del rechazo" obligatorio error={error} ayuda="La asociación lo verá junto al documento.">
          {(a) => <textarea {...a} className="g-control" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
        </Campo>
      )}
    </Modal>
  );
}
