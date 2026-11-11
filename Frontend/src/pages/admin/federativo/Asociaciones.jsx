// Asociaciones y equipos (Figma 02 · Asociaciones y equipos): todas las asociaciones con su
// representante y el estado de sus documentos; al elegir una, se ven sus equipos debajo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { listarAsociaciones, listarEquiposDe, ESTADOS_ASOCIACION } from '../../../services/administracion.js';
import { PROVINCIAS, ESTADOS_EQUIPO } from '../../../services/representante.js';
import { plural } from '../../../utils/formato.js';
import { RUTA_ADMIN as RUTA } from '../../asociacion/contexto.js';

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function EstadoDocumentacion({ documentos }) {
  if (!documentos) return <>—</>;
  if (documentos.por_corregir) return <Estado tono="error">{documentos.por_corregir} por corregir</Estado>;
  if (documentos.en_revision) return <Estado tono="info">{documentos.en_revision} en revisión</Estado>;
  if (documentos.por_vencer) return <Estado tono="aviso">{documentos.por_vencer} por vencer</Estado>;
  return <Estado tono="ok">Al día</Estado>;
}

function EquiposDe({ asociacion }) {
  const carga = useCarga((signal) => listarEquiposDe(asociacion.id, { signal }), [asociacion.id]);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  return (
    <div ref={ref}>
    <Tarjeta
      titulo={`Equipos de ${asociacion.name}`}
      nota={`${asociacion.teams_count ?? 0} equipos · ${asociacion.persons_count ?? 0} personas`}
      accion={<Link to={RUTA.asociacion(asociacion.id)} className="g-boton g-boton--chico">Ver asociación</Link>}
    >
      {carga.estado === 'cargando' && <Cargando texto="Cargando equipos…" />}
      {carga.estado === 'error' && <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
      {carga.estado === 'listo' && (carga.datos.length === 0 ? (
        <p className="g-tarjeta__vacio">La asociación todavía no tiene equipos.</p>
      ) : (
        <div className="g-tabla-envoltura">
          <table className="g-tabla">
            <caption className="visualmente-oculto">Equipos de {asociacion.name}</caption>
            <thead>
              <tr>
                <th scope="col">Equipo</th>
                <th scope="col">Categoría</th>
                <th scope="col">Rama</th>
                <th scope="col">Integrantes</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {carga.datos.map((e) => {
                const estado = ESTADOS_EQUIPO[e.status] || { texto: e.status, tono: 'neutro' };
                return (
                  <tr key={e.id}>
                    <th scope="row">{e.name}<span className="g-tabla__sub">{e.modalidad?.value}</span></th>
                    <td>{e.categoria?.value || '—'}</td>
                    <td>{e.rama?.value || '—'}</td>
                    <td>{plural(e.jugadores ?? 0, 'jugador', 'jugadores')} · {plural(e.tecnicos ?? 0, 'técnico', 'técnicos')}</td>
                    <td><Estado tono={estado.tono}>{estado.texto}</Estado></td>
                    <td className="g-tabla__accion">
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        <Link to={RUTA.equipo(e.id)} className="g-boton g-boton--chico">Ver nómina</Link>
                        <Link to={RUTA.editarEquipo(e.id)} className="g-boton g-boton--chico">Corrección oficial</Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </Tarjeta>
    </div>
  );
}

export default function Asociaciones() {
  const [filtro, setFiltro] = useState({ provincia: '', estado: '', q: '' });
  const [elegida, setElegida] = useState(null);
  const carga = useCarga((signal) => listarAsociaciones({}, { signal }), []);

  const visibles = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    const q = sinTildes(filtro.q.trim());
    return carga.datos.filter((a) =>
      (!filtro.provincia || a.province === filtro.provincia) &&
      (!filtro.estado || a.status === filtro.estado) &&
      (!q || sinTildes(`${a.name} ${a.short_name || ''} ${(a.representantes || []).map((r) => r.full_name).join(' ')}`).includes(q)));
  }, [carga, filtro]);

  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const acciones = <Link to={RUTA.afiliar} className="g-boton g-boton--primario">Afiliar asociación</Link>;

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Asociaciones y equipos" acciones={acciones} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando asociaciones…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
      </div>
    );
  }

  const lista = carga.datos;
  const equipos = lista.reduce((s, a) => s + (a.teams_count || 0), 0);
  const personas = lista.reduce((s, a) => s + (a.persons_count || 0), 0);
  const enRevision = lista.reduce((s, a) => s + (a.documentos?.en_revision || 0), 0);
  const porCorregir = lista.filter((a) => a.documentos?.por_corregir).length;

  return (
    <div className="g-pagina">
      <Encabezado titulo="Asociaciones y equipos" bajada={`${lista.length} asociaciones · ${equipos} equipos`} acciones={acciones} />

      <Cifras
        items={[
          { valor: lista.length, texto: 'Asociaciones' },
          { valor: equipos, texto: 'Equipos' },
          { valor: personas, texto: 'Personas registradas' },
          { valor: enRevision, texto: 'Documentos por revisar', tono: enRevision ? 'aviso' : undefined },
          { valor: porCorregir, texto: 'Asociaciones con documentos por corregir', tono: porCorregir ? 'error' : undefined }
        ]}
      />

      <div className="g-filtros" role="search" aria-label="Filtrar asociaciones">
        <label className="visualmente-oculto" htmlFor="a-provincia">Provincia</label>
        <select id="a-provincia" className="g-control" value={filtro.provincia} onChange={cambiar('provincia')}>
          <option value="">Provincia: todas</option>
          {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="a-estado">Estado</label>
        <select id="a-estado" className="g-control" value={filtro.estado} onChange={cambiar('estado')}>
          <option value="">Estado: todos</option>
          {Object.entries(ESTADOS_ASOCIACION).map(([code, e]) => <option key={code} value={code}>{e.texto}</option>)}
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="a-q">Buscar asociación o representante</label>
          <input id="a-q" type="search" className="g-control" placeholder="Buscar asociación o representante…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <section className="g-tarjeta" aria-label="Asociaciones">
        {lista.length === 0 ? (
          <SinResultados titulo="Todavía no hay asociaciones" texto="Afilie la primera asociación para que su representante pueda registrar equipos y personas.">
            {acciones}
          </SinResultados>
        ) : visibles.length === 0 ? (
          <p className="g-tarjeta__vacio">Ninguna asociación coincide con los filtros.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Asociaciones afiliadas</caption>
              <thead>
                <tr>
                  <th scope="col">Asociación</th>
                  <th scope="col">Provincia</th>
                  <th scope="col">Representante</th>
                  <th scope="col">Equipos</th>
                  <th scope="col">Personas</th>
                  <th scope="col">Documentación</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => {
                  const estado = ESTADOS_ASOCIACION[a.status] || { texto: a.status, tono: 'neutro' };
                  const rep = (a.representantes || [])[0];
                  return (
                    <tr key={a.id} style={elegida?.id === a.id ? { background: '#f4f7fb' } : undefined}>
                      <th scope="row"><Link className="g-enlace" to={RUTA.asociacion(a.id)}>{a.name}</Link></th>
                      <td>{a.province || '—'}</td>
                      <td>{rep ? rep.full_name || rep.email : <span className="g-tabla__aviso">Sin representante</span>}</td>
                      <td>{a.teams_count ?? 0}</td>
                      <td>{a.persons_count ?? 0}</td>
                      <td><EstadoDocumentacion documentos={a.documentos} /></td>
                      <td><Estado tono={estado.tono}>{estado.texto}</Estado></td>
                      <td className="g-tabla__accion">
                        <span style={{ display: 'inline-flex', gap: 8 }}>
                          <button type="button" className="g-boton g-boton--chico" onClick={() => setElegida(a)} aria-pressed={elegida?.id === a.id}>
                            Ver equipos<span className="visualmente-oculto"> de {a.name}</span>
                          </button>
                          <Link to={RUTA.asociacion(a.id)} className="g-boton g-boton--chico">Abrir<span className="visualmente-oculto"> {a.name}</span></Link>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > 0 && <div className="g-tarjeta__pie">{visibles.length} de {lista.length} asociaciones</div>}
      </section>

      {elegida && <EquiposDe key={elegida.id} asociacion={elegida} />}
    </div>
  );
}
