// Designaciones arbitrales (Figma 03 · Designaciones arbitrales). La usan el Personal de
// competencias (/personal/designaciones) y Administración (/admin/arbitraje/designaciones).
//
// Cada partido necesita cuatro oficiales: principal, segundo, anotador y juez de línea. Al
// asignar, la designación queda «por confirmar» hasta que la persona la confirme en su entorno.
import { useMemo, useState } from 'react';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Campo, Confirmar, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import useDatosVigentes from '../../../hooks/useDatosVigentes.js';
import {
  anularDesignacion, categoriaArbitral, designarOficial, disponiblesParaPartido, ESTADOS_ACREDITACION, ESTADOS_DESIGNACION,
  hora, nombrePartido, partidosPorDesignar, PUESTOS
} from '../../../services/arbitraje.js';
import { nombrePersona, valoresCatalogo } from '../../../services/representante.js';
import { diaYHora } from '../../../utils/formato.js';
import '../../../styles/arbitraje.css';

const iniciales = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase() || '—';

function Oficiales({ n, total }) {
  return <span className={n >= total ? 'arb-texto-ok' : 'arb-texto-aviso'}>{n} de {total} oficiales</span>;
}

function MotivoConflicto({ persona, onCerrar, onConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, error: null });
  async function confirmar() {
    if (motivo.trim().length < 10) {
      setEstado({ ocupado: false, error: 'Escriba el motivo (al menos 10 caracteres).' });
      return;
    }
    setEstado({ ocupado: true, error: null });
    try {
      await onConfirmar(motivo.trim());
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
    }
  }
  return (
    <Modal
      titulo="Conflicto de interés"
      bajada={`${nombrePersona(persona)} pertenece a la asociación de un equipo del partido.`}
      onCerrar={onCerrar}
      ocupado={estado.ocupado}
      ancho="480px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.ocupado}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={confirmar} disabled={estado.ocupado}>{estado.ocupado ? 'Designando…' : 'Designar igual'}</button>
        </>
      )}
    >
      <Campo etiqueta="Motivo" obligatorio ayuda="Queda registrado con la designación." error={estado.error}>
        {(a) => <textarea {...a} className="g-control" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} data-autofoco />}
      </Campo>
    </Modal>
  );
}

