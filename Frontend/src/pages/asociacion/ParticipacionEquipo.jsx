// Un equipo de la asociación en una competencia (RF-ASO-007): calendario con resultados oficiales,
// tabla de posiciones y la nómina con la que participa (solo lectura).
import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  ESTADOS_COMPETENCIA, ESTADOS_INSCRIPCION, fechaHoraCR, nombreEquipo, participacionEquipo, textoPosicion, textoResultado, textoSets, tonoResultado
} from '../../services/participacion.js';
import { esId } from '../../services/representante.js';
import { diaYHora } from '../../utils/formato.js';
import { RUTA, useAsociacion } from './contexto.js';
import '../../styles/participacion.css';

const ROLES = { JUGADOR: 'Jugador', TECNICO: 'Cuerpo técnico', DELEGADO: 'Delegado' };

function Resultado({ p }) {
  const tono = tonoResultado(p);
  const texto = textoResultado(p);
  return (
    <>
      {tono ? <Estado tono={tono}>{texto}</Estado> : <span>{texto}</span>}
      {p.result?.sets?.length > 0 && <span className="g-tabla__sub">{textoSets(p)}</span>}
      {p.pending_validation && <span className="g-tabla__sub">Jugado; el resultado aún no es oficial</span>}
    </>
  );
}

export default function ParticipacionEquipo() {
  const { competenciaId, equipoId } = useParams();
  const valido = esId(competenciaId) && esId(equipoId);
  const carga = useCarga(
    (signal) => (valido ? participacionEquipo(competenciaId, equipoId, { signal }) : Promise.reject(new Error('El enlace no es válido.'))),
    [competenciaId, equipoId]
  );
  const d = carga.datos;
  useAsociacion([
    { texto: 'Inscripciones', to: RUTA.inscripciones },
    { texto: d ? `${nombreEquipo(d.team)} · ${d.competition.name}` : 'Participación' }
  ]);

  if (carga.estado === 'cargando') return <Cargando texto="Cargando la participación…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={valido ? carga.reintentar : undefined} />;

  const insc = ESTADOS_INSCRIPCION[d.inscription.status] || { texto: d.inscription.status, tono: 'neutro' };
  const propia = d.standings.find((f) => f.own);
  const jugadores = d.roster.filter((r) => r.role === 'JUGADOR');
  const otros = d.roster.filter((r) => r.role !== 'JUGADOR');
  const inscrito = d.inscription.status === 'INSCRITO';

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={`${nombreEquipo(d.team)} · ${d.competition.name}`}
        bajada={[d.competition.category, d.competition.branch, d.competition.modality, d.competition.season && `Temporada ${d.competition.season}`].filter(Boolean).join(' · ')}
        acciones={<Link to={RUTA.inscripciones} className="g-boton">Volver a inscripciones</Link>}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono={insc.tono}>{insc.texto}</Estado>
          {ESTADOS_COMPETENCIA[d.competition.status] && <Estado tono="neutro">{ESTADOS_COMPETENCIA[d.competition.status]}</Estado>}
          {propia && <Estado tono="info">{textoPosicion({ ...propia, teams: d.standings.length })} · {propia.points} pts</Estado>}
        </div>
      </Encabezado>

      {d.inscription.notes && !inscrito && (
        <p className="g-aviso g-aviso--error"><span className="g-aviso__titulo">Observaciones de FECOVOL</span>{d.inscription.notes}</p>
      )}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Calendario y resultados" nota="Solo se muestran los resultados oficiales ya validados.">
            {!inscrito ? (
              <p className="g-tarjeta__vacio">El calendario se muestra cuando la inscripción queda aprobada.</p>
            ) : d.matches.length === 0 ? (
              <p className="g-tarjeta__vacio">La competencia todavía no tiene partidos programados para este equipo.</p>
            ) : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Partidos del equipo</caption>
                  <thead>
                    <tr><th scope="col">Jornada</th><th scope="col">Fecha</th><th scope="col">Rival</th><th scope="col">Condición</th><th scope="col">Sede</th><th scope="col">Resultado</th></tr>
                  </thead>
                  <tbody>
                    {d.matches.map((p) => (
                      <tr key={p.id}>
                        <td>{p.matchday || '—'}</td>
                        <td className="g-tabla__fecha">{diaYHora(p.date, p.time)}</td>
                        <th scope="row">{nombreEquipo(p.rival)}</th>
                        <td><Estado tono={p.condition === 'LOCAL' ? 'ok' : 'neutro'}>{p.condition === 'LOCAL' ? 'Local' : 'Visita'}</Estado></td>
                        <td>{p.venue || 'Por confirmar'}</td>
                        <td><Resultado p={p} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          {inscrito && (
            <Tarjeta titulo="Tabla de posiciones">
              {d.standings.length === 0 ? (
                <p className="g-tarjeta__vacio">Aún no hay tabla de posiciones.</p>
              ) : (
                <div className="g-tabla-envoltura">
                  <table className="g-tabla">
                    <caption className="visualmente-oculto">Tabla de posiciones de {d.competition.name}</caption>
                    <thead>
                      <tr><th scope="col">Pos.</th><th scope="col">Equipo</th><th scope="col">PJ</th><th scope="col">PG</th><th scope="col">PP</th><th scope="col">Sets</th><th scope="col">Pts</th></tr>
                    </thead>
                    <tbody>
                      {d.standings.map((f) => (
                        <tr key={f.team.id} className={f.own ? 'part-fila-propia' : undefined} aria-current={f.own ? 'true' : undefined}>
                          <td>{f.position}</td>
                          <th scope="row">{f.team.short_name || f.team.name}{f.own && <span className="visualmente-oculto"> (su equipo)</span>}</th>
                          <td>{f.played}</td>
                          <td>{f.won}</td>
                          <td>{f.lost}</td>
                          <td>{f.sets_won}-{f.sets_lost}</td>
                          <td><strong>{f.points}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          )}
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Nómina inscrita" nota="Solo lectura. Los cambios se solicitan a FECOVOL.">
            {d.roster.length === 0 ? (
              <p className="g-tarjeta__vacio">La competencia todavía no tiene nómina cargada para este equipo.</p>
            ) : (
              <ul className="g-lista">
                {[...jugadores, ...otros].map((r, i) => (
                  <li key={`${r.name}-${i}`} className="g-lista__fila">
                    <div className="g-lista__texto part-integrante">
                      <span className="part-numero" aria-hidden={r.number ? undefined : 'true'}>{r.number ?? ''}</span>
                      <div>
                        <p className="g-lista__titulo">{r.name}</p>
                        <p className="g-lista__detalle">{ROLES[r.role] || r.role}{r.number ? ` · número ${r.number}` : ''}</p>
                      </div>
                    </div>
                    {!r.habilitated && <Estado tono="error">No habilitado</Estado>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Última actualización</span>
            {d.actualizado ? `La información de esta competencia cambió por última vez el ${fechaHoraCR(d.actualizado)}.` : 'Sin cambios registrados.'}
          </p>
        </div>
      </div>
    </div>
  );
}
