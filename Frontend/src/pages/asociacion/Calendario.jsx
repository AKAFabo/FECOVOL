// Calendario (Figma 04 · Calendario; RF-ASO-007): partidos de los equipos de la asociación, con
// filtros por equipo, competencia y mes, y el próximo partido. Solo consulta.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import useDatosVigentes from '../../hooks/useDatosVigentes.js';
import {
  calendarioAsociacion, fechaHoraCR, miParticipacion, nombreEquipo, textoResultado, textoSets, tonoResultado
} from '../../services/participacion.js';
import { diaYHora, fechasJornada } from '../../utils/formato.js';
import { RUTA, useAsociacion } from './contexto.js';
import '../../styles/participacion.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

// Opciones de mes: los seis anteriores y los seis siguientes al actual.
function opcionesMes() {
  const [a, m] = hoyCR().split('-').map(Number);
  const lista = [];
  for (let k = -6; k <= 6; k += 1) {
    const d = new Date(Date.UTC(a, m - 1 + k, 1));
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    lista.push({
      clave: d.toISOString().slice(0, 7),
      texto: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      desde: d.toISOString().slice(0, 10),
      hasta: fin.toISOString().slice(0, 10)
    });
  }
  return lista;
}

// Lunes de la semana de una fecha (para agrupar el calendario por semana).
function lunesDe(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default function Calendario() {
  useAsociacion([{ texto: 'Calendario' }]);
  const meses = useMemo(opcionesMes, []);
  const [filtro, setFiltro] = useState({ equipo: '', competencia: '', mes: '' });
  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const mes = meses.find((m) => m.clave === filtro.mes);

  const base = useCarga((signal) => miParticipacion({ signal }), []);
  const partidosC = useCarga(
    (signal) => calendarioAsociacion({ team_id: filtro.equipo, competition_id: filtro.competencia, desde: mes?.desde, hasta: mes?.hasta }, { signal }),
    [filtro.equipo, filtro.competencia, filtro.mes]
  );
  const respuesta = useDatosVigentes(partidosC, 'calendario');

  const competencias = useMemo(() => {
    const vistas = new Map();
    for (const i of base.datos?.data || []) if (i.status === 'INSCRITO') vistas.set(i.competition.id, i.competition.name);
    return [...vistas].map(([id, name]) => ({ id, name }));
  }, [base.datos]);

  const hoy = hoyCR();
  const partidos = respuesta?.data || [];
  const proximo = partidos.find((p) => p.date >= hoy && ['PROGRAMADO', 'REPROGRAMADO'].includes(p.status));
  const grupos = useMemo(() => {
    const porSemana = new Map();
    for (const p of partidos) {
      const clave = p.date ? lunesDe(p.date) : 'sin-fecha';
      if (!porSemana.has(clave)) porSemana.set(clave, []);
      porSemana.get(clave).push(p);
    }
    return [...porSemana.values()];
  }, [partidos]);
  const equiposConPartidos = new Set(partidos.map((p) => p.team?.id)).size;

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Calendario"
        bajada={respuesta ? `${equiposConPartidos} ${equiposConPartidos === 1 ? 'equipo' : 'equipos'} · ${mes ? mes.texto : 'próximos 60 días'}` : null}
        acciones={<button type="button" className="g-boton" onClick={() => window.print()} disabled={!partidos.length}>Imprimir o guardar en PDF</button>}
      />

      <div className="g-filtros" role="search" aria-label="Filtrar el calendario">
        <label className="visualmente-oculto" htmlFor="cal-equipo">Equipo</label>
        <select id="cal-equipo" className="g-control" value={filtro.equipo} onChange={cambiar('equipo')}>
          <option value="">Equipo: todos</option>
          {(base.datos?.equipos || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="cal-competencia">Competencia</label>
        <select id="cal-competencia" className="g-control" value={filtro.competencia} onChange={cambiar('competencia')}>
          <option value="">Competencia: todas</option>
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="cal-mes">Mes</label>
        <select id="cal-mes" className="g-control" value={filtro.mes} onChange={cambiar('mes')}>
          <option value="">Próximos 60 días</option>
          {meses.map((m) => <option key={m.clave} value={m.clave}>Mes: {m.texto}</option>)}
        </select>
      </div>

      <div className="g-rejilla">
        <section className="g-tarjeta" id="area-impresion" aria-label="Partidos" aria-busy={partidosC.estado === 'cargando'}>
          <div className="part-solo-impresion">
            <h1 className="part-impresion__titulo">Calendario · {mes ? mes.texto : 'próximos 60 días'}</h1>
            <p className="part-impresion__nota">Impreso el {fechaHoraCR(new Date().toISOString())}</p>
          </div>
          {!respuesta && partidosC.estado === 'cargando' && <Cargando texto="Cargando el calendario…" />}
          {partidosC.estado === 'error' && <ErrorCarga mensaje={partidosC.error.message} onReintentar={partidosC.reintentar} />}
          {respuesta && (partidos.length === 0 ? (
            <p className="g-tarjeta__vacio">No hay partidos de sus equipos en este periodo.</p>
          ) : (
            <div className="g-tabla-envoltura">
              <table className="g-tabla">
                <caption className="visualmente-oculto">Partidos de sus equipos</caption>
                <thead>
                  <tr><th scope="col">Fecha</th><th scope="col">Su equipo</th><th scope="col">Rival</th><th scope="col">Sede</th><th scope="col">Condición</th><th scope="col">Resultado</th><th scope="col" className="part-sin-impresion"><span className="visualmente-oculto">Acciones</span></th></tr>
                </thead>
                {grupos.map((grupo) => (
                  <tbody key={grupo[0].id}>
                    <tr className="part-grupo">
                      <th scope="colgroup" colSpan={7}>Semana · {fechasJornada(grupo.map((p) => p.date).filter(Boolean)) || 'Fecha por definir'}</th>
                    </tr>
                    {grupo.map((p) => {
                      const tono = tonoResultado(p);
                      return (
                        <tr key={p.id}>
                          <td className="g-tabla__fecha part-fecha">{p.date === hoy ? `Hoy · ${p.time || ''}` : diaYHora(p.date, p.time)}</td>
                          <th scope="row">{nombreEquipo(p.team)}<span className="g-tabla__sub">{p.competition?.name}{p.matchday ? ` · Jornada ${p.matchday}` : ''}</span></th>
                          <td>{nombreEquipo(p.rival)}</td>
                          <td>{p.venue || 'Por confirmar'}</td>
                          <td><Estado tono={p.condition === 'LOCAL' ? 'ok' : 'neutro'}>{p.condition === 'LOCAL' ? 'Local' : 'Visita'}</Estado></td>
                          <td>
                            {tono ? <Estado tono={tono}>{textoResultado(p)}</Estado> : textoResultado(p)}
                            {p.result?.sets?.length > 0 && <span className="g-tabla__sub">{textoSets(p)}</span>}
                            {p.pending_validation && <span className="g-tabla__sub">Jugado; aún no es oficial</span>}
                          </td>
                          <td className="g-tabla__accion part-sin-impresion">
                            {p.competition && p.team && (
                              <Link to={RUTA.participacion(p.competition.id, p.team.id)} className="g-boton g-boton--chico">
                                Ver<span className="visualmente-oculto"> {nombreEquipo(p.team)} contra {nombreEquipo(p.rival)}</span>
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          ))}
          {respuesta?.actualizado && <div className="g-tarjeta__pie">Programación actualizada el {fechaHoraCR(respuesta.actualizado)}</div>}
        </section>

        <div className="g-columna part-sin-impresion">
          <Tarjeta titulo="Próximo partido">
            {proximo ? (
              <div className="g-tarjeta__cuerpo part-proximo">
                <Estado tono="ok">{diaYHora(proximo.date, proximo.time)}</Estado>
                <p className="part-proximo__titulo">
                  {proximo.condition === 'LOCAL'
                    ? `${nombreEquipo(proximo.team)} vs ${nombreEquipo(proximo.rival)}`
                    : `${nombreEquipo(proximo.rival)} vs ${nombreEquipo(proximo.team)}`}
                </p>
                <p className="g-lista__detalle">{[proximo.venue, proximo.competition?.name, proximo.matchday ? `jornada ${proximo.matchday}` : null].filter(Boolean).join(' · ')}</p>
                <Link to={RUTA.participacion(proximo.competition.id, proximo.team.id)} className="g-boton g-boton--chico">Ver nómina y tabla</Link>
              </div>
            ) : (
              <p className="g-tarjeta__vacio">No hay partidos programados en este periodo.</p>
            )}
          </Tarjeta>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Cambios de fecha</span>
            La programación la administra FECOVOL. Para mover un partido, comuníquese con el Personal de competencias.
          </p>
        </div>
      </div>
    </div>
  );
}
