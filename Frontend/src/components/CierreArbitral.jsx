// Cierre arbitral de un partido (RF-ARB-005) visto por el Personal de competencias: lo que envió el
// árbitro principal y la opción de devolverlo con un motivo para que lo corrija.
import { useEffect, useState } from 'react';
import { api } from '../services/apiInterna.js';
import { Modal } from './gestion/Gestion.jsx';

const RESULTADOS = {
  NORMAL: 'Resultado normal',
  NO_PRESENTADO_LOCAL: 'No se presentó el equipo local',
  NO_PRESENTADO_VISITANTE: 'No se presentó el equipo visitante',
  GANADO_POR_DEFECTO_LOCAL: 'Gana el local por defecto',
  GANADO_POR_DEFECTO_VISITANTE: 'Gana el visitante por defecto',
  SUSPENDIDO_DEFINITIVO: 'Partido suspendido'
};
const ESTADOS = {
  BORRADOR: 'El árbitro principal tiene un borrador sin enviar',
  ENVIADO: 'Cierre enviado por el árbitro principal',
  DEVUELTO: 'Cierre devuelto al árbitro para corregir'
};

export default function CierreArbitral({ matchId, onCambio }) {
  const [cierre, setCierre] = useState(null);
  const [version, setVersion] = useState(0);
  const [devolver, setDevolver] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, error: '' });

  useEffect(() => {
    const control = new AbortController();
    api.get(`/referee-assignments/cierres/${encodeURIComponent(matchId)}`, { signal: control.signal })
      .then((r) => setCierre(r.data))
      .catch(() => setCierre(null));
    return () => control.abort();
  }, [matchId, version]);

  if (!cierre) return null;

  async function confirmarDevolucion() {
    setEstado({ ocupado: true, error: '' });
    try {
      await api.patch(`/referee-assignments/cierres/${encodeURIComponent(matchId)}/devolver`, { motivo: motivo.trim() });
      setDevolver(false);
      setMotivo('');
      setEstado({ ocupado: false, error: '' });
      setVersion((v) => v + 1);
      onCambio?.();
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
    }
  }

  const arbitro = [cierre.arbitro?.first_name, cierre.arbitro?.last_name].filter(Boolean).join(' ');
  return (
    <div className="admin-banner cierre-arbitral" style={{ marginBottom: '16px' }}>
      <strong>{ESTADOS[cierre.status]}{arbitro ? ` (${arbitro})` : ''}</strong>
      <div style={{ marginTop: '6px', fontSize: '0.86rem', lineHeight: 1.5 }}>
        {RESULTADOS[cierre.result_type] || cierre.result_type}
        {cierre.sets?.length > 0 && ` · Sets: ${cierre.sets.map((s) => `${s.home_points}-${s.away_points}`).join(', ')}`}
        {cierre.observations && <div>Observaciones: {cierre.observations}</div>}
        {cierre.status === 'DEVUELTO' && cierre.return_reason && <div>Motivo de la devolución: {cierre.return_reason}</div>}
        {cierre.status === 'ENVIADO' && <div>Los sets enviados ya están cargados abajo: revíselos y valide el acta, o devuelva el cierre si hay un error.</div>}
      </div>
      {cierre.status === 'ENVIADO' && (
        <div style={{ marginTop: '10px' }}>
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setDevolver(true)}>Devolver al árbitro</button>
        </div>
      )}
      {devolver && (
        <Modal
          titulo="Devolver el cierre al árbitro"
          onCerrar={() => setDevolver(false)}
          ocupado={estado.ocupado}
          pie={(
            <>
              <button type="button" className="g-boton" onClick={() => setDevolver(false)} disabled={estado.ocupado}>Cancelar</button>
              <button type="button" className="g-boton g-boton--peligro" onClick={confirmarDevolucion} disabled={estado.ocupado || motivo.trim().length < 10}>
                {estado.ocupado ? 'Devolviendo…' : 'Devolver'}
              </button>
            </>
          )}
        >
          {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
          <label className="g-campo__etiqueta" htmlFor="motivo-devolucion">Motivo (lo verá el árbitro)</label>
          <textarea id="motivo-devolucion" className="g-control" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} data-autofoco />
        </Modal>
      )}
    </div>
  );
}
