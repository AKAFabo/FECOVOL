// Arbitraje (Figma 02 · Arbitraje): cuerpo arbitral con el estado de cada acreditación, cursos por
// venir y cobertura arbitral de los próximos partidos. Filtros y búsqueda en el servidor.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, OpcionesCatalogo, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import {
  categoriaArbitral, ESTADOS_ACREDITACION, fechaNumerica, listarCuerpoArbitral, resumenArbitraje, TIPOS_CURSO
} from '../../../services/arbitraje.js';
import { nombrePersona, PROVINCIAS, valoresCatalogo } from '../../../services/representante.js';
import { rangoDias } from '../../../utils/formato.js';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

function useDemorado(valor, ms = 350) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

function TextoVigencia({ a }) {
  if (!a.valid_until) return <span className="g-tabla__aviso">—</span>;
  if (a.estado === 'VENCIDA') return <span className="arb-texto-error">Venció {fechaNumerica(a.valid_until)}</span>;
  return <>Vence {fechaNumerica(a.valid_until)}</>;
}

function Cobertura({ cobertura }) {
  if (!cobertura) return null;
  const filas = [
    { texto: 'Partidos programados', valor: cobertura.partidos },
    { texto: 'Con los cuatro oficiales', valor: cobertura.completos, clase: 'arb-cifra-ok' },
    { texto: 'Incompletos', valor: cobertura.incompletos, clase: cobertura.incompletos ? 'arb-cifra-aviso' : '' },
    { texto: 'Sin ningún oficial', valor: cobertura.sin_oficiales, clase: cobertura.sin_oficiales ? 'arb-cifra-aviso' : '' }
  ];
  return (
    <Tarjeta
      titulo="Cobertura arbitral"
      nota={`Próximos 14 días · ${rangoDias(cobertura.desde, cobertura.hasta)}`}
      pie={<Link to={RUTA.designaciones} className="g-enlace">Ir a designaciones</Link>}
    >
      <dl className="g-datos">
        {filas.map((f) => (
          <div key={f.texto} className="g-datos__fila">
            <dt>{f.texto}</dt>
            <dd className={f.clase}>{f.valor}</dd>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}

export default function Arbitraje() {
  const [filtro, setFiltro] = useState({ funcion: '', nivel: '', estado: '', provincia: '', q: '' });
  const [pagina, setPagina] = useState(1);
  const q = useDemorado(filtro.q.trim());
  const cambiar = (campo) => (e) => {
    setFiltro((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
  };

  const base = useCarga(
    (signal) => Promise.all([resumenArbitraje({ signal }), valoresCatalogo('Tipos de oficial'), valoresCatalogo('Niveles arbitrales')])
      .then(([resumen, funciones, niveles]) => ({ resumen, funciones, niveles })),
    []
  );
  const lista = useCarga(
    (signal) => listarCuerpoArbitral({ ...filtro, q: q.length >= 2 ? q : '', pagina }, { signal }),
    [filtro.funcion, filtro.nivel, filtro.estado, filtro.provincia, q, pagina]
  );

  const resumen = base.datos?.resumen;
  const paginas = lista.datos ? Math.max(1, Math.ceil(lista.datos.total / lista.datos.por_pagina)) : 1;

  const acciones = (
    <>
      <Link to={RUTA.nuevoCurso} className="g-boton">Programar curso</Link>
      <Link to={RUTA.acreditar()} className="g-boton g-boton--primario">Acreditar árbitro</Link>
    </>
  );

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Arbitraje"
        bajada={resumen ? `${resumen.acreditados} ${resumen.acreditados === 1 ? 'persona acreditada' : 'personas acreditadas'}` : null}
        acciones={acciones}
      />

      {base.estado === 'error' && <ErrorCarga mensaje={base.error.message} onReintentar={base.reintentar} />}
      {resumen && (
        <Cifras
          items={[
            { valor: resumen.total, texto: 'Personas en el cuerpo arbitral' },
            { valor: resumen.por_vencer, texto: 'Acreditaciones por vencer', tono: resumen.por_vencer ? 'aviso' : undefined },
            { valor: resumen.vencida, texto: 'Acreditaciones vencidas', tono: resumen.vencida ? 'error' : undefined },
            {
              valor: resumen.cobertura.porcentaje === null ? '—' : `${resumen.cobertura.porcentaje} %`,
              texto: 'Partidos con arbitraje completo',
              tono: resumen.cobertura.porcentaje === 100 ? 'ok' : undefined
            }
          ]}
        />
      )}

      <div className="g-filtros" role="search" aria-label="Filtrar el cuerpo arbitral">
        <label className="visualmente-oculto" htmlFor="arb-funcion">Función</label>
        <select id="arb-funcion" className="g-control" value={filtro.funcion} onChange={cambiar('funcion')}>
          <OpcionesCatalogo valores={base.datos?.funciones} vacia="Función: todas" />
        </select>
        <label className="visualmente-oculto" htmlFor="arb-nivel">Nivel</label>
        <select id="arb-nivel" className="g-control" value={filtro.nivel} onChange={cambiar('nivel')}>
          <OpcionesCatalogo valores={base.datos?.niveles} vacia="Nivel: todos" />
        </select>
        <label className="visualmente-oculto" htmlFor="arb-estado">Acreditación</label>
        <select id="arb-estado" className="g-control" value={filtro.estado} onChange={cambiar('estado')}>
          <option value="">Acreditación: todas</option>
          {Object.entries(ESTADOS_ACREDITACION).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="arb-provincia">Provincia</label>
        <select id="arb-provincia" className="g-control" value={filtro.provincia} onChange={cambiar('provincia')}>
          <option value="">Provincia: todas</option>
          {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="arb-q">Buscar por nombre o cédula</label>
          <input id="arb-q" type="search" className="g-control" placeholder="Buscar por nombre o cédula…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <div className="g-rejilla">
        <section className="g-tarjeta" aria-label="Cuerpo arbitral" aria-busy={lista.estado === 'cargando'}>
          {lista.estado === 'cargando' && <Cargando texto="Cargando el cuerpo arbitral…" />}
          {lista.estado === 'error' && <ErrorCarga mensaje={lista.error.message} onReintentar={lista.reintentar} />}
          {lista.estado === 'listo' && (lista.datos.data.length === 0 ? (
            <p className="g-tarjeta__vacio">
              {lista.datos.total === 0 && !q && !filtro.funcion && !filtro.nivel && !filtro.estado && !filtro.provincia
                ? 'Todavía no hay personas en el cuerpo arbitral. Use «Acreditar árbitro» para registrar la primera.'
                : 'Ninguna persona coincide con la búsqueda.'}
            </p>
          ) : (
            <div className="g-tabla-envoltura">
              <table className="g-tabla">
                <caption className="visualmente-oculto">Cuerpo arbitral</caption>
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Acreditación</th>
                    <th scope="col">Partidos</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.datos.data.map((a) => {
                    const estado = ESTADOS_ACREDITACION[a.estado] || ESTADOS_ACREDITACION.SIN_ACREDITACION;
                    return (
                      <tr key={a.person_id}>
                        <th scope="row">{nombrePersona(a)}<span className="g-tabla__sub">{a.document_number}</span></th>
                        <td>{categoriaArbitral(a)}</td>
                        <td className="g-tabla__fecha"><TextoVigencia a={a} /></td>
                        <td className={a.estado === 'VENCIDA' ? 'arb-texto-error' : undefined}>{a.partidos_temporada}</td>
                        <td><Estado tono={estado.tono}>{estado.texto}</Estado></td>
                        <td className="g-tabla__accion">
                          <Link to={RUTA.ficha(a.person_id)} className="g-boton g-boton--chico">Ver ficha<span className="visualmente-oculto"> de {nombrePersona(a)}</span></Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {lista.estado === 'listo' && lista.datos.total > 0 && (
            <div className="g-tarjeta__pie">
              <span>Mostrando {lista.datos.data.length} de {lista.datos.total} personas</span>
              {paginas > 1 && (
                <nav className="arb-paginas" aria-label="Páginas">
                  <button type="button" className="g-enlace" onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1}>‹ Anterior</button>
                  <span>Página {pagina} de {paginas}</span>
                  <button type="button" className="g-enlace" onClick={() => setPagina((p) => p + 1)} disabled={pagina >= paginas}>Siguiente ›</button>
                </nav>
              )}
            </div>
          )}
        </section>

        <div className="g-columna">
          <Tarjeta titulo="Cursos" nota="Próximas fechas" pie={<Link to={RUTA.cursos} className="g-enlace">Ver todos los cursos</Link>}>
            {resumen && (resumen.cursos.length === 0 ? (
              <p className="g-tarjeta__vacio">No hay cursos programados.</p>
            ) : (
              <ul className="g-lista">
                {resumen.cursos.map((c) => (
                  <li key={c.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo"><Link to={RUTA.curso(c.id)} className="arb-enlace-fila">{c.name}</Link></p>
                      <p className="g-lista__detalle">
                        {[rangoDias(c.start_date, c.end_date), c.venue, `${c.inscritos} ${c.inscritos === 1 ? 'inscrito' : 'inscritos'}`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="g-lista__detalle">{TIPOS_CURSO[c.course_type]?.texto}{c.enrollment_open ? ' · Inscripción abierta' : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </Tarjeta>

          {resumen && <Cobertura cobertura={resumen.cobertura} />}

          {resumen?.vencida > 0 && (
            <p className="g-aviso arb-aviso-naranja">
              <span className="g-aviso__titulo">
                {resumen.vencida === 1 ? 'Una acreditación vencida' : `${resumen.vencida} acreditaciones vencidas`}
              </span>
              Esas personas no se pueden designar en partidos. Se habilitan de nuevo al renovar la acreditación desde su ficha.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
