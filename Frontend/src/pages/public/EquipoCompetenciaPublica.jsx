import { Link, useParams } from 'react-router-dom';
import EnlaceAsociacion from '../../components/EnlaceAsociacion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import Migas from '../../components/Migas.jsx';
import useCarga from '../../hooks/useCarga.js';
import { esIdValido, obtenerEquipo } from '../../services/competencias.js';
import { diaYHora, fechaDiaMesCorto, isoValida } from '../../utils/formato.js';
import { pendiente, terminado } from './competencia/partidos.js';
import '../../styles/paneles.css';
import './CompetenciaDetallePublica.css';
import './EquipoCompetenciaPublica.css';

function EnBloque({ children }) {
  return (
    <section className="bloque detalle-competencia">
      <div className="contenedor">{children}</div>
    </section>
  );
}

function NoEncontrado({ competenciaId }) {
  return (
    <EnBloque>
      <SinResultados titulo="Equipo no encontrado" texto="El equipo no existe o no está inscrito en esta competencia.">
        <Link to={competenciaId ? `/competencias/${competenciaId}?vista=equipos` : '/competencias'} className="boton boton--primario boton--chico">
          Ver equipos inscritos
        </Link>
      </SinResultados>
    </EnBloque>
  );
}

function Panel({ titulo, nota, id, children }) {
  return (
    <section className="tarjeta-panel" aria-labelledby={id}>
      <header className="tarjeta-panel__cabecera tarjeta-panel__cabecera--apilada">
        <h2 id={id} className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">{titulo}</h2>
        {nota && <p className="tarjeta-panel__nota">{nota}</p>}
      </header>
      {children}
    </section>
  );
}

