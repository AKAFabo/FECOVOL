import { Link } from 'react-router-dom';
import EscudoEquipo from '../../../components/EscudoEquipo.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { listarEquipos, obtenerPartidos, obtenerPosiciones } from '../../../services/competencias.js';
import { diaYHora, fechasJornada, rangoFechas } from '../../../utils/formato.js';
import TarjetaResultado from './TarjetaResultado.jsx';
import { cociente, proximaJornada, ultimaJornadaJugada } from './partidos.js';

const COLUMNAS = [
  { clave: 'played', corto: 'PJ', largo: 'Partidos jugados' },
  { clave: 'won', corto: 'G', largo: 'Partidos ganados' },
  { clave: 'lost', corto: 'P', largo: 'Partidos perdidos' },
  { clave: 'sets_won', corto: 'SG', largo: 'Sets ganados', extra: true },
  { clave: 'sets_lost', corto: 'SP', largo: 'Sets perdidos', extra: true }
];

function TablaPosiciones({ competenciaId, filas }) {
  if (filas.length === 0) {
    return <SinResultados titulo="Aún no hay equipos inscritos" texto="La tabla aparecerá cuando se confirmen los equipos." />;
  }
  const sinPartidos = filas.every((f) => f.played === 0);

  return (
    <section className="tarjeta-panel" aria-labelledby="titulo-tabla">
      <header className="tarjeta-panel__cabecera">
        <h2 id="titulo-tabla" className="tarjeta-panel__titulo">Tabla de posiciones</h2>
        <p className="tarjeta-panel__nota" aria-hidden="true">PJ partidos jugados · SG/SP sets · PTS puntos</p>
      </header>
      <div className="tabla-desplazable">
        <table className="tabla-datos tabla-datos--posiciones">
          <caption className="visualmente-oculto">Tabla de posiciones</caption>
          <thead>
            <tr>
              <th scope="col" className="tabla-datos__pos"><abbr title="Posición">#</abbr></th>
              <th scope="col" className="tabla-datos__equipo">Equipo</th>
              {COLUMNAS.map((c) => (
                <th key={c.clave} scope="col" className={c.extra ? 'tabla-datos__extra' : undefined}>
                  <abbr title={c.largo}>{c.corto}</abbr>
                </th>
              ))}
              <th scope="col" className="tabla-datos__extra"><abbr title="Sets ganados entre sets perdidos">Ratio</abbr></th>
              <th scope="col"><abbr title="Puntos">PTS</abbr></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.team.id}>
                <td className="tabla-datos__pos">{f.position}</td>
                <th scope="row" className="tabla-datos__equipo">
                  <Link to={`/competencias/${competenciaId}/equipos/${f.team.id}`} className="enlace-equipo">
                    <EscudoEquipo equipo={f.team} tamano="s" />
                    {f.team.name}
                  </Link>
                </th>
                {COLUMNAS.map((c) => (
                  <td key={c.clave} className={c.extra ? 'tabla-datos__extra' : undefined}>{f[c.clave]}</td>
                ))}
                <td className="tabla-datos__extra">{cociente(f.sets_lost ? f.sets_won / f.sets_lost : null)}</td>
                <td className="tabla-datos__fuerte">{f.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tarjeta-panel__pie">
        {sinPartidos
          ? 'Todavía no se ha jugado ningún partido de esta competencia.'
          : 'Solo cuentan los partidos finalizados. Los criterios de puntuación y desempate los define FECOVOL para cada competencia.'}
      </p>
    </section>
  );
}

