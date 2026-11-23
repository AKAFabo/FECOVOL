import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../AdminCommon.css';
import '../arbitraje/Arbitraje.css';
import './Incidentes.css';
import { ArchivarModal } from './ModalesExpediente.jsx';
import {
  ESTADO_EXPEDIENTE,
  diaHora,
  fechaLarga,
  listarExpedientes,
  obtenerExpediente,
  obtenerOpciones,
  obtenerResumen
} from './incidentesDatos.js';

const POR_PAGINA = 20;
const ACTIVOS = ['ABIERTO', 'EN_SEGUIMIENTO'];

// Vista rápida del expediente seleccionado en la tabla.
function VistaExpediente({ casoId, faltas, onArchivar }) {
  const navigate = useNavigate();
  const [caso, setCaso] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    setCaso(null);
    setError('');
    obtenerExpediente(casoId)
      .then((c) => !cancelado && setCaso(c))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [casoId]);

  if (error) return <div className="inc-vista"><p className="arb-lateral__vacio">{error}</p></div>;
  if (!caso) return <div className="inc-vista"><p className="arb-lateral__vacio">Cargando expediente…</p></div>;

  const estado = ESTADO_EXPEDIENTE[caso.estado];
  const falta = faltas.find((f) => f.id === caso.propuesta.faltaId);
  const eventos = caso.cronologia.slice(-4);
  const p = caso.partido;

  return (
    <section className="inc-vista" aria-label={`Expediente ${caso.numero}`}>
      <div className="inc-vista__header">
        <div>
          <h2 className="inc-vista__numero">{caso.numero}</h2>
          <p className="inc-vista__subtitulo">{caso.titulo}</p>
        </div>
        <span className={`badge-status ${estado.clase}`}>{estado.texto}</span>
      </div>
      <dl className="inc-vista__datos">
        <dt>Partido</dt>
        <dd>{p ? `${p.local} vs ${p.visita} · ${fechaLarga(p.fecha)}` : '—'}</dd>
        {caso.reportadoPor && (<><dt>Registrado por</dt><dd>{caso.reportadoPor}</dd></>)}
        <dt>Momento</dt>
        <dd>{caso.momento || diaHora(caso.ocurrido)}</dd>
        <dt>Falta</dt>
        <dd>{falta ? `${falta.nombre} (catálogo ${falta.codigo})` : 'Sin propuesta de resolución'}</dd>
      </dl>
      <ul className="inc-cronologia inc-cronologia--compacta">
        {eventos.map((e, i) => (
          <li key={e.id} className={`inc-evento inc-evento--${e.tipo.toLowerCase()} ${i === eventos.length - 1 ? 'inc-evento--ultimo' : ''}`}>
            <span className="inc-evento__texto">{e.descripcion}</span>
            <span className="inc-evento__actor">{diaHora(e.fecha)}</span>
          </li>
        ))}
        {caso.plazoDescargo && ACTIVOS.includes(caso.estado) && (
          <li className="inc-evento">
            <span className="inc-evento__texto">Resolución pendiente</span>
            <span className="inc-evento__actor">Plazo de descargo hasta el {fechaLarga(caso.plazoDescargo)}</span>
          </li>
        )}
      </ul>
      <div className="inc-vista__acciones">
        {ACTIVOS.includes(caso.estado) ? (
          <>
            <button type="button" className="admin-btn admin-btn--sancion" onClick={() => navigate(`/admin/incidentes/${caso.id}`)}>
              Aplicar sanción
            </button>
            <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onArchivar(caso)}>Archivar</button>
          </>
        ) : (
          <Link to={`/admin/incidentes/${caso.id}`} className="admin-btn admin-btn--secondary">Ver expediente</Link>
        )}
      </div>
    </section>
  );
}