function Datos({ filas }) {
  const visibles = filas.filter(([, valor]) => valor !== null && valor !== undefined && valor !== '');
  if (!visibles.length) return null;
  return (
    <dl className="lista-datos">
      {visibles.map(([nombre, valor]) => (
        <div key={nombre} className="lista-datos__fila">
          <dt>{nombre}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Nomina({ roster, competencia }) {
  const { players, staff, source } = roster;
  const nota = source === 'competencia' ? competencia : 'La nómina de la competencia aún no se ha cargado; se muestran los integrantes activos del equipo.';

  return (
    <>
      <Panel id="titulo-nomina" titulo={source === 'competencia' ? 'Nómina inscrita' : 'Integrantes del equipo'} nota={nota}>
        {players.length === 0 ? (
          <p className="tarjeta-panel__vacio">Todavía no hay jugadores registrados.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="tabla-datos tabla-datos--izquierda">
              <caption className="visualmente-oculto">Jugadores</caption>
              <thead>
                <tr>
                  <th scope="col" className="tabla-datos__pos"><abbr title="Número">N.º</abbr></th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Posición</th>
                </tr>
              </thead>
              <tbody>
                {players.map((j, i) => (
                  <tr key={`${j.number ?? 's'}-${j.name}-${i}`}>
                    <td className="tabla-datos__pos">{j.number ?? '—'}</td>
                    <th scope="row" className="tabla-datos__nombre">{j.name}</th>
                    <td>{j.position || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {staff.length > 0 && (
        <Panel id="titulo-cuerpo" titulo="Cuerpo técnico">
          <div className="tabla-desplazable">
            <table className="tabla-datos tabla-datos--izquierda">
              <caption className="visualmente-oculto">Cuerpo técnico</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Función</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <th scope="row" className="tabla-datos__nombre">{p.name}</th>
                    <td>{p.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function UltimosResultados({ partidos, equipoId }) {
  const lista = partidos.filter(terminado).reverse().slice(0, 5);
  if (!lista.length) return null;
  return (
    <Panel id="titulo-ultimos" titulo="Últimos resultados">
      <div className="tabla-desplazable">
        <table className="tabla-datos tabla-datos--izquierda">
          <caption className="visualmente-oculto">Últimos resultados</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Partido</th>
              <th scope="col">Resultado</th>
              <th scope="col">Sets</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const conMarcador = p.home_sets !== null && p.away_sets !== null;
              const gano = conMarcador && (p.home?.id === equipoId) === (p.home_sets > p.away_sets);
              return (
                <tr key={p.id}>
                  <td><time dateTime={isoValida(p.date)}>{fechaDiaMesCorto(p.date) || '—'}</time></td>
                  <th scope="row" className="tabla-datos__nombre">{p.home?.name} vs {p.away?.name}</th>
                  <td>
                    {conMarcador ? (
                      <>
                        <span className={`marcador-equipo ${gano ? 'marcador-equipo--gano' : ''}`}>
                          {p.home_sets}-{p.away_sets}
                        </span>
                        <span className="visualmente-oculto">{gano ? ' (ganado)' : ' (perdido)'}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="tabla-datos__sets">{p.special_result || p.sets.map((s) => `${s.home}-${s.away}`).join('  ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ProximosPartidos({ partidos }) {
  const lista = partidos.filter(pendiente).slice(0, 3);
  if (!lista.length) return null;
  return (
    <Panel id="titulo-proximos" titulo="Próximos partidos">
      <ul className="proximos-equipo">
        {lista.map((p) => (
          <li key={p.id}>
            <p className="proximos-equipo__cuando">{diaYHora(p.date, p.time)}</p>
            <p className="proximos-equipo__duelo">{p.home?.name || 'Por definir'} vs {p.away?.name || 'Por definir'}</p>
            <p className="proximos-equipo__lugar">{[p.venue, p.matchday ? `Jornada ${p.matchday}` : null].filter(Boolean).join(' · ')}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function EquipoCompetenciaPublica() {
  const { id, equipoId } = useParams();
  const validos = esIdValido(id) && esIdValido(equipoId);

  const carga = useCarga(
    (signal) => (validos ? obtenerEquipo(id, equipoId, { signal }) : Promise.resolve(null)),
    [id, equipoId, validos]
  );

  if (!validos) return <NoEncontrado competenciaId={esIdValido(id) ? id : null} />;
  if (carga.estado === 'error' && carga.error.status === 404) return <NoEncontrado competenciaId={id} />;
  if (carga.estado !== 'listo') {
    return (
      <EnBloque>
        {carga.estado === 'cargando' ? (
          <Cargando texto="Cargando equipo…" />
        ) : (
          <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />
        )}
      </EnBloque>
    );
  }

  const { competition, team, standing, roster, matches } = carga.datos;
  const categoria = [team.category, team.branch].filter(Boolean).join(' · ');
  const asociacion = team.association?.name
    ? <EnlaceAsociacion asociacion={team.association} className="enlace-flecha" />
    : null;

  return (
    <>
      <header className="cabecera-competencia cabecera-competencia--equipo">
        <div className="contenedor">
          <Migas
            items={[
              { texto: 'Inicio', to: '/' },
              { texto: 'Competencias', to: '/competencias' },
              { texto: competition.name, to: `/competencias/${competition.id}?vista=equipos` },
              { texto: team.name }
            ]}
          />
          <h1 className="cabecera-competencia__titulo">{team.name}</h1>
          {(team.association || team.province) && (
            <p className="cabecera-competencia__bajada">
              {[team.association?.name, team.province].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="cabecera-competencia__pastillas">
            {team.modality && <span className="pastilla pastilla--oscura">{team.modality}</span>}
            {categoria && <span className="pastilla pastilla--oscura">{categoria}</span>}
            {standing?.played > 0 && (
              <span className="pastilla pastilla--oscura-ok">{standing.position}.º en la tabla</span>
            )}
          </p>
        </div>
      </header>

      <section className="bloque detalle-competencia">
        <div className="contenedor rejilla-lateral">
          <div className="rejilla-lateral__principal">
            <Nomina roster={roster} competencia={competition.name} />
            <UltimosResultados partidos={matches} equipoId={team.id} />
          </div>
          <div className="rejilla-lateral__aparte">
            <Panel id="titulo-datos-equipo" titulo="Datos del equipo">
              <Datos
                filas={[
                  ['Asociación', asociacion],
                  ['Provincia', team.province],
                  ['Sede local', team.home_venue],
                  ['Categoría', categoria || null]
                ]}
              />
            </Panel>
            {standing && (
              <Panel id="titulo-en-competencia" titulo="En la competencia">
                <Datos
                  filas={[
                    ['Posición', `${standing.position}.º de ${standing.of}`],
                    ['Partidos', `${standing.won} ganados · ${standing.lost} perdidos`],
                    ['Puntos', standing.points],
                    ['Sets', `${standing.sets_won} ganados · ${standing.sets_lost} perdidos`]
                  ]}
                />
              </Panel>
            )}
            <ProximosPartidos partidos={matches} />
          </div>
        </div>
      </section>
    </>
  );
}
