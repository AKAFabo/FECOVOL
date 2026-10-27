import { Link } from 'react-router-dom';
import EscudoEquipo from '../../../components/EscudoEquipo.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { obtenerEstadisticas } from '../../../services/competencias.js';
import { plural } from '../../../utils/formato.js';
import { cociente, numero, unDecimal } from './partidos.js';

function Cifra({ titulo, valor, detalle }) {
  return (
    <div className="estadistica-cifra">
      <dt className="estadistica-cifra__titulo">{titulo}</dt>
      <dd className="estadistica-cifra__valor">{valor}</dd>
      {detalle && <dd className="estadistica-cifra__detalle">{detalle}</dd>}
    </div>
  );
}

function Racha({ racha }) {
  if (!racha) return '—';
  const victorias = racha.type === 'VICTORIAS';
  const texto = victorias ? plural(racha.count, 'victoria', 'victorias') : plural(racha.count, 'derrota', 'derrotas');
  return <span className={`pastilla ${victorias ? 'pastilla--ok' : 'pastilla--error'}`}>{texto}</span>;
}

const COLUMNAS = [
  ['played', 'PJ', 'Partidos jugados'],
  ['won', 'G', 'Partidos ganados'],
  ['lost', 'P', 'Partidos perdidos'],
  ['sets_won', 'Sets G', 'Sets ganados'],
  ['sets_lost', 'Sets P', 'Sets perdidos']
];

export default function PestanaEstadisticas({ competencia }) {
  const carga = useCarga((signal) => obtenerEstadisticas(competencia.id, { signal }), [competencia.id]);

  if (carga.estado === 'cargando') return <Cargando texto="Calculando estadísticas…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;

  const { totals: t, teams } = carga.datos;
  if (!t.matches_played) {
    return <SinResultados titulo="Todavía no hay estadísticas" texto="Se calculan con los partidos finalizados." />;
  }

  const porcentajeCinco = Math.round((t.five_set_matches / t.matches_played) * 100);

  return (
    <>
      <div className="seccion-encabezado estadisticas-encabezado">
        <h2 className="equipos-encabezado__titulo">
          Estadísticas por equipo{t.matchday_current ? ` · hasta la jornada ${t.matchday_current}` : ''}
        </h2>
        <p className="tarjeta-panel__nota">Calculadas con los partidos finalizados</p>
      </div>

      <dl className="estadisticas-cifras">
        <Cifra titulo="Partidos jugados" valor={numero(t.matches_played)} detalle={t.matches_total ? `de ${numero(t.matches_total)} programados` : null} />
        <Cifra titulo="Sets disputados" valor={numero(t.sets_played)} detalle={t.sets_per_match ? `${unDecimal(t.sets_per_match)} sets por partido` : null} />
        <Cifra titulo="Partidos a 5 sets" valor={numero(t.five_set_matches)} detalle={`${porcentajeCinco} % de los partidos`} />
        <Cifra titulo="Puntos por set" valor={unDecimal(t.points_per_set)} detalle="promedio de ambos equipos" />
      </dl>

      <section className="tarjeta-panel" aria-labelledby="titulo-rendimiento">
        <header className="tarjeta-panel__cabecera">
          <h3 id="titulo-rendimiento" className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">Rendimiento por equipo</h3>
          <p className="tarjeta-panel__nota">Ordenado por posición</p>
        </header>
        <div className="tabla-desplazable">
          <table className="tabla-datos tabla-datos--ancha">
            <caption className="visualmente-oculto">Rendimiento por equipo</caption>
            <thead>
              <tr>
                <th scope="col" className="tabla-datos__pos"><abbr title="Posición">#</abbr></th>
                <th scope="col" className="tabla-datos__equipo">Equipo</th>
                {COLUMNAS.map(([clave, corto, largo]) => (
                  <th key={clave} scope="col"><abbr title={largo}>{corto}</abbr></th>
                ))}
                <th scope="col"><abbr title="Sets ganados entre sets perdidos">Ratio sets</abbr></th>
                <th scope="col">Puntos a favor</th>
                <th scope="col">Puntos en contra</th>
                <th scope="col"><abbr title="Puntos a favor entre puntos en contra">Ratio puntos</abbr></th>
                <th scope="col"><abbr title="Partidos que llegaron al quinto set">A 5 sets</abbr></th>
                <th scope="col">Racha</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((f) => (
                <tr key={f.team.id}>
                  <td className="tabla-datos__pos">{f.position}</td>
                  <th scope="row" className="tabla-datos__equipo">
                    <Link to={`/competencias/${competencia.id}/equipos/${f.team.id}`} className="enlace-equipo">
                      <EscudoEquipo equipo={f.team} tamano="s" />
                      {f.team.name}
                    </Link>
                  </th>
                  {COLUMNAS.map(([clave]) => (
                    <td key={clave}>{f[clave]}</td>
                  ))}
                  <td className="tabla-datos__fuerte">{cociente(f.sets_ratio)}</td>
                  <td>{numero(f.points_for)}</td>
                  <td>{numero(f.points_against)}</td>
                  <td>{cociente(f.points_ratio)}</td>
                  <td>{f.five_set_matches}</td>
                  <td><Racha racha={f.streak} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="nota-tabla">
        G y P: partidos ganados y perdidos. Ratio de sets y de puntos: a favor entre en contra; cuando un equipo no ha
        perdido ningún set se muestra «—». La racha cuenta los resultados iguales seguidos desde el último partido.
      </p>
    </>
  );
}
