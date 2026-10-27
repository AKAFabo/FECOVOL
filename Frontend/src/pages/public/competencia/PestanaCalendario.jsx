import { useMemo, useState } from 'react';
import EscudoEquipo from '../../../components/EscudoEquipo.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import Selector from '../../../components/Selector.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { estadoPartido } from '../../../services/competencias.js';
import { CARGAS } from './cargas.js';
import { diaYHora, fechasJornada } from '../../../utils/formato.js';
import { equiposDe, juegaEn, pendiente, porJornada, terminado } from './partidos.js';

const TODOS = 'todos';

function FilaPartido({ partido: p }) {
  const estado = estadoPartido(p.status);
  const local = p.home?.name || 'Por definir';
  const visita = p.away?.name || 'Por definir';
  const cerrado = terminado(p);

  return (
    <li className="fila-calendario">
      <p className="fila-calendario__cuando">{diaYHora(p.date, p.time)}</p>
      <p className="fila-calendario__duelo">
        <span className="fila-calendario__equipo fila-calendario__equipo--local">
          {local}
          <EscudoEquipo equipo={p.home} />
        </span>
        <span className="fila-calendario__centro">
          {cerrado ? (
            <>
              <span className="visualmente-oculto">Resultado: {local} {p.home_sets}, {visita} {p.away_sets}</span>
              <span aria-hidden="true" className="fila-calendario__marcador">{p.home_sets} – {p.away_sets}</span>
            </>
          ) : (
            <span className="fila-calendario__vs">vs</span>
          )}
        </span>
        <span className="fila-calendario__equipo">
          <EscudoEquipo equipo={p.away} />
          {visita}
        </span>
      </p>
      <p className="fila-calendario__sede">
        {p.status !== 'PROGRAMADO' && <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>}
        {p.venue || 'Sede por confirmar'}
      </p>
    </li>
  );
}

export default function PestanaCalendario({ competenciaId }) {
  const { clave, cargar } = CARGAS.partidos(competenciaId);
  const carga = useCarga(cargar, [competenciaId], { clave });
  const [jornada, setJornada] = useState(TODOS);
  const [equipo, setEquipo] = useState(TODOS);
  const [sede, setSede] = useState(TODOS);

  // El calendario muestra las jornadas que todavía tienen partidos por jugar; lo ya jugado está en
  // la pestaña Resultados.
  const jornadas = useMemo(() => {
    const todas = porJornada(carga.datos || []);
    return todas.filter((j) => j.partidos.some(pendiente));
  }, [carga.datos]);

  if (carga.estado === 'cargando') return <Cargando texto="Cargando calendario…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;

  if (jornadas.length === 0) {
    return (
      <SinResultados
        titulo={carga.datos.length ? 'No quedan partidos por jugar' : 'El calendario aún no está publicado'}
        texto={carga.datos.length ? 'Todos los partidos programados ya se jugaron. Los marcadores están en Resultados.' : 'Los partidos aparecerán aquí cuando se programen.'}
      />
    );
  }

  const partidos = jornadas.flatMap((j) => j.partidos);
  const sedes = [...new Set(partidos.map((p) => p.venue).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  const filtradas = jornadas
    .filter((j) => jornada === TODOS || String(j.numero) === jornada)
    .map((j) => ({
      ...j,
      proxima: j.numero === jornadas[0].numero,
      fechas: fechasJornada(j.partidos.map((p) => p.date)),
      partidos: j.partidos.filter(
        (p) => (equipo === TODOS || juegaEn(p, equipo)) && (sede === TODOS || p.venue === sede)
      )
    }))
    .filter((j) => j.partidos.length > 0);

  return (
    <>
      <div className="filtros-linea">
        <Selector
          etiqueta="Jornada"
          valor={jornada}
          onCambiar={setJornada}
          opciones={[{ valor: TODOS, texto: 'todas' }, ...jornadas.map((j) => ({ valor: String(j.numero), texto: String(j.numero) }))]}
        />
        <Selector
          etiqueta="Equipo"
          valor={equipo}
          onCambiar={setEquipo}
          opciones={[{ valor: TODOS, texto: 'todos' }, ...equiposDe(partidos).map((e) => ({ valor: e.id, texto: e.name }))]}
        />
        {sedes.length > 1 && (
          <Selector
            etiqueta="Sede"
            valor={sede}
            onCambiar={setSede}
            opciones={[{ valor: TODOS, texto: 'todas' }, ...sedes.map((s) => ({ valor: s, texto: s }))]}
          />
        )}
      </div>

      {filtradas.length === 0 && <SinResultados titulo="No hay partidos con esos filtros" />}

      <div className="jornadas">
        {filtradas.map((j) => (
          <section key={j.numero} className="jornada" aria-labelledby={`jornada-${j.numero}`}>
            <header className="jornada__cabecera">
              <h2 id={`jornada-${j.numero}`} className="jornada__titulo">
                Jornada {j.numero}
                {j.fechas && <span className="jornada__fechas">{j.fechas}</span>}
              </h2>
              <span className={`pastilla ${j.proxima ? 'pastilla--aviso' : 'pastilla--neutra'}`}>
                {j.proxima ? 'Próxima' : 'Programada'}
              </span>
            </header>
            <ul className="jornada__partidos">
              {j.partidos.map((p) => (
                <FilaPartido key={p.id} partido={p} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