export default function Designaciones() {
  const [mensaje, avisar] = useMensaje();
  const [partidoId, setPartidoId] = useState(null);
  const [puesto, setPuesto] = useState(null);
  const [version, setVersion] = useState(0);
  const [buscar, setBuscar] = useState('');
  const [conflicto, setConflicto] = useState(null); // persona con conflicto de interés
  const [anular, setAnular] = useState(null); // designación a cambiar
  const [error, setError] = useState(null);

  const tipos = useCarga(() => valoresCatalogo('Tipos de oficial'), []);
  const partidosC = useCarga((signal) => partidosPorDesignar({}, { signal }), [version]);
  const respuesta = useDatosVigentes(partidosC);
  const disponiblesC = useCarga(
    (signal) => (partidoId ? disponiblesParaPartido(partidoId, { signal }) : Promise.resolve(null)),
    [partidoId, version]
  );
  const disponibles = useDatosVigentes(disponiblesC, partidoId);

  const total = respuesta?.oficiales_por_partido || 4;
  const partidos = respuesta?.data || [];
  const partido = partidos.find((m) => m.id === partidoId) || null;
  const nombrePuesto = Object.fromEntries((tipos.datos || []).map((t) => [t.code, t.value]));
  const pendientes = partidos.filter((m) => !m.completos).length;

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (disponibles?.data || []).filter((o) => !q || `${o.first_name} ${o.last_name} ${o.document_number}`.toLowerCase().includes(q));
  }, [disponibles, buscar]);

  function elegirPartido(m) {
    setPartidoId(m.id);
    setError(null);
    const libre = PUESTOS.find((c) => !m.oficiales.some((o) => o.puesto?.code === c));
    setPuesto(libre || null);
  }

  function recargar() {
    setVersion((v) => v + 1);
  }

  async function designar(persona, motivo) {
    setError(null);
    await designarOficial({ match_id: partido.id, person_id: persona.person_id, official_type_code: puesto, notes: motivo });
    avisar(`Se designó a ${nombrePersona(persona)} como ${nombrePuesto[puesto] || puesto}. Falta su confirmación.`);
    const ocupados = new Set([...partido.oficiales.map((o) => o.puesto?.code), puesto]);
    setPuesto(PUESTOS.find((c) => !ocupados.has(c)) || null);
    recargar();
  }

  async function alAnadir(persona) {
    if (!puesto) return;
    if (persona.conflicto_interes) {
      setConflicto(persona);
      return;
    }
    try {
      await designar(persona);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="g-pagina">
      {mensaje}
      <Encabezado
        titulo="Designaciones arbitrales"
        bajada={respuesta ? `Próximos 30 días · ${pendientes} ${pendientes === 1 ? 'partido por designar' : 'partidos por designar'}` : null}
      />

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta
            titulo="Partidos por designar"
            accion={respuesta && <Estado tono={pendientes ? 'aviso' : 'ok'}>{pendientes ? `${pendientes} pendientes` : 'Todos completos'}</Estado>}
          >
            {!respuesta && partidosC.estado === 'cargando' && <Cargando texto="Cargando partidos…" />}
            {partidosC.estado === 'error' && <ErrorCarga mensaje={partidosC.error.message} onReintentar={partidosC.reintentar} />}
            {respuesta && (partidos.length === 0 ? (
              <p className="g-tarjeta__vacio">No hay partidos programados en los próximos 30 días.</p>
            ) : (
              <div className="g-tabla-envoltura arb-tabla-alta">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Partidos por jugarse</caption>
                  <thead>
                    <tr><th scope="col">Partido</th><th scope="col">Fecha</th><th scope="col">Sede</th><th scope="col">Oficiales asignados</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {partidos.map((m) => (
                      <tr key={m.id} className={m.id === partidoId ? 'arb-fila-elegida' : undefined}>
                        <th scope="row">{nombrePartido(m)}<span className="g-tabla__sub">{m.competencia?.name}{m.matchday ? ` · Jornada ${m.matchday}` : ''}</span></th>
                        <td className="g-tabla__fecha">{diaYHora(m.scheduled_date, hora(m.scheduled_time))}</td>
                        <td>{m.sede?.value || 'Por confirmar'}</td>
                        <td><Oficiales n={m.oficiales.length} total={total} /></td>
                        <td className="g-tabla__accion">
                          <button
                            type="button"
                            className={`g-boton g-boton--chico${m.completos ? '' : ' g-boton--acento'}`}
                            onClick={() => elegirPartido(m)}
                            aria-pressed={m.id === partidoId}
                          >
                            {m.completos ? 'Ver' : 'Designar'}<span className="visualmente-oculto"> {nombrePartido(m)}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Tarjeta>

          {partido && (
            <Tarjeta
              titulo={nombrePartido(partido)}
              nota={`${diaYHora(partido.scheduled_date, hora(partido.scheduled_time))} · ${partido.oficiales.length} de ${total} oficiales asignados`}
              accion={<span className="arb-etiqueta">Set de designación</span>}
              pie={<span>Cada persona designada debe confirmar desde su entorno del cuerpo arbitral.</span>}
            >
              {error && <p className="g-aviso g-aviso--error arb-margen" role="alert">{error}</p>}
              <ul className="g-lista">
                {PUESTOS.map((code) => {
                  const o = partido.oficiales.find((x) => x.puesto?.code === code);
                  const rechazo = !o && partido.rechazadas.find((x) => x.puesto?.code === code);
                  const elegido = puesto === code && !o;
                  return (
                    <li key={code} className={`g-lista__fila arb-puesto${elegido ? ' arb-puesto--elegido' : ''}`}>
                      <span className={`arb-avatar${o ? '' : ' arb-avatar--vacio'}`} aria-hidden="true">{o ? iniciales(o.arbitro) : ''}</span>
                      <div className="g-lista__texto arb-puesto__texto">
                        <p className="g-lista__detalle">{nombrePuesto[code] || code}</p>
                        <p className="g-lista__titulo">{o ? nombrePersona(o.arbitro) : 'Por asignar'}</p>
                        <p className="g-lista__detalle">
                          {o ? ESTADOS_DESIGNACION[o.status]?.texto : elegido ? 'Elija una persona en «Cuerpo arbitral disponible».' : 'Seleccione una persona acreditada.'}
                          {rechazo && ` · ${nombrePersona(rechazo.arbitro)} rechazó esta designación.`}
                        </p>
                      </div>
                      <div className="g-lista__acciones">
                        {o ? (
                          <button type="button" className="g-boton g-boton--chico" onClick={() => setAnular(o)}>Cambiar<span className="visualmente-oculto"> {nombrePuesto[code]}</span></button>
                        ) : (
                          <button type="button" className={`g-boton g-boton--chico${elegido ? '' : ' g-boton--acento'}`} onClick={() => setPuesto(code)} aria-pressed={elegido}>
                            {elegido ? 'Eligiendo…' : 'Asignar'}<span className="visualmente-oculto"> {nombrePuesto[code]}</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          )}
        </div>

        <div className="g-columna">
          <Tarjeta
            titulo="Cuerpo arbitral disponible"
            nota={partido ? `${diaYHora(partido.scheduled_date, hora(partido.scheduled_time))}${puesto ? ` · para ${nombrePuesto[puesto] || puesto}` : ''}` : 'Elija un partido para ver quién puede ir.'}
          >
            {partido && (
              <div className="g-tarjeta__cuerpo arb-buscador">
                <label className="visualmente-oculto" htmlFor="disp-q">Buscar en el cuerpo arbitral</label>
                <input id="disp-q" type="search" className="g-control" placeholder="Buscar por nombre o cédula…" value={buscar} onChange={(e) => setBuscar(e.target.value)} maxLength={60} />
              </div>
            )}
            {partido && !disponibles && disponiblesC.estado === 'cargando' && <Cargando texto="Cargando…" />}
            {disponiblesC.estado === 'error' && <ErrorCarga mensaje={disponiblesC.error.message} onReintentar={disponiblesC.reintentar} />}
            {partido && disponibles && (lista.length === 0 ? (
              <p className="g-tarjeta__vacio">{disponibles.data.length ? 'Nadie coincide con la búsqueda.' : 'No hay personas en el cuerpo arbitral.'}</p>
            ) : (
              <ul className="g-lista arb-disponibles">
                {lista.map((o) => {
                  const estado = ESTADOS_ACREDITACION[o.estado];
                  // Aviso (no bloqueo) si el puesto elegido no es la función de su acreditación.
                  const avisos = puesto && o.funcion_code && o.funcion_code !== puesto
                    ? [...o.avisos, `Acreditación de ${o.funcion_value?.toLowerCase()}`]
                    : o.avisos;
                  return (
                    <li key={o.person_id} className="g-lista__fila arb-disponible">
                      <span className="arb-avatar" aria-hidden="true">{iniciales(o)}</span>
                      <div className="g-lista__texto arb-puesto__texto">
                        <p className="g-lista__titulo">{nombrePersona(o)}</p>
                        <p className="g-lista__detalle">{categoriaArbitral(o)} · {estado?.texto?.toLowerCase()}</p>
                        {o.bloqueo && <p className="arb-nota-fila arb-texto-error">{o.bloqueo}</p>}
                        {!o.bloqueo && avisos.map((t) => <p key={t} className="arb-nota-fila arb-texto-aviso">{t}</p>)}
                      </div>
                      <div className="g-lista__acciones">
                        {o.en_este_partido ? (
                          <Estado tono="info">En este partido</Estado>
                        ) : o.bloqueo ? (
                          <Estado tono="error">Bloqueado</Estado>
                        ) : (
                          <>
                            {avisos.length > 0 && <Estado tono="aviso">Revisar</Estado>}
                            <button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => alAnadir(o)} disabled={!puesto}>
                              Añadir<span className="visualmente-oculto"> a {nombrePersona(o)}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
          </Tarjeta>

          <p className="g-aviso arb-aviso-naranja">
            <span className="g-aviso__titulo">Conflicto de interés</span>
            El sistema marca a quien pertenece a la misma asociación que un equipo del partido. Se puede designar igual, dejando constancia del motivo.
          </p>
        </div>
      </div>

      {conflicto && (
        <MotivoConflicto
          persona={conflicto}
          onCerrar={() => setConflicto(null)}
          onConfirmar={async (motivo) => {
            await designar(conflicto, motivo);
            setConflicto(null);
          }}
        />
      )}

      {anular && (
        <Confirmar
          titulo="¿Cambiar a esta persona?"
          texto={`Se anula la designación de ${nombrePersona(anular.arbitro)} como ${anular.puesto?.value}. Después elija a quien la reemplaza.`}
          textoAccion="Anular designación"
          peligro
          onCerrar={() => setAnular(null)}
          onConfirmar={async () => {
            await anularDesignacion(anular.id, 'Cambio de oficial');
            setPuesto(anular.puesto?.code || null);
            setAnular(null);
            avisar('Designación anulada. Elija a quien la reemplaza.');
            recargar();
          }}
        />
      )}
    </div>
  );
}
