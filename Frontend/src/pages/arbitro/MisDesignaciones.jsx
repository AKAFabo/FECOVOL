// Mis designaciones (Figma 05 · Mis designaciones, escritorio y teléfono): partidos asignados a la
// persona de la sesión, con confirmar o rechazar mientras la designación está por confirmar.
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Cifras, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import useDatosVigentes from '../../hooks/useDatosVigentes.js';
import {
  categoriaArbitral, ESTADOS_ACTA, ESTADOS_DESIGNACION, fechaNumerica, hora, misDesignaciones, MODALIDADES_ARBITRAJE,
  nombrePartido, responderDesignacion
} from '../../services/arbitraje.js';
import { diaYHora, fechaCorta } from '../../utils/formato.js';
import '../../styles/arbitraje.css';

function cuando(d, hoy) {
  const p = d.partido;
  return p.scheduled_date === hoy ? `Hoy · ${hora(p.scheduled_time)}` : diaYHora(p.scheduled_date, hora(p.scheduled_time));
}

function EstadoDesignacion({ d, hoy }) {
  if (d.partido.scheduled_date === hoy && d.status === 'CONFIRMADA') return <Estado tono="error">Hoy</Estado>;
  const e = ESTADOS_DESIGNACION[d.status] || ESTADOS_DESIGNACION.PROPUESTA;
  return <Estado tono={e.tono}>{e.texto}</Estado>;
}

function Acciones({ d, onConfirmar, onRechazar, ocupado }) {
  if (!d.puede_responder) return null;
  return (
    <div className="arb-acciones-fila">
      <button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => onConfirmar(d)} disabled={ocupado}>
        Confirmar<span className="visualmente-oculto"> {nombrePartido(d.partido)}</span>
      </button>
      <button type="button" className="g-boton g-boton--chico" onClick={() => onRechazar(d)} disabled={ocupado}>
        Rechazar<span className="visualmente-oculto"> {nombrePartido(d.partido)}</span>
      </button>
    </div>
  );
}

function Rechazar({ designacion, onCerrar, onRechazada }) {
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, error: null });
  async function enviar() {
    if (motivo.trim().length < 10) {
      setEstado({ ocupado: false, error: 'Cuente brevemente el motivo (al menos 10 caracteres).' });
      return;
    }
    setEstado({ ocupado: true, error: null });
    try {
      await responderDesignacion(designacion.id, 'RECHAZADA', motivo.trim());
      onRechazada();
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
    }
  }
  return (
    <Modal
      titulo="Rechazar designación"
      bajada={`${nombrePartido(designacion.partido)} · ${diaYHora(designacion.partido.scheduled_date, hora(designacion.partido.scheduled_time))}`}
      onCerrar={onCerrar}
      ocupado={estado.ocupado}
      ancho="480px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.ocupado}>Cancelar</button>
          <button type="button" className="g-boton g-boton--peligro" onClick={enviar} disabled={estado.ocupado}>{estado.ocupado ? 'Enviando…' : 'Rechazar'}</button>
        </>
      )}
    >
      <Campo etiqueta="Motivo" obligatorio ayuda="FECOVOL lo verá para designar a otra persona." error={estado.error}>
        {(a) => <textarea {...a} className="g-control" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} data-autofoco />}
      </Campo>
    </Modal>
  );
}

