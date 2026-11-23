import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../AdminCommon.css';
import '../arbitraje/Arbitraje.css';
import './Incidentes.css';
import { AnularSancionModal, AplicarSancionModal, ArchivarModal } from './ModalesExpediente.jsx';
import {
  ESTADO_EXPEDIENTE,
  ROLES,
  agregarDocumento,
  anularSancion,
  fechaHoraLarga,
  fechaLarga,
  guardarPropuesta,
  obtenerExpediente,
  obtenerOpciones,
  reemplazarDocumento,
  subirArchivo
} from './incidentesDatos.js';

const ACTIVOS = ['ABIERTO', 'EN_SEGUIMIENTO'];
const TIPOS_ARCHIVO = 'application/pdf,image/jpeg,image/png';
const TAMANO_MAX = 10 * 1024 * 1024;

function validarArchivo(file) {
  if (!TIPOS_ARCHIVO.split(',').includes(file.type)) return 'El archivo debe ser PDF, JPG o PNG.';
  if (file.size > TAMANO_MAX) return 'El archivo supera los 10 MB.';
  return null;
}

// Botón que abre el selector de archivos.
function BotonArchivo({ texto, deshabilitado, onArchivo }) {
  const entrada = useRef(null);
  return (
    <>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={deshabilitado} onClick={() => entrada.current?.click()}>
        {texto}
      </button>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ARCHIVO}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onArchivo(file);
        }}
      />
    </>
  );
}