function ProximaJornada({ jornada, onVerCalendario }) {
  const fechas = fechasJornada(jornada.partidos.map((p) => p.date));
  const visibles = jornada.partidos.slice(0, 4);
  return (
    <section className="tarjeta-panel" aria-labelledby="titulo-proxima">
      <header className="tarjeta-panel__cabecera tarjeta-panel__cabecera--apilada">
        <h2 id="titulo-proxima" className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">Jornada {jornada.numero}</h2>
        {fechas && <p className="tarjeta-panel__nota">{fechas}</p>}
      </header>
      <ul className="lista-proximos">
        {visibles.map((p) => (
          <li key={p.id} className="lista-proximos__item">
            <div>
              <p className="lista-proximos__duelo">
                {p.home?.name || 'Por definir'} <span aria-hidden="true">·</span>
                <span className="visualmente-oculto"> contra </span> {p.away?.name || 'Por definir'}
              </p>
              {p.venue && <p className="lista-proximos__sede">{p.venue}</p>}
            </div>
            <p className="lista-proximos__hora">{diaYHora(p.date, p.time)}</p>
          </li>
        ))}
      </ul>
      <div className="tarjeta-panel__accion">
        <button type="button" className="enlace-flecha boton-enlace" onClick={onVerCalendario}>
          {jornada.partidos.length > visibles.length ? 'Ver la jornada completa' : 'Ver todas las jornadas'}
        </button>
      </div>
    </section>
  );
}

function DatosCompetencia({ competencia: c, partidos, equipos }) {
  const sedes = new Set(partidos.map((p) => p.venue).filter(Boolean)).size;
  const asociaciones = new Set((equipos || []).map((e) => e.association?.name).filter(Boolean)).size;
  const filas = [
    ['Partidos jugados', c.matches_total ? `${c.matches_played} de ${c.matches_total}` : null],
    ['Fechas', rangoFechas(c.start_date, c.end_date)],
    ['Sedes', sedes || null],
    ['Asociaciones representadas', asociaciones || null]
  ].filter(([, valor]) => valor !== null);

  return (
    <section className="tarjeta-panel" aria-labelledby="titulo-datos">
      <header className="tarjeta-panel__cabecera">
        <h2 id="titulo-datos" className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">Datos de la competencia</h2>
      </header>
      <dl className="lista-datos">
        {filas.map(([nombre, valor]) => (
          <div key={nombre} className="lista-datos__fila">
            <dt>{nombre}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function PestanaPosiciones({ competencia, onCambiarVista }) {
  const id = competencia.id;
  const carga = useCarga(
    (signal) =>
      Promise.all([
        obtenerPosiciones(id, { signal }),
        obtenerPartidos(id, { signal }),
        // Los equipos solo se usan para contar asociaciones: si fallan, la pestaña igual se muestra.
        listarEquipos(id, { signal }).catch((e) => (signal.aborted ? Promise.reject(e) : null))
      ]),
    [id]
  );

  if (carga.estado !== 'listo') {
    return (
      <section className="bloque detalle-competencia">
        <div className="contenedor">
          {carga.estado === 'cargando' ? (
            <Cargando texto="Cargando posiciones…" />
          ) : (
            <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />
          )}
        </div>
      </section>
    );
  }

  const [posiciones, partidos, equipos] = carga.datos;
  const proxima = proximaJornada(partidos);
  const ultima = ultimaJornadaJugada(partidos);

  return (
    <>
      <section className="bloque detalle-competencia">
        <div className="contenedor rejilla-lateral">
          <TablaPosiciones competenciaId={id} filas={posiciones} />
          <div className="rejilla-lateral__aparte">
            {proxima && <ProximaJornada jornada={proxima} onVerCalendario={() => onCambiarVista('calendario')} />}
            <DatosCompetencia competencia={competencia} partidos={partidos} equipos={equipos} />
          </div>
        </div>
      </section>

      {ultima && (
        <section className="bloque banda-resultados" aria-labelledby="titulo-ultima">
          <div className="contenedor">
            <div className="seccion-encabezado banda-resultados__encabezado">
              <h2 id="titulo-ultima" className="seccion-titulo">Resultados de la jornada {ultima.numero}</h2>
              {ultima.numero > 1 && (
                <button type="button" className="enlace-flecha boton-enlace" onClick={() => onCambiarVista('resultados')}>
                  Ver jornadas anteriores
                </button>
              )}
            </div>
            <ul className="rejilla-resultados">
              {ultima.partidos.slice(0, 6).map((p) => (
                <TarjetaResultado key={p.id} partido={p} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
