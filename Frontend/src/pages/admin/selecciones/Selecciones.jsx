// Selecciones nacionales: selecciones (categoría, rama y modalidad), eventos y convocatorias.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Campo, Cifras, Encabezado, Estado, Modal, OpcionesCatalogo, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { valoresCatalogo } from '../../../services/representante.js';
import {
  crearConvocatoria, crearEvento, crearSeleccion, editarEvento, editarSeleccion, ESTADOS_CONVOCATORIA, ESTADOS_EVENTO,
  MODALIDADES, resumenSelecciones, rutaConvocatoria
} from '../../../services/seleccionesAdmin.js';
import { fechaCorta } from '../../../utils/formato.js';

const rango = (e) => (e.start_date === e.end_date ? fechaCorta(e.start_date) : `${fechaCorta(e.start_date)} al ${fechaCorta(e.end_date)}`);

function useFormulario(inicial) {
  const [f, setF] = useState(inicial);
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  return [f, cambiar, setF];
}

function Pie({ ocupado, onCerrar, texto }) {
  return (
    <>
      <button type="button" className="g-boton" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
      <button type="submit" form="form-seleccion" className="g-boton g-boton--primario" disabled={ocupado}>{ocupado ? 'Guardando…' : texto}</button>
    </>
  );
}

