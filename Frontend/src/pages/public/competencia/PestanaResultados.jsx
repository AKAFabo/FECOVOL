import { useMemo, useState } from 'react';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import Selector from '../../../components/Selector.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { obtenerPartidos } from '../../../services/competencias.js';
import { fechasJornada } from '../../../utils/formato.js';
import TarjetaResultado from './TarjetaResultado.jsx';
import { equiposDe, juegaEn, porJornada, terminado } from './partidos.js';

const TODOS = 'todos';

export default function PestanaResultados({ competenciaId }) {
  const carga = useCarga((signal) => obtenerPartidos(competenciaId, { signal }), [competenciaId]);
  const [jornada, setJornada] = useState(TODOS);
  const [equipo, setEquipo] = useState(TODOS);

  // De la más reciente a la más antigua.
  const jornadas = useMemo(() => porJornada((carga.datos || []).filter(terminado)).reverse(), [carga.datos]);

  if (carga.estado === 'cargando') return <Cargando texto="Cargando resultados…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  if (jornadas.length === 0) {
    return <SinResultados titulo="Aún no hay resultados" texto="Los marcadores se publican cuando el partido termina." />;
  }

  const filtradas = jornadas
    .filter((j) => jornada === TODOS || String(j.numero) === jornada)
    .map((j) => ({
      ...j,
      fechas: fechasJornada(j.partidos.map((p) => p.date)),
      partidos: j.partidos.filter((p) => equipo === TODOS || juegaEn(p, equipo))
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
          opciones={[{ valor: TODOS, texto: 'todos' }, ...equiposDe(jornadas.flatMap((j) => j.partidos)).map((e) => ({ valor: e.id, texto: e.name }))]}
        />
      </div>

      {filtradas.length === 0 && <SinResultados titulo="No hay resultados con esos filtros" />}

      {filtradas.map((j) => (
        <section key={j.numero} className="jornada-resultados" aria-labelledby={`resultados-${j.numero}`}>
          <h2 id={`resultados-${j.numero}`} className="jornada-resultados__titulo">
            Jornada {j.numero}{j.fechas && ` · ${j.fechas}`}
          </h2>
          <ul className="rejilla-resultados">
            {j.partidos.map((p) => (
              <TarjetaResultado key={p.id} partido={p} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
