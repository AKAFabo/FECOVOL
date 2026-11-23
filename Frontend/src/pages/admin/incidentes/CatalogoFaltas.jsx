import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../AdminCommon.css';
import './FormulariosAdmin.css';
import './Incidentes.css';
import { APLICA, GRAVEDAD, TIPOS_SANCION, guardarFalta, listarFaltas } from './incidentesDatos.js';

const VACIA = {
  code: '',
  name: '',
  applies_to: 'PERSONA',
  severity: 'LEVE',
  min_sanction: 'AMONESTACION',
  min_quantity: '',
  max_sanction: 'AMONESTACION',
  max_quantity: '',
  recidivism: '',
  is_active: true
};

const unidadDe = (codigo) => TIPOS_SANCION.find((t) => t.codigo === codigo)?.unidad;

function FaltaModal({ falta, onCerrar, onGuardada }) {
  const [form, setForm] = useState(
    falta
      ? {
          code: falta.codigo,
          name: falta.nombre,
          applies_to: falta.aplica,
          severity: falta.gravedad,
          min_sanction: falta.minTipo,
          min_quantity: falta.minCantidad ?? '',
          max_sanction: falta.maxTipo,
          max_quantity: falta.maxCantidad ?? '',
          recidivism: falta.reincidencia || '',
          is_active: falta.activa
        }
      : VACIA
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  const tiposPermitidos = TIPOS_SANCION.filter((t) => t.aplica.includes(form.applies_to));
  const poner = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Al cambiar a quién aplica, las sanciones que ya no aplican vuelven a Amonestación.
  const cambiarAplica = (e) => {
    const aplica = e.target.value;
    setForm((f) => {
      const vale = (codigo) => TIPOS_SANCION.find((t) => t.codigo === codigo)?.aplica.includes(aplica);
      return {
        ...f,
        applies_to: aplica,
        min_sanction: vale(f.min_sanction) ? f.min_sanction : 'AMONESTACION',
        max_sanction: vale(f.max_sanction) ? f.max_sanction : 'AMONESTACION'
      };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const datos = {
        ...form,
        min_quantity: unidadDe(form.min_sanction) ? Number(form.min_quantity) || null : null,
        max_quantity: unidadDe(form.max_sanction) ? Number(form.max_quantity) || null : null
      };
      await guardarFalta(falta?.id, datos);
      onGuardada();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const Sancion = ({ etiqueta, campoTipo, campoCantidad }) => {
    const unidad = unidadDe(form[campoTipo]);
    return (
      <>
        <label className="arb-campo">
          <span className="arb-campo__etiqueta">{etiqueta} *</span>
          <select className="arb-campo__input" value={form[campoTipo]} onChange={poner(campoTipo)}>
            {tiposPermitidos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="arb-campo">
          <span className="arb-campo__etiqueta">Cantidad{unidad ? ` (${unidad})` : ''}</span>
          <input
            type="number"
            min="1"
            className="arb-campo__input"
            disabled={!unidad}
            placeholder={unidad ? '' : 'No aplica'}
            value={unidad ? form[campoCantidad] : ''}
            onChange={poner(campoCantidad)}
          />
        </label>
      </>
    );
  };

  return (
    <div className="admin-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="falta-titulo" onSubmit={guardar} noValidate>
        <div className="admin-modal__header">
          <h2 id="falta-titulo" className="admin-modal__title">{falta ? `Editar ${falta.codigo}` : 'Agregar falta'}</h2>
          <button type="button" className="admin-modal__close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="admin-modal__body">
          <div className="arb-campos">
            <label className="arb-campo">
              <span className="arb-campo__etiqueta">Código *</span>
              <input className="arb-campo__input" maxLength={20} placeholder="F-22" value={form.code} onChange={poner('code')} />
            </label>
            <label className="arb-campo">
              <span className="arb-campo__etiqueta">Gravedad *</span>
              <select className="arb-campo__input" value={form.severity} onChange={poner('severity')}>
                {Object.entries(GRAVEDAD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
              </select>
            </label>
            <label className="arb-campo arb-campo--ancho">
              <span className="arb-campo__etiqueta">Falta *</span>
              <input className="arb-campo__input" maxLength={255} value={form.name} onChange={poner('name')} />
            </label>
            <label className="arb-campo">
              <span className="arb-campo__etiqueta">Aplica a *</span>
              <select className="arb-campo__input" value={form.applies_to} onChange={cambiarAplica}>
                {Object.entries(APLICA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="arb-campo">
              <span className="arb-campo__etiqueta">Reincidencia</span>
              <input className="arb-campo__input" maxLength={120} placeholder="Duplica" value={form.recidivism} onChange={poner('recidivism')} />
            </label>
            {Sancion({ etiqueta: 'Sanción mínima', campoTipo: 'min_sanction', campoCantidad: 'min_quantity' })}
            {Sancion({ etiqueta: 'Sanción máxima', campoTipo: 'max_sanction', campoCantidad: 'max_quantity' })}
            {falta && (
              <div className="arb-interruptor-fila arb-campo--ancho">
                <span>
                  <span className="arb-interruptor-fila__titulo">Activa</span>
                  <span className="arb-interruptor-fila__ayuda">Las faltas inactivas no se pueden elegir al resolver un expediente</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_active}
                  aria-label="Activa"
                  className={`arb-interruptor ${form.is_active ? 'arb-interruptor--activo' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                >
                  <span className="arb-interruptor__perilla" />
                </button>
              </div>
            )}
          </div>
          {error && <p className="arb-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        </div>
        <div className="admin-modal__footer">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CatalogoFaltas() {
  const [faltas, setFaltas] = useState(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null); // null | 'nueva' | falta

  const cargar = () => listarFaltas().then(setFaltas).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const activas = (faltas || []).filter((f) => f.activa).length;

  return (
    <div>
      <p className="arb-migas"><Link to="/admin/incidentes">Incidentes y sanciones</Link> › Catálogo de faltas</p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Catálogo de faltas</h1>
          <p className="admin-page-header__subtitle">
            {faltas ? `${activas} falta${activas === 1 ? '' : 's'} activa${activas === 1 ? '' : 's'} · basado en el Reglamento disciplinario` : 'Cargando…'}
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/admin/incidentes" className="admin-btn admin-btn--secondary">Volver</Link>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setEditando('nueva')}>Agregar falta</button>
        </div>
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-card arb-tabla-scroll">
        <div className="arb-tabla-interna" style={{ paddingTop: 18 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Falta</th>
                <th>Aplica a</th>
                <th>Gravedad</th>
                <th>Sanción mínima</th>
                <th>Sanción máxima</th>
                <th>Reincidencia</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {(faltas || []).map((f) => (
                <tr key={f.id} style={f.activa ? undefined : { opacity: 0.55 }}>
                  <td>{f.codigo}</td>
                  <td>{f.nombre}{!f.activa && ' (inactiva)'}</td>
                  <td>{APLICA[f.aplica]}</td>
                  <td><span className={`inc-gravedad ${GRAVEDAD[f.gravedad].clase}`}>{GRAVEDAD[f.gravedad].texto}</span></td>
                  <td>{f.sancionMinima}</td>
                  <td>{f.sancionMaxima}</td>
                  <td>{f.reincidencia || '—'}</td>
                  <td className="arb-tabla__accion">
                    <button type="button" className="inc-enlace-tabla" onClick={() => setEditando(f)}>Editar</button>
                  </td>
                </tr>
              ))}
              {faltas && faltas.length === 0 && (
                <tr><td colSpan={8} className="arb-vacio">Todavía no hay faltas en el catálogo.</td></tr>
              )}
              {!faltas && !error && (
                <tr><td colSpan={8} className="arb-vacio">Cargando catálogo…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="arb-aviso" style={{ marginTop: 20 }}>
        <span className="arb-aviso__titulo">Uso</span>
        <p>Al resolver un expediente se elige una falta de este catálogo y el sistema solo permite sanciones dentro de su rango.</p>
      </div>

      {editando && (
        <FaltaModal
          falta={editando === 'nueva' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