export default function MisDesignaciones() {
  const { ficha } = useOutletContext();
  const lista = useCarga((signal) => misDesignaciones({ signal }), []);
  const [mensaje, avisar] = useMensaje();
  const [rechazar, setRechazar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  async function confirmar(d) {
    setOcupado(true);
    setError(null);
    try {
      await responderDesignacion(d.id, 'CONFIRMADA');
      avisar(`Confirmó ${nombrePartido(d.partido)}.`);
      lista.reintentar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }

  const respuesta = useDatosVigentes(lista);
  if (lista.estado === 'error') return <ErrorCarga mensaje={lista.error.message} onReintentar={lista.reintentar} />;
  if (!respuesta) return <Cargando texto="Cargando sus designaciones…" />;

  const { data, hoy } = respuesta;
  const proximas = data.filter((d) => d.partido.scheduled_date >= hoy && ['PROPUESTA', 'CONFIRMADA'].includes(d.status));
  const porConfirmar = proximas.filter((d) => d.status === 'PROPUESTA');
  const deHoy = proximas.find((d) => d.partido.scheduled_date === hoy && d.status === 'CONFIRMADA');
  const recientes = data.filter((d) => d.partido.scheduled_date < hoy || d.status === 'RECHAZADA').reverse();
  const a = ficha?.acreditacion;
  const vigente = a && a.valid_until >= hoy;

  const finSemana = new Date(`${hoy}T00:00:00Z`);
  finSemana.setUTCDate(finSemana.getUTCDate() + 6);
  const semana = proximas.filter((d) => d.partido.scheduled_date <= finSemana.toISOString().slice(0, 10)).length;

  return (
    <div className="g-pagina">
      {mensaje}
      <Encabezado titulo="Mis designaciones" bajada={`${semana} ${semana === 1 ? 'partido' : 'partidos'} en los próximos 7 días`} />

      <Cifras
        items={[
          { valor: proximas.length, texto: 'Designaciones próximas' },
          { valor: porConfirmar.length, texto: 'Por confirmar', tono: porConfirmar.length ? 'aviso' : undefined },
          { valor: ficha?.temporada?.partidos ?? 0, texto: 'Partidos esta temporada' },
          { valor: a ? fechaNumerica(a.valid_until) : '—', texto: a ? (vigente ? 'Acreditación vigente' : 'Acreditación vencida') : 'Sin acreditación', tono: vigente ? 'ok' : 'error' }
        ]}
      />

      {error && <p className="g-aviso g-aviso--error" role="alert">{error}</p>}
      {porConfirmar.length > 0 && (
        <p className="g-aviso arb-aviso-naranja">
          <span className="g-aviso__titulo">{porConfirmar.length === 1 ? 'Una designación por confirmar' : `${porConfirmar.length} designaciones por confirmar`}</span>
          {porConfirmar.length === 1 ? 'Confírmela o rechácela' : 'Confírmelas o rechácelas'} para que FECOVOL sepa con quién cuenta.
        </p>
      )}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Próximas designaciones">
            {proximas.length === 0 ? (
              <p className="g-tarjeta__vacio">No tiene partidos asignados por ahora.</p>
            ) : (
              <>
                <div className="g-tabla-envoltura arb-solo-escritorio">
                  <table className="g-tabla">
                    <caption className="visualmente-oculto">Próximas designaciones</caption>
                    <thead>
                      <tr><th scope="col">Fecha</th><th scope="col">Partido</th><th scope="col">Sede</th><th scope="col">Su rol</th><th scope="col">Estado</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr>
                    </thead>
                    <tbody>
                      {proximas.map((d) => (
                        <tr key={d.id}>
                          <td className="g-tabla__fecha arb-fecha-destacada">{cuando(d, hoy)}</td>
                          <th scope="row">{nombrePartido(d.partido)}<span className="g-tabla__sub">{d.partido.competencia?.name}</span></th>
                          <td>{d.partido.sede?.value || 'Por confirmar'}</td>
                          <td>{d.puesto?.value}</td>
                          <td><EstadoDesignacion d={d} hoy={hoy} /></td>
                          <td className="g-tabla__accion"><Acciones d={d} onConfirmar={confirmar} onRechazar={setRechazar} ocupado={ocupado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="g-lista arb-solo-movil">
                  {proximas.map((d) => (
                    <li key={d.id} className="arb-tarjeta-partido">
                      <div className="arb-tarjeta-partido__cabeza">
                        <span className="arb-fecha-destacada">{cuando(d, hoy)}</span>
                        <EstadoDesignacion d={d} hoy={hoy} />
                      </div>
                      <p className="arb-tarjeta-partido__titulo">{nombrePartido(d.partido)}</p>
                      <p className="g-lista__detalle">{[d.partido.competencia?.name, d.partido.matchday ? `Jornada ${d.partido.matchday}` : null].filter(Boolean).join(' · ')}</p>
                      <p className="g-lista__detalle">{d.partido.sede?.value || 'Sede por confirmar'} · Rol: {d.puesto?.value?.toLowerCase()}</p>
                      <Acciones d={d} onConfirmar={confirmar} onRechazar={setRechazar} ocupado={ocupado} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Tarjeta>

          {recientes.length > 0 && (
            <Tarjeta titulo="Recientes" nota="Últimos cuatro meses">
              <ul className="g-lista">
                {recientes.map((d) => {
                  const acta = d.status === 'RECHAZADA' ? ESTADOS_DESIGNACION.RECHAZADA : ESTADOS_ACTA[d.partido.acta_status];
                  return (
                    <li key={d.id} className="g-lista__fila">
                      <div className="g-lista__texto">
                        <p className="g-lista__titulo">{nombrePartido(d.partido)}</p>
                        <p className="g-lista__detalle">{fechaCorta(d.partido.scheduled_date)} · {d.puesto?.value}</p>
                      </div>
                      {acta && <Estado tono={acta.tono}>{acta.texto}</Estado>}
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          )}
        </div>

        <div className="g-columna">
          {deHoy && (
            <section className="g-tarjeta arb-tarjeta-hoy" aria-labelledby="partido-hoy">
              <div className="g-tarjeta__cabecera">
                <h2 id="partido-hoy" className="g-tarjeta__titulo">Partido de hoy</h2>
                <Estado tono="error">{hora(deHoy.partido.scheduled_time)}</Estado>
              </div>
              <div className="g-tarjeta__cuerpo">
                <p className="arb-tarjeta-partido__titulo">{nombrePartido(deHoy.partido)}</p>
                <p className="g-lista__detalle">{[deHoy.partido.sede?.value, deHoy.partido.competencia?.name, deHoy.partido.matchday ? `jornada ${deHoy.partido.matchday}` : null].filter(Boolean).join(' · ')}</p>
                <p className="g-lista__detalle">Su rol: {deHoy.puesto?.value?.toLowerCase()}</p>
              </div>
            </section>
          )}

          <Tarjeta titulo="Su acreditación" pie={<Link to="/arbitro/mi-ficha" className="g-enlace">Ver mi ficha</Link>}>
            {a ? (
              <dl className="g-datos">
                <div className="g-datos__fila"><dt>Categoría</dt><dd>{categoriaArbitral(a)}</dd></div>
                <div className="g-datos__fila"><dt>Modalidad</dt><dd>{MODALIDADES_ARBITRAJE[a.modality] || a.modality}</dd></div>
                <div className="g-datos__fila"><dt>Vigencia</dt><dd>Hasta el {fechaNumerica(a.valid_until)}</dd></div>
              </dl>
            ) : (
              <p className="g-tarjeta__vacio">No tiene una acreditación activa. Comuníquese con FECOVOL.</p>
            )}
          </Tarjeta>
        </div>
      </div>

      {rechazar && (
        <Rechazar
          designacion={rechazar}
          onCerrar={() => setRechazar(null)}
          onRechazada={() => {
            setRechazar(null);
            avisar('Designación rechazada. FECOVOL designará a otra persona.');
            lista.reintentar();
          }}
        />
      )}
    </div>
  );
}
