// Actas (Figma 05 · Árbitro · Actas): los partidos ya disputados en que la persona estuvo designada,
// con el estado de su acta, el marcador, la hoja de anotación y el acceso para cerrarla.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { misActas, nombrePartido } from '../../services/arbitraje.js';
import { fechaDiaMesCorto } from '../../utils/formato.js';
import '../../styles/arbitraje.css';

const ESTADOS = {
  ABIERTA: { texto: 'Abierta', tono: 'aviso' },
  EN_VALIDACION: { texto: 'En validación', tono: 'info' },
  VALIDADA: { texto: 'Validada', tono: 'ok' },
  DEVUELTA: { texto: 'Devuelta', tono: 'error' }
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const ruta = (a) => `/arbitro/partidos/${encodeURIComponent(a.partido.id)}`;
const marcador = (a) => (a.marcador ? `${a.marcador[0]} – ${a.marcador[1]}` : '—');

// Celda segura para CSV: entre comillas y sin que una hoja de cálculo la interprete como fórmula.
const celda = (v) => {
  const t = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

function exportar(actas, anio) {
  const filas = [['Fecha', 'Partido', 'Competencia', 'Jornada', 'Mi rol', 'Marcador', 'Hoja de anotación', 'Estado']]
    .concat(actas.map((a) => [a.partido.scheduled_date, nombrePartido(a.partido), a.partido.competencia?.name, a.partido.matchday ?? '',
      a.puesto?.value, marcador(a), a.hoja_adjuntada ? 'Adjuntada' : 'Sin adjuntar', ESTADOS[a.estado].texto]));
  const csv = `﻿${filas.map((f) => f.map(celda).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `mis-actas-${anio}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Actas() {
  const carga = useCarga((signal) => misActas({ signal }), []);
  const [filtro, setFiltro] = useState({ competencia: '', estado: '', mes: '', q: '' });
  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));

  const actas = carga.datos?.data || [];
  const competencias = useMemo(() => [...new Map(actas.map((a) => [a.partido.competencia?.id, a.partido.competencia?.name])).entries()].filter(([id]) => id), [actas]);
  const meses = useMemo(() => [...new Set(actas.map((a) => a.partido.scheduled_date?.slice(0, 7)).filter(Boolean))], [actas]);
  const visibles = actas.filter((a) => (!filtro.competencia || a.partido.competencia?.id === filtro.competencia)
    && (!filtro.estado || a.estado === filtro.estado)
    && (!filtro.mes || a.partido.scheduled_date?.startsWith(filtro.mes))
    && (!filtro.q || nombrePartido(a.partido).toLowerCase().includes(filtro.q.trim().toLowerCase())));

  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  if (!carga.datos) return <Cargando texto="Cargando sus actas…" />;

  const cuenta = (e) => actas.filter((a) => a.estado === e).length;
  const pendiente = actas.find((a) => a.puede_cerrar);
  const anio = carga.datos.anio;

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Actas"
        bajada={`${actas.length} ${actas.length === 1 ? 'acta' : 'actas'} esta temporada`}
        acciones={<button type="button" className="g-boton" onClick={() => exportar(visibles, anio)} disabled={!visibles.length}>Exportar mis actas</button>}
      />
      <Cifras items={[
        { valor: cuenta('EN_VALIDACION') + cuenta('VALIDADA'), texto: 'Actas enviadas' },
        { valor: cuenta('ABIERTA'), texto: cuenta('ABIERTA') === 1 ? 'Acta sin cerrar' : 'Actas sin cerrar', tono: cuenta('ABIERTA') ? 'aviso' : undefined },
        { valor: cuenta('VALIDADA'), texto: 'Validadas', tono: 'ok' },
        { valor: cuenta('DEVUELTA'), texto: 'Devueltas', tono: cuenta('DEVUELTA') ? 'error' : undefined }
      ]} />

      <div className="g-filtros" role="search" aria-label="Filtrar actas">
        <label className="visualmente-oculto" htmlFor="actas-comp">Competencia</label>
        <select id="actas-comp" className="g-control" value={filtro.competencia} onChange={cambiar('competencia')}>
          <option value="">Competencia: todas</option>
          {competencias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="actas-estado">Estado</label>
        <select id="actas-estado" className="g-control" value={filtro.estado} onChange={cambiar('estado')}>
          <option value="">Estado: todos</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="actas-mes">Mes</label>
        <select id="actas-mes" className="g-control" value={filtro.mes} onChange={cambiar('mes')}>
          <option value="">Mes: todos</option>
          {meses.map((m) => <option key={m} value={m}>Mes: {MESES[Number(m.slice(5, 7)) - 1]}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="actas-q">Buscar partido</label>
        <input id="actas-q" className="g-control" type="search" placeholder="Buscar partido…" value={filtro.q} onChange={cambiar('q')} maxLength={60} />
      </div>

      <div className="g-rejilla">
        <section className="g-tarjeta" aria-label="Actas">
          {visibles.length === 0 ? (
            <p className="g-tarjeta__vacio">{actas.length
              ? 'Ninguna acta coincide con los filtros.'
              : 'Aquí aparecen los partidos de esta temporada que ya se disputaron y en los que usted estuvo designado. Cuando pase la fecha de uno de sus partidos, podrá abrirlo para cerrar el acta (si es el árbitro principal) o consultar su estado.'}</p>
          ) : (
            <>
              <div className="g-tabla-envoltura arb-solo-escritorio">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Actas de sus partidos</caption>
                  <thead>
                    <tr><th scope="col">Partido</th><th scope="col">Fecha</th><th scope="col">Marcador</th><th scope="col">Hoja de anotación</th><th scope="col">Estado</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {visibles.map((a) => {
                      const e = ESTADOS[a.estado];
                      return (
                        <tr key={a.partido.id}>
                          <th scope="row">{nombrePartido(a.partido)}<span className="g-tabla__sub">{a.partido.match_number ? `Partido #${a.partido.match_number}` : a.partido.competencia?.name}</span></th>
                          <td>{fechaDiaMesCorto(a.partido.scheduled_date)}</td>
                          <td>{marcador(a)}</td>
                          <td className={a.hoja_adjuntada ? undefined : 'arb-txt-aviso'}>{a.hoja_adjuntada ? 'Adjuntada' : 'Sin adjuntar'}</td>
                          <td><Estado tono={e.tono}>{e.texto}</Estado></td>
                          <td className="g-tabla__accion">
                            <Link to={ruta(a)} className={`g-boton g-boton--chico${a.puede_cerrar ? ' g-boton--acento' : ''}`}>
                              {a.puede_cerrar ? 'Cerrar acta' : 'Ver'}<span className="visualmente-oculto"> {nombrePartido(a.partido)}</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="g-lista arb-solo-movil">
                {visibles.map((a) => {
                  const e = ESTADOS[a.estado];
                  return (
                    <li key={a.partido.id} className="arb-tarjeta-partido">
                      <div className="arb-tarjeta-partido__cabeza"><span className="arb-fecha-destacada">{fechaDiaMesCorto(a.partido.scheduled_date)}</span><Estado tono={e.tono}>{e.texto}</Estado></div>
                      <p className="arb-tarjeta-partido__titulo">{nombrePartido(a.partido)}</p>
                      <p className="g-lista__detalle">Marcador {marcador(a)} · Hoja {a.hoja_adjuntada ? 'adjuntada' : 'sin adjuntar'}</p>
                      <Link to={ruta(a)} className={`g-boton g-boton--chico${a.puede_cerrar ? ' g-boton--acento' : ''}`}>{a.puede_cerrar ? 'Cerrar acta' : 'Ver'}</Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <div className="g-columna">
          {pendiente && (
            <div className="g-aviso arb-aviso-naranja" role="status">
              <span className="g-aviso__titulo">{pendiente.estado === 'DEVUELTA' ? 'FECOVOL le devolvió un acta' : 'Tiene un acta sin cerrar'}</span>
              {nombrePartido(pendiente.partido)}, del {fechaDiaMesCorto(pendiente.partido.scheduled_date)}.
              {pendiente.estado === 'DEVUELTA' && pendiente.motivo_devolucion ? ` Motivo: ${pendiente.motivo_devolucion}` : ''}
              {!pendiente.hoja_adjuntada && pendiente.estado !== 'DEVUELTA' ? ' Falta la hoja de anotación.' : ''}
              <Link to={ruta(pendiente)} className="g-boton g-boton--acento arb-aviso-boton">Cerrar esa acta</Link>
            </div>
          )}
          <Tarjeta titulo="Plazos">
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Cierre del acta</dt><dd>Recomendado dentro de las 24 horas del partido</dd></div>
              <div className="g-datos__fila"><dt>Validación</dt><dd>La hace el Personal de competencias</dd></div>
              <div className="g-datos__fila"><dt>Corrección</dt><dd>Solo FECOVOL, con bitácora</dd></div>
              <div className="g-datos__fila"><dt>Publicación</dt><dd>El resultado sale al público al validarse</dd></div>
            </dl>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