export default function Expediente() {
  const { id } = useParams();
  const [caso, setCaso] = useState(null);
  const [faltas, setFaltas] = useState([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [propuesta, setPropuesta] = useState({ party_id: '', infraction_id: '', sanction_type: '', quantity: '', basis: '' });
  const [guardandoPropuesta, setGuardandoPropuesta] = useState(false);
  const [modal, setModal] = useState(null); // 'archivar' | 'sancion' | { anular: sancion }
  const [subiendo, setSubiendo] = useState(null);
  const [nuevoDoc, setNuevoDoc] = useState({ title: '', kind: 'PRUEBA' });

  const cargar = useCallback(() => {
    return obtenerExpediente(id)
      .then((c) => {
        setCaso(c);
        const personaPorDefecto = c.involucrados.find((i) => i.rol === 'DENUNCIADO') || c.involucrados[0];
        setPropuesta({
          party_id: c.propuesta.parteId || personaPorDefecto?.id || '',
          infraction_id: c.propuesta.faltaId || '',
          sanction_type: c.propuesta.tipo || '',
          quantity: c.propuesta.cantidad ?? '',
          basis: c.propuesta.fundamento || ''
        });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    cargar();
    obtenerOpciones().then((o) => setFaltas(o.faltas)).catch(() => {});
  }, [cargar]);

  if (error && !caso) {
    return (
      <div>
        <p className="arb-migas"><Link to="/admin/incidentes">Incidentes y sanciones</Link> › Expediente</p>
        <p className="arb-error" role="alert">{error}</p>
      </div>
    );
  }
  if (!caso) return <p className="arb-vacio">Cargando expediente…</p>;

  const estado = ESTADO_EXPEDIENTE[caso.estado];
  const activo = ACTIVOS.includes(caso.estado);
  const p = caso.partido;
  const parte = caso.involucrados.find((i) => i.id === propuesta.party_id);
  const faltasPosibles = faltas.filter((f) => !parte || f.aplica === parte.tipo);
  const falta = faltas.find((f) => f.id === propuesta.infraction_id);
  const opcionSancion = falta?.opciones.find((o) => o.tipo === propuesta.sanction_type);

  const cambiarPropuesta = (campo, valor) => {
    setAviso('');
    setPropuesta((actual) => {
      const nueva = { ...actual, [campo]: valor };
      if (campo === 'party_id') Object.assign(nueva, { infraction_id: '', sanction_type: '', quantity: '' });
      if (campo === 'infraction_id') {
        const f = faltas.find((x) => x.id === valor);
        const primera = f?.opciones[0];
        Object.assign(nueva, { sanction_type: primera?.tipo || '', quantity: primera?.cantidadMin ?? '' });
      }
      if (campo === 'sanction_type') {
        const o = falta?.opciones.find((x) => x.tipo === valor);
        nueva.quantity = o?.cantidadMin ?? '';
      }
      return nueva;
    });
  };

  const datosPropuesta = () => ({
    party_id: propuesta.party_id,
    infraction_id: propuesta.infraction_id,
    sanction_type: propuesta.sanction_type,
    quantity: opcionSancion?.unidad ? Number(propuesta.quantity) || null : null,
    basis: propuesta.basis
  });

  const propuestaCompleta = propuesta.party_id && propuesta.infraction_id && propuesta.sanction_type &&
    (!opcionSancion?.unidad || Number(propuesta.quantity) > 0);

  const guardar = async () => {
    setError('');
    setAviso('');
    setGuardandoPropuesta(true);
    try {
      await guardarPropuesta(caso.id, datosPropuesta());
      await cargar();
      setAviso('Propuesta guardada.');
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoPropuesta(false);
    }
  };

  const subir = async (clave, accion) => {
    setError('');
    setSubiendo(clave);
    try {
      await accion();
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(null);
    }
  };

  const agregar = (file) => {
    const problema = validarArchivo(file);
    if (problema) return setError(problema);
    if (!nuevoDoc.title.trim()) return setError('Escriba el título del documento antes de cargarlo.');
    subir('nuevo', async () => {
      const subido = await subirArchivo(file);
      await agregarDocumento(caso.id, { title: nuevoDoc.title.trim(), kind: nuevoDoc.kind, file: subido });
      setNuevoDoc({ title: '', kind: 'PRUEBA' });
    });
  };

  const reemplazar = (doc) => (file) => {
    const problema = validarArchivo(file);
    if (problema) return setError(problema);
    subir(doc.id, async () => reemplazarDocumento(caso.id, doc.id, await subirArchivo(file)));
  };

  const ultimoEvento = caso.cronologia[caso.cronologia.length - 1]?.id;

  return (
    <div>
      <p className="arb-migas"><Link to="/admin/incidentes">Incidentes y sanciones</Link> › {caso.numero}</p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>{caso.numero} · {caso.titulo}</h1>
          <p className="admin-page-header__subtitle">
            {[p ? `${p.local} vs ${p.visita}` : null, caso.competencia?.name, p ? `Jornada ${p.jornada}` : null].filter(Boolean).join(' · ')}
          </p>
          <div className="arb-pildoras">
            <span className={`badge-status ${estado.clase}`}>{estado.texto}</span>
            <span className="arb-pildora">Abierto el {fechaHoraLarga(caso.abierto)}</span>
            {caso.responsable && <span className="arb-pildora">Responsable: {caso.responsable.nombre}</span>}
            {caso.plazoDescargo && activo && <span className="arb-pildora">Descargo hasta el {fechaLarga(caso.plazoDescargo)}</span>}
          </div>
        </div>
        {activo && (
          <div className="admin-page-header__actions">
            <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModal('archivar')}>Archivar</button>
            <button
              type="button"
              className="admin-btn admin-btn--sancion"
              disabled={!propuestaCompleta}
              title={propuestaCompleta ? undefined : 'Complete la propuesta de resolución'}
              onClick={() => setModal('sancion')}
            >
              Aplicar sanción
            </button>
          </div>
        )}
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}
      {caso.estado === 'ARCHIVADO' && caso.motivoArchivo && (
        <div className="arb-aviso arb-aviso--naranja" style={{ marginBottom: 20 }}>
          <span className="arb-aviso__titulo">Archivado</span>
          <p>{caso.motivoArchivo}</p>
        </div>
      )}

      <div className="arb-layout">
        <div className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Hechos</h2></div>
            <div className="arb-card__cuerpo">
              <p className="inc-hechos">{caso.hechos}</p>
              <ul className="arb-datos">
                {p && (
                  <li>
                    Partido
                    <strong>
                      {[`#${p.numero}`, `${fechaLarga(p.fecha)}${p.hora ? `, ${String(p.hora).slice(0, 5)}` : ''}`, p.sede].filter(Boolean).join(' · ')}
                    </strong>
                  </li>
                )}
                <li>Momento <strong>{caso.momento || fechaHoraLarga(caso.ocurrido)}</strong></li>
                <li>Tipo de incidente <strong>{caso.tipo?.value || '—'}</strong></li>
                {caso.reportadoPor && <li>Reportado por <strong>{caso.reportadoPor}</strong></li>}
              </ul>
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header">
              <h2 className="arb-card__titulo">Cronología</h2>
              <p className="arb-card__subtitulo">Cada movimiento queda con fecha, hora y usuario</p>
            </div>
            <ul className="inc-cronologia" style={{ padding: '6px 0' }}>
              {caso.cronologia.map((e) => (
                <li key={e.id} className={`inc-evento inc-evento--${e.tipo.toLowerCase()} ${e.id === ultimoEvento ? 'inc-evento--ultimo' : ''}`}>
                  <span className="inc-evento__fecha">{fechaHoraLarga(e.fecha)}</span>
                  <span className="inc-evento__texto">{e.descripcion}</span>
                  <span className="inc-evento__actor">{e.actor}</span>
                </li>
              ))}
            </ul>
          </section>

          {caso.sanciones.length > 0 && (
            <section className="arb-card">
              <div className="arb-card__header"><h2 className="arb-card__titulo">Sanciones</h2></div>
              {caso.sanciones.map((s) => (
                <div key={s.id} className="inc-sancion">
                  <div className="inc-sancion__titulo">
                    <span>{s.etiqueta}</span>
                    <span className={`badge-status ${s.estado === 'VIGENTE' ? 'badge-status--sancion' : s.estado === 'CUMPLIDA' ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                      {s.estado === 'VIGENTE' ? 'Vigente' : s.estado === 'CUMPLIDA' ? 'Cumplida' : 'Anulada'}
                    </span>
                  </div>
                  <p className="inc-sancion__detalle">
                    {caso.involucrados.find((i) => i.id === s.parteId)?.nombre} · {s.falta}<br />
                    Se cumple: {s.cumplimiento}<br />
                    Fundamento: {s.fundamento}
                  </p>
                  {s.estado === 'VIGENTE' && (
                    <button type="button" className="inc-enlace-tabla" style={{ marginTop: 6 }} onClick={() => setModal({ anular: s })}>
                      Anular sanción
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Pruebas y documentos</h2></div>
            <div className="arb-card__cuerpo" style={{ paddingTop: 0 }}>
              {caso.documentos.map((d) => (
                <div key={d.id} className="arb-requisito">
                  <div className="arb-requisito__texto">
                    <span className="arb-requisito__nombre">{d.titulo}</span>
                    <span className="arb-requisito__archivo">
                      {subiendo === d.id ? 'Subiendo…' : d.url ? <a className="arb-documento" href={d.url} target="_blank" rel="noreferrer">{d.archivo}</a> : d.archivo}
                    </span>
                  </div>
                  <span className="badge-status badge-status--activa">Cargado</span>
                  {caso.estado !== 'ARCHIVADO' && (
                    <BotonArchivo texto="Reemplazar" deshabilitado={Boolean(subiendo)} onArchivo={reemplazar(d)} />
                  )}
                </div>
              ))}
              {caso.documentos.length === 0 && <p className="arb-vacio" style={{ paddingBottom: 0 }}>Todavía no hay documentos.</p>}

              {caso.estado !== 'ARCHIVADO' && (
                <div className="inc-agregar" style={{ gridTemplateColumns: 'minmax(0, 1fr) 160px auto' }}>
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Nuevo documento</span>
                    <input
                      className="arb-campo__input"
                      maxLength={255}
                      placeholder="Descargo del entrenador"
                      value={nuevoDoc.title}
                      onChange={(e) => setNuevoDoc((n) => ({ ...n, title: e.target.value }))}
                    />
                  </label>
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Tipo</span>
                    <select className="arb-campo__input" value={nuevoDoc.kind} onChange={(e) => setNuevoDoc((n) => ({ ...n, kind: e.target.value }))}>
                      <option value="PRUEBA">Prueba</option>
                      <option value="DESCARGO">Descargo</option>
                    </select>
                  </label>
                  <BotonArchivo texto={subiendo === 'nuevo' ? 'Subiendo…' : 'Cargar archivo'} deshabilitado={Boolean(subiendo)} onArchivo={agregar} />
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="arb-lateral">
          {caso.involucrados.map((i) => (
            <section key={i.id} className="arb-lateral__card">
              <div className="arb-lateral__header">
                <h2 className="arb-lateral__titulo">{i.tipo === 'PERSONA' ? 'Persona involucrada' : i.tipo === 'EQUIPO' ? 'Equipo involucrado' : 'Sede involucrada'}</h2>
                <span className="arb-pildora">{ROLES[i.rol]}</span>
              </div>
              <ul className="arb-datos arb-datos--tarjeta">
                <li>Nombre <strong>{i.nombre}</strong></li>
                {i.cedula && <li>Identificación <strong>{i.cedula}</strong></li>}
                {i.participa && <li>Participa como <strong>{i.participa}</strong></li>}
                {i.tipo === 'PERSONA' && <li>Equipo <strong>{i.equipo || '—'}</strong></li>}
                {i.tipo === 'PERSONA' && <li>Antecedentes <strong>{i.antecedentes.length ? i.antecedentes.join(', ') : 'Sin antecedentes'}</strong></li>}
              </ul>
            </section>
          ))}

          <section className="arb-lateral__card">
            <div className="arb-lateral__header"><h2 className="arb-lateral__titulo">Propuesta de resolución</h2></div>
            <div className="arb-card__cuerpo">
              <fieldset disabled={!activo} style={{ border: 0, padding: 0, margin: 0 }}>
                <div className="arb-campos" style={{ gridTemplateColumns: '1fr' }}>
                  {caso.involucrados.length > 1 && (
                    <label className="arb-campo">
                      <span className="arb-campo__etiqueta">Involucrado a sancionar</span>
                      <select className="arb-campo__input" value={propuesta.party_id} onChange={(e) => cambiarPropuesta('party_id', e.target.value)}>
                        {caso.involucrados.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({ROLES[i.rol].toLowerCase()})</option>)}
                      </select>
                    </label>
                  )}
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Falta según catálogo</span>
                    <select className="arb-campo__input" value={propuesta.infraction_id} onChange={(e) => cambiarPropuesta('infraction_id', e.target.value)}>
                      <option value="">Seleccione una falta</option>
                      {faltasPosibles.map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.nombre}</option>)}
                    </select>
                  </label>
                  {falta && (
                    <label className="arb-campo">
                      <span className="arb-campo__etiqueta">Sanción</span>
                      <select className="arb-campo__input" value={propuesta.sanction_type} onChange={(e) => cambiarPropuesta('sanction_type', e.target.value)}>
                        {falta.opciones.map((o) => <option key={o.tipo} value={o.tipo}>{o.etiqueta}</option>)}
                      </select>
                      <span className="inc-rango">Rango del catálogo: {falta.rango}</span>
                    </label>
                  )}
                  {opcionSancion?.unidad && (
                    <label className="arb-campo">
                      <span className="arb-campo__etiqueta">Cantidad ({opcionSancion.unidad})</span>
                      <input
                        type="number"
                        className="arb-campo__input"
                        min={opcionSancion.cantidadMin}
                        max={opcionSancion.cantidadMax ?? undefined}
                        value={propuesta.quantity}
                        onChange={(e) => cambiarPropuesta('quantity', e.target.value)}
                      />
                      <span className="inc-rango">
                        {opcionSancion.cantidadMax ? `Entre ${opcionSancion.cantidadMin} y ${opcionSancion.cantidadMax}` : `Desde ${opcionSancion.cantidadMin}`}
                      </span>
                    </label>
                  )}
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Fundamento</span>
                    <textarea className="arb-campo__input" maxLength={2000} value={propuesta.basis} onChange={(e) => cambiarPropuesta('basis', e.target.value)} />
                  </label>
                  {activo && (
                    <button type="button" className="admin-btn admin-btn--secondary" disabled={!propuestaCompleta || guardandoPropuesta} onClick={guardar}>
                      {guardandoPropuesta ? 'Guardando…' : 'Guardar propuesta'}
                    </button>
                  )}
                  {aviso && <span className="arb-campo__ayuda arb-campo__ayuda--ok">{aviso}</span>}
                </div>
              </fieldset>
            </div>
          </section>
        </aside>
      </div>

      {modal === 'archivar' && (
        <ArchivarModal caso={caso} onCerrar={() => setModal(null)} onListo={() => { setModal(null); cargar(); }} />
      )}
      {modal === 'sancion' && (
        <AplicarSancionModal
          caso={caso}
          propuesta={datosPropuesta()}
          onCerrar={() => setModal(null)}
          onListo={() => { setModal(null); cargar(); }}
        />
      )}
      {modal?.anular && (
        <AnularSancionModal
          sancion={modal.anular}
          onCerrar={() => setModal(null)}
          onConfirmar={async (motivo) => {
            await anularSancion(caso.id, modal.anular.id, motivo);
            setModal(null);
            await cargar();
          }}
        />
      )}
    </div>
  );
}
