import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  esIdValido,
  estadoCompetencia,
  estadoPartido,
  obtenerCompetencia,
  obtenerPartidos,
  obtenerPosiciones
} from '../../services/competencias.js';
import { fechaConDia, isoValida, rangoFechas } from '../../utils/formato.js';
import './CompetenciaDetallePublica.css';

// Pestañas de la página. La activa viaja en la URL (?vista=calendario) para poder compartirla.
const VISTAS = [
  { valor: 'posiciones', texto: 'Posiciones' },
  { valor: 'calendario', texto: 'Calendario' },
  { valor: 'resultados', texto: 'Resultados' }
];

/* ----------------------------------------------------------------------------------------------
   Pestañas accesibles (patrón WAI-ARIA "tabs"): flechas izquierda/derecha, Inicio y Fin.
   ---------------------------------------------------------------------------------------------- */
function Pestanas({ activa, onCambiar }) {
  const refs = useRef([]);

  function alTeclear(evento, indice) {
    const ultimo = VISTAS.length - 1;
    const destino = {
      ArrowRight: indice === ultimo ? 0 : indice + 1,
      ArrowLeft: indice === 0 ? ultimo : indice - 1,
      Home: 0,
      End: ultimo
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    onCambiar(VISTAS[destino].valor);
    refs.current[destino]?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label="Información de la competencia">
      {VISTAS.map((v, i) => {
        const seleccionada = v.valor === activa;
        return (
          <button
            key={v.valor}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`pestana-${v.valor}`}
            aria-selected={seleccionada}
            aria-controls={`panel-${v.valor}`}
            tabIndex={seleccionada ? 0 : -1}
            className={`pestana${seleccionada ? ' pestana--activa' : ''}`}
            onClick={() => onCambiar(v.valor)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {v.texto}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------
   Tabla de posiciones
   ---------------------------------------------------------------------------------------------- */
const COLUMNAS = [
  { clave: 'played', corto: 'PJ', largo: 'Partidos jugados' },
  { clave: 'won', corto: 'PG', largo: 'Partidos ganados' },
  { clave: 'lost', corto: 'PP', largo: 'Partidos perdidos' },
  { clave: 'sets_won', corto: 'SG', largo: 'Sets ganados', extra: true },
  { clave: 'sets_lost', corto: 'SP', largo: 'Sets perdidos', extra: true }
];

function TablaPosiciones({ filas }) {
  if (filas.length === 0) {
    return <SinResultados titulo="Aún no hay equipos inscritos" texto="La tabla aparecerá cuando se confirmen los equipos." />;
  }

  const sinPartidos = filas.every((f) => f.played === 0);

  return (
    <>
      <div className="tabla-posiciones__marco">
        <table className="tabla-posiciones">
          <caption className="visualmente-oculto">Tabla de posiciones</caption>
          <thead>
            <tr>
              <th scope="col" className="tabla-posiciones__pos">
                <abbr title="Posición">#</abbr>
              </th>
              <th scope="col" className="tabla-posiciones__equipo">Equipo</th>
              {COLUMNAS.map((c) => (
                <th key={c.clave} scope="col" className={c.extra ? 'tabla-posiciones__extra' : undefined}>
                  <abbr title={c.largo}>{c.corto}</abbr>
                </th>
              ))}
              <th scope="col" className="tabla-posiciones__puntos">
                <abbr title="Puntos">Pts</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.team.id}>
                <td className="tabla-posiciones__pos">{f.position}</td>
                <th scope="row" className="tabla-posiciones__equipo">{f.team.name}</th>
                {COLUMNAS.map((c) => (
                  <td key={c.clave} className={c.extra ? 'tabla-posiciones__extra' : undefined}>{f[c.clave]}</td>
                ))}
                <td className="tabla-posiciones__puntos">{f.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota-tabla">
        {sinPartidos
          ? 'Todavía no se ha jugado ningún partido de esta competencia.'
          : 'PJ: partidos jugados · PG: ganados · PP: perdidos · SG: sets ganados · SP: sets perdidos. Solo cuentan los partidos finalizados.'}
      </p>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------
   Partidos
   ---------------------------------------------------------------------------------------------- */
function Partido({ partido, conSets = false }) {
  const estado = estadoPartido(partido.status);
  const terminado = partido.status === 'FINALIZADO';
  const ganaLocal = terminado && partido.home_sets > partido.away_sets;
  const ganaVisita = terminado && partido.away_sets > partido.home_sets;
  const local = partido.home?.name || 'Por definir';
  const visita = partido.away?.name || 'Por definir';

  return (
    <li className="partido-fila">
      <div className="partido-fila__cuando">
        <time dateTime={isoValida(partido.date)}>{fechaConDia(partido.date)}</time>
        {partido.time && !terminado && <span>{partido.time}</span>}
      </div>

      <div className="partido-fila__duelo">
        <span className={`partido-fila__equipo partido-fila__equipo--local${ganaLocal ? ' partido-fila__equipo--ganador' : ''}`}>
          {local}
        </span>
        <span className="partido-fila__marcador">
          {terminado ? (
            <>
              <span className="visualmente-oculto">Resultado: {local} {partido.home_sets}, {visita} {partido.away_sets}</span>
              <span aria-hidden="true">{partido.home_sets} – {partido.away_sets}</span>
            </>
          ) : (
            <span className="partido-fila__vs">vs</span>
          )}
        </span>
        <span className={`partido-fila__equipo${ganaVisita ? ' partido-fila__equipo--ganador' : ''}`}>{visita}</span>
      </div>

      <div className="partido-fila__extra">
        <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>
        {partido.venue && <span className="partido-fila__sede">{partido.venue}</span>}
      </div>

      {conSets && partido.sets.length > 0 && (
        <ol className="partido-fila__sets" aria-label="Puntos por set">
          {partido.sets.map((s) => (
            <li key={s.number}>
              <span className="partido-fila__set-numero">Set {s.number}</span> {s.home}–{s.away}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function Calendario({ partidos }) {
  if (partidos.length === 0) {
    return <SinResultados titulo="El calendario aún no está publicado" texto="Los partidos aparecerán aquí cuando se programen." />;
  }

  const jornadas = new Map();
  for (const p of partidos) {
    if (!jornadas.has(p.matchday)) jornadas.set(p.matchday, []);
    jornadas.get(p.matchday).push(p);
  }

  return (
    <div className="jornadas">
      {[...jornadas.entries()]
        .sort(([a], [b]) => a - b)
        .map(([numero, lista]) => (
          <section key={numero} className="jornada" aria-labelledby={`jornada-${numero}`}>
            <h3 id={`jornada-${numero}`} className="jornada__titulo">Jornada {numero}</h3>
            <ul className="jornada__partidos">
              {lista.map((p) => (
                <Partido key={p.id} partido={p} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function Resultados({ partidos }) {
  const terminados = partidos
    .filter((p) => p.status === 'FINALIZADO')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.number - a.number);

  if (terminados.length === 0) {
    return <SinResultados titulo="Aún no hay resultados" texto="Los marcadores se publican cuando el partido termina." />;
  }

  return (
    <ul className="jornada__partidos jornada__partidos--suelta">
      {terminados.map((p) => (
        <Partido key={p.id} partido={p} conSets />
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------------------------------
   Página
   ---------------------------------------------------------------------------------------------- */
function NoEncontrada() {
  return (
    <section className="bloque detalle-competencia">
      <div className="contenedor">
        <SinResultados
          titulo="Competencia no encontrada"
          texto="La competencia que busca no existe o todavía no está publicada."
        >
          <Link to="/competencias" className="boton boton--primario boton--chico">Ver competencias</Link>
        </SinResultados>
      </div>
    </section>
  );
}

function Contenido({ id, vista }) {
  const datos = useCarga(
    (signal) => Promise.all([obtenerPosiciones(id, { signal }), obtenerPartidos(id, { signal })]),
    [id]
  );

  if (datos.estado === 'cargando') return <Cargando texto="Cargando información de la competencia…" />;
  if (datos.estado === 'error') return <ErrorCarga mensaje={datos.error.message} onReintentar={datos.reintentar} />;

  const [posiciones, partidos] = datos.datos;
  if (vista === 'calendario') return <Calendario partidos={partidos} />;
  if (vista === 'resultados') return <Resultados partidos={partidos} />;
  return <TablaPosiciones filas={posiciones} />;
}

export default function CompetenciaDetallePublica() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const pedida = params.get('vista');
  const vista = VISTAS.some((v) => v.valor === pedida) ? pedida : 'posiciones';
  const idValido = esIdValido(id);

  const competencia = useCarga(
    (signal) => (idValido ? obtenerCompetencia(id, { signal }) : Promise.resolve(null)),
    [id, idValido]
  );

  function cambiarVista(valor) {
    const siguiente = new URLSearchParams(params);
    if (valor === 'posiciones') siguiente.delete('vista');
    else siguiente.set('vista', valor);
    setParams(siguiente, { replace: true });
  }

  if (!idValido) return <NoEncontrada />;
  if (competencia.estado === 'error' && competencia.error.status === 404) return <NoEncontrada />;

  if (competencia.estado !== 'listo') {
    return (
      <section className="bloque detalle-competencia">
        <div className="contenedor">
          {competencia.estado === 'cargando' ? (
            <Cargando texto="Cargando competencia…" />
          ) : (
            <ErrorCarga mensaje={competencia.error.message} onReintentar={competencia.reintentar} />
          )}
        </div>
      </section>
    );
  }

  const c = competencia.datos;
  const estado = estadoCompetencia(c.status);
  const detalle = [c.category, c.branch, c.modality].filter(Boolean).join(' · ');

  return (
    <>
      <CabeceraSeccion
        titulo={c.name}
        antes={
          <nav aria-label="Ruta de navegación" className="migas">
            <Link to="/competencias">Competencias</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{c.name}</span>
          </nav>
        }
      >
        <div className="detalle-competencia__meta">
          <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>
          {detalle && <span>{detalle}</span>}
          <time dateTime={isoValida(c.start_date)}>{rangoFechas(c.start_date, c.end_date)}</time>
        </div>
      </CabeceraSeccion>

      <section className="bloque detalle-competencia" aria-label="Posiciones, calendario y resultados">
        <div className="contenedor">
          <Pestanas activa={vista} onCambiar={cambiarVista} />
          <div
            className="panel"
            role="tabpanel"
            id={`panel-${vista}`}
            aria-labelledby={`pestana-${vista}`}
            tabIndex={0}
          >
            <Contenido id={id} vista={vista} />
          </div>
        </div>
      </section>
    </>
  );
}