function ModalSeleccion({ actual, onCerrar, onGuardada }) {
  const ramas = useCarga(() => valoresCatalogo('Ramas'), []);
  const categorias = useCarga(() => valoresCatalogo('Categorías'), []);
  const [f, cambiar] = useFormulario({
    name: actual?.name || '', modality: actual?.modality || 'SALA',
    branch_code: actual?.rama?.code || '', category_code: actual?.categoria?.code || '', status: actual?.status || 'ACTIVA'
  });
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  async function guardar(e) {
    e.preventDefault();
    setEstado({ ocupado: true, error: '' });
    try {
      if (actual) await editarSeleccion(actual.id, f); else await crearSeleccion(f);
      onGuardada(actual ? 'Selección actualizada.' : 'Selección creada.');
    } catch (err) { setEstado({ ocupado: false, error: err.message }); }
  }
  return (
    <Modal titulo={actual ? 'Editar selección' : 'Nueva selección'} onCerrar={onCerrar} ocupado={estado.ocupado} pie={<Pie ocupado={estado.ocupado} onCerrar={onCerrar} texto="Guardar" />}>
      <form id="form-seleccion" className="g-formulario" onSubmit={guardar}>
        {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
        <Campo etiqueta="Nombre" obligatorio ancho>{(a) => <input {...a} className="g-control" maxLength={120} value={f.name} onChange={cambiar('name')} placeholder="Selección Mayor Femenina de Sala" data-autofoco />}</Campo>
        <Campo etiqueta="Modalidad" obligatorio>{(a) => <select {...a} className="g-control" value={f.modality} onChange={cambiar('modality')}>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Campo>
        <Campo etiqueta="Rama" obligatorio>{(a) => <select {...a} className="g-control" value={f.branch_code} onChange={cambiar('branch_code')}><OpcionesCatalogo valores={ramas.datos} vacia="Seleccione…" /></select>}</Campo>
        <Campo etiqueta="Categoría" obligatorio>{(a) => <select {...a} className="g-control" value={f.category_code} onChange={cambiar('category_code')}><OpcionesCatalogo valores={categorias.datos} vacia="Seleccione…" /></select>}</Campo>
        {actual && <Campo etiqueta="Estado">{(a) => <select {...a} className="g-control" value={f.status} onChange={cambiar('status')}><option value="ACTIVA">Activa</option><option value="INACTIVA">Inactiva</option></select>}</Campo>}
      </form>
    </Modal>
  );
}

function ModalEvento({ actual, onCerrar, onGuardado }) {
  const [f, cambiar] = useFormulario({
    name: actual?.name || '', modality: actual?.modality || 'SALA', start_date: actual?.start_date || '',
    end_date: actual?.end_date || '', venue: actual?.venue || '', status: actual?.status || 'PROGRAMADO'
  });
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  async function guardar(e) {
    e.preventDefault();
    setEstado({ ocupado: true, error: '' });
    try {
      if (actual) await editarEvento(actual.id, f); else await crearEvento(f);
      onGuardado(actual ? 'Evento actualizado.' : 'Evento creado.');
    } catch (err) { setEstado({ ocupado: false, error: err.message }); }
  }
  return (
    <Modal titulo={actual ? 'Editar evento' : 'Nuevo evento'} bajada="Torneo, gira o concentración de una selección" onCerrar={onCerrar} ocupado={estado.ocupado} pie={<Pie ocupado={estado.ocupado} onCerrar={onCerrar} texto="Guardar" />}>
      <form id="form-seleccion" className="g-formulario" onSubmit={guardar}>
        {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
        <Campo etiqueta="Nombre" obligatorio ancho>{(a) => <input {...a} className="g-control" maxLength={160} value={f.name} onChange={cambiar('name')} data-autofoco />}</Campo>
        <Campo etiqueta="Modalidad" obligatorio>{(a) => <select {...a} className="g-control" value={f.modality} onChange={cambiar('modality')}>{Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Campo>
        <Campo etiqueta="Sede">{(a) => <input {...a} className="g-control" maxLength={160} value={f.venue} onChange={cambiar('venue')} />}</Campo>
        <Campo etiqueta="Inicio" obligatorio>{(a) => <input {...a} type="date" className="g-control" value={f.start_date} onChange={cambiar('start_date')} />}</Campo>
        <Campo etiqueta="Fin" obligatorio>{(a) => <input {...a} type="date" className="g-control" value={f.end_date} min={f.start_date || undefined} onChange={cambiar('end_date')} />}</Campo>
        {actual && <Campo etiqueta="Estado">{(a) => <select {...a} className="g-control" value={f.status} onChange={cambiar('status')}>{Object.entries(ESTADOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select>}</Campo>}
      </form>
    </Modal>
  );
}

function ModalConvocatoria({ selecciones, eventos, onCerrar, onCreada }) {
  const [f, cambiar] = useFormulario({ national_team_id: '', event_id: '', title: '', notes: '' });
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  async function guardar(e) {
    e.preventDefault();
    setEstado({ ocupado: true, error: '' });
    try {
      const c = await crearConvocatoria({ ...f, event_id: f.event_id || null });
      onCreada(c);
    } catch (err) { setEstado({ ocupado: false, error: err.message }); }
  }
  return (
    <Modal titulo="Nueva convocatoria" bajada="Queda en borrador hasta que la publique" onCerrar={onCerrar} ocupado={estado.ocupado} pie={<Pie ocupado={estado.ocupado} onCerrar={onCerrar} texto="Crear" />}>
      <form id="form-seleccion" className="g-formulario" onSubmit={guardar}>
        {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
        <Campo etiqueta="Selección" obligatorio ancho>{(a) => (
          <select {...a} className="g-control" value={f.national_team_id} onChange={cambiar('national_team_id')} data-autofoco>
            <option value="">Seleccione…</option>
            {selecciones.filter((s) => s.status === 'ACTIVA').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}</Campo>
        <Campo etiqueta="Evento" ancho ayuda="Opcional: una convocatoria puede ser para una concentración sin evento.">{(a) => (
          <select {...a} className="g-control" value={f.event_id} onChange={cambiar('event_id')}>
            <option value="">Sin evento</option>
            {eventos.filter((e) => e.status !== 'CANCELADO').map((e) => <option key={e.id} value={e.id}>{e.name} · {rango(e)}</option>)}
          </select>
        )}</Campo>
        <Campo etiqueta="Título" obligatorio ancho>{(a) => <input {...a} className="g-control" maxLength={160} value={f.title} onChange={cambiar('title')} placeholder="Convocatoria para la Copa Panamericana" />}</Campo>
        <Campo etiqueta="Notas internas" ancho>{(a) => <textarea {...a} className="g-control" rows={2} maxLength={2000} value={f.notes} onChange={cambiar('notes')} />}</Campo>
      </form>
    </Modal>
  );
}

export default function Selecciones() {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [mensaje, mostrar] = useMensaje();
  const [modal, setModal] = useState(null);
  const carga = useCarga((signal) => resumenSelecciones({ signal }), [version]);
  const listo = (texto) => { setModal(null); mostrar(texto); setVersion((v) => v + 1); };

  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  if (!carga.datos) return <Cargando texto="Cargando selecciones…" />;
  const { selecciones, eventos, convocatorias } = carga.datos;
  const publicadas = convocatorias.filter((c) => c.status === 'PUBLICADA').length;

  return (
    <div className="g-pagina">
      {mensaje}
      <Encabezado
        titulo="Selecciones nacionales"
        bajada="Selecciones, eventos y convocatorias. El portal muestra solo las convocatorias publicadas."
        acciones={<button type="button" className="g-boton g-boton--primario" onClick={() => setModal({ tipo: 'convocatoria' })} disabled={!selecciones.length}>Nueva convocatoria</button>}
      />
      <Cifras items={[
        { valor: selecciones.filter((s) => s.status === 'ACTIVA').length, texto: 'Selecciones activas' },
        { valor: eventos.filter((e) => e.status === 'PROGRAMADO').length, texto: 'Eventos programados' },
        { valor: publicadas, texto: 'Convocatorias publicadas', tono: publicadas ? 'ok' : undefined },
        { valor: convocatorias.filter((c) => c.status === 'BORRADOR').length, texto: 'En borrador' }
      ]} />

      <Tarjeta titulo="Convocatorias" nota="Más recientes primero">
        {convocatorias.length === 0 ? <p className="g-tarjeta__vacio">Todavía no hay convocatorias.</p> : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Convocatorias</caption>
              <thead><tr><th scope="col">Convocatoria</th><th scope="col">Selección</th><th scope="col">Evento</th><th scope="col">Integrantes</th><th scope="col">Estado</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr></thead>
              <tbody>
                {convocatorias.map((c) => {
                  const e = ESTADOS_CONVOCATORIA[c.status];
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.title}</th>
                      <td>{c.seleccion?.name}</td>
                      <td>{c.evento ? <>{c.evento.name}<span className="g-tabla__sub">{rango(c.evento)}</span></> : '—'}</td>
                      <td>{c.integrantes.jugadores} atletas · {c.integrantes.cuerpo_tecnico} cuerpo técnico</td>
                      <td><Estado tono={e.tono}>{e.texto}</Estado></td>
                      <td className="g-tabla__accion"><Link to={rutaConvocatoria(c.id)} className="g-boton g-boton--chico">Abrir<span className="visualmente-oculto"> {c.title}</span></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <div className="g-rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Tarjeta titulo="Selecciones" accion={<button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'seleccion' })}>Nueva selección</button>}>
          {selecciones.length === 0 ? <p className="g-tarjeta__vacio">Cree la primera selección (por ejemplo, Mayor Femenina de Sala).</p> : (
            <ul className="g-lista">
              {selecciones.map((s) => (
                <li key={s.id} className="g-lista__fila">
                  <div className="g-lista__texto">
                    <p className="g-lista__titulo">{s.name}</p>
                    <p className="g-lista__detalle">{[MODALIDADES[s.modality], s.rama?.value, s.categoria?.value].filter(Boolean).join(' · ')}</p>
                  </div>
                  {s.status !== 'ACTIVA' && <Estado tono="neutro">Inactiva</Estado>}
                  <button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'seleccion', actual: s })}>Editar<span className="visualmente-oculto"> {s.name}</span></button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Eventos" accion={<button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'evento' })}>Nuevo evento</button>}>
          {eventos.length === 0 ? <p className="g-tarjeta__vacio">Sin eventos registrados.</p> : (
            <ul className="g-lista">
              {eventos.map((e) => {
                const est = ESTADOS_EVENTO[e.status];
                return (
                  <li key={e.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo">{e.name}</p>
                      <p className="g-lista__detalle">{[rango(e), e.venue, MODALIDADES[e.modality]].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Estado tono={est.tono}>{est.texto}</Estado>
                    <button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'evento', actual: e })}>Editar<span className="visualmente-oculto"> {e.name}</span></button>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>

      {modal?.tipo === 'seleccion' && <ModalSeleccion actual={modal.actual} onCerrar={() => setModal(null)} onGuardada={listo} />}
      {modal?.tipo === 'evento' && <ModalEvento actual={modal.actual} onCerrar={() => setModal(null)} onGuardado={listo} />}
      {modal?.tipo === 'convocatoria' && (
        <ModalConvocatoria selecciones={selecciones} eventos={eventos} onCerrar={() => setModal(null)}
          onCreada={(c) => { setModal(null); navigate(rutaConvocatoria(c.id)); }} />
      )}
    </div>
  );
}