export default function Incidentes() {
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);
  const [opciones, setOpciones] = useState({ tipos: [], competencias: [], faltas: [] });
  const [filtros, setFiltros] = useState({ tipo: 'todos', estado: 'todos', competencia: 'todas' });
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [archivando, setArchivando] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const cargarResumen = useCallback(() => {
    obtenerResumen().then(setResumen).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    cargarResumen();
    obtenerOpciones().then(setOpciones).catch(() => {});
  }, [cargarResumen]);

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(espera);
  }, [busqueda]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    listarExpedientes({ ...filtros, busqueda: busquedaAplicada, pagina })
      .then((r) => {
        if (cancelado) return;
        setFilas(r.items);
        setTotal(r.total);
        setError('');
        setSeleccionado((actual) => (r.items.some((f) => f.id === actual) ? actual : r.items[0]?.id || null));
      })
      .catch((e) => {
        if (cancelado) return;
        setFilas([]);
        setTotal(0);
        setError(e.message);
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [filtros, busquedaAplicada, pagina, recarga]);

  const cambiarFiltro = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const abiertos = resumen ? resumen.abiertos + resumen.enSeguimiento : null;

  return (
    <div>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Incidentes y sanciones</h1>
          <p className="admin-page-header__subtitle">
            {resumen ? `Temporada ${resumen.temporada} · ${abiertos} expediente${abiertos === 1 ? '' : 's'} sin resolver` : 'Cargando…'}
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/admin/incidentes/faltas" className="admin-btn admin-btn--secondary">Catálogo de faltas</Link>
          <Link to="/admin/incidentes/abrir" className="admin-btn admin-btn--primary">Abrir expediente</Link>
        </div>
      </div>

      <div className="arb-resumen">
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--aviso">{resumen?.abiertos ?? '—'}</span>
          <span className="arb-resumen__etiqueta">Expedientes abiertos</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--aviso">{resumen?.enSeguimiento ?? '—'}</span>
          <span className="arb-resumen__etiqueta">En seguimiento</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--ok">{resumen?.resueltosTemporada ?? '—'}</span>
          <span className="arb-resumen__etiqueta">Resueltos esta temporada</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--peligro">{resumen?.sancionesVigentes ?? '—'}</span>
          <span className="arb-resumen__etiqueta">Sanciones vigentes</span>
        </div>
      </div>

      <div className="admin-filters-bar arb-filtros">
        <select className="admin-select" value={filtros.tipo} onChange={cambiarFiltro('tipo')} aria-label="Tipo de incidente">
          <option value="todos">Tipo: todos</option>
          {opciones.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
        </select>
        <select className="admin-select" value={filtros.estado} onChange={cambiarFiltro('estado')} aria-label="Estado">
          <option value="todos">Estado: todos</option>
          {Object.entries(ESTADO_EXPEDIENTE).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <select className="admin-select" value={filtros.competencia} onChange={cambiarFiltro('competencia')} aria-label="Competencia">
          <option value="todas">Competencia: todas</option>
          {opciones.competencias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input
          type="search"
          className="admin-input admin-input--search arb-busqueda"
          placeholder="Buscar por partido, persona o expediente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px' }}>
        <div className="admin-card arb-tabla-scroll">
          <table className="admin-table inc-tabla">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Incidente</th>
                <th>Partido</th>
                <th>Involucra</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const estado = ESTADO_EXPEDIENTE[f.estado];
                return (
                  <tr
                    key={f.id}
                    className={f.id === seleccionado ? 'inc-fila--activa' : ''}
                    onClick={() => setSeleccionado(f.id)}
                  >
                    <td>
                      <div className="admin-table__user-cell">
                        <span className="admin-table__user-name">{f.numero}</span>
                        <span className="admin-table__user-email">{diaHora(f.abierto)}</span>
                      </div>
                    </td>
                    <td className="inc-titulo">{f.titulo}</td>
                    <td>{f.partido}</td>
                    <td>{f.involucra}</td>
                    <td><span className={`badge-status ${estado.clase}`} style={{ whiteSpace: 'nowrap' }}>{estado.texto}</span></td>
                    <td className="arb-tabla__accion">
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary arb-boton-chico"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/incidentes/${f.id}`);
                        }}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="arb-vacio">
                    {cargando ? 'Cargando expedientes…' : 'No hay expedientes que coincidan con los filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="admin-table-footer">
            <span>Mostrando {filas.length} de {total} expedientes</span>
            <div className="admin-pagination-links">
              <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>&lt; Anterior</button>
              <button type="button" disabled={pagina >= totalPaginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente &gt;</button>
            </div>
          </div>
        </div>

        <aside>
          {seleccionado ? (
            <VistaExpediente key={`${seleccionado}-${recarga}`} casoId={seleccionado} faltas={opciones.faltas} onArchivar={setArchivando} />
          ) : (
            <div className="inc-vista"><p className="arb-lateral__vacio">Seleccione un expediente para ver su resumen.</p></div>
          )}
        </aside>
      </div>

      {archivando && (
        <ArchivarModal
          caso={archivando}
          onCerrar={() => setArchivando(null)}
          onListo={() => {
            setArchivando(null);
            setRecarga((n) => n + 1);
            cargarResumen();
          }}
        />
      )}
    </div>
  );
}
