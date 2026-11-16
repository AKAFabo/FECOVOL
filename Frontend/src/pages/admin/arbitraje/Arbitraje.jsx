import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../AdminCommon.css';
import './Arbitraje.css';
import CursoInscritos from './CursoInscritos.jsx';
import {
  ESTADO_ACREDITACION,
  PROVINCIAS,
  TIPOS_CURSO,
  fechaCorta,
  funcionCorta,
  listarArbitros,
  listarCursos,
  obtenerOpciones,
  obtenerResumen,
  rangoCurso
} from './arbitrajeDatos.js';

const POR_PAGINA = 20;
const FORMATO = { PRESENCIAL: 'presencial', VIRTUAL: 'virtual', MIXTO: 'mixto' };


function detalleCurso(c) {
  const partes = [rangoCurso(c.inicio, c.fin), FORMATO[c.formato] || c.formato];
  if (c.inscritos) partes.push(`${c.inscritos} inscrito${c.inscritos === 1 ? '' : 's'}`);
  else if (c.inscripcionAbierta) partes.push('Inscripción abierta');
  return partes.join(' · ');
}

export default function Arbitraje() {
  const [resumen, setResumen] = useState(null);
  const [funciones, setFunciones] = useState([]);
  const [filtros, setFiltros] = useState({ funcion: 'todas', estado: 'todos', provincia: 'todas' });
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);

  const [filas, setFilas] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [cursoAbierto, setCursoAbierto] = useState(null);
  const [verCursos, setVerCursos] = useState(false);

  const cargarResumen = useCallback(() => {
    obtenerResumen().then(setResumen).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    cargarResumen();
    obtenerOpciones().then((o) => setFunciones(o.funciones)).catch(() => {});
  }, [cargarResumen]);

  // Espera a que el usuario deje de escribir antes de consultar.
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
    listarArbitros({ ...filtros, busqueda: busquedaAplicada, pagina })
      .then((r) => {
        if (cancelado) return;
        setFilas(r.items);
        setTotal(r.total);
        setError('');
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
  }, [filtros, busquedaAplicada, pagina]);

  const cambiarFiltro = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const cobertura = resumen?.cobertura;

  return (
    <div>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Arbitraje</h1>
          <p className="admin-page-header__subtitle">
            {resumen ? `${resumen.acreditadas.toLocaleString('es-CR')} personas acreditadas` : 'Cargando…'}
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/admin/arbitraje/cursos/programar" className="admin-btn admin-btn--secondary">Programar curso</Link>
          <Link to="/admin/arbitraje/acreditar" className="admin-btn admin-btn--primary">Acreditar árbitro</Link>
        </div>
      </div>

      <div className="arb-resumen">
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor">{resumen ? resumen.acreditadas.toLocaleString('es-CR') : '—'}</span>
          <span className="arb-resumen__etiqueta">Personas en el cuerpo arbitral</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--aviso">{resumen ? resumen.porVencer : '—'}</span>
          <span className="arb-resumen__etiqueta">Acreditaciones por vencer</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--peligro">{resumen ? resumen.vencidas : '—'}</span>
          <span className="arb-resumen__etiqueta">Acreditaciones vencidas</span>
        </div>
        <div className="arb-resumen__card">
          <span className="arb-resumen__valor arb-resumen__valor--ok">
            {resumen?.arbitrajeCompletoPct === null || !resumen ? '—' : `${resumen.arbitrajeCompletoPct} %`}
          </span>
          <span className="arb-resumen__etiqueta">Partidos con arbitraje completo</span>
        </div>
      </div>

      <div className="admin-filters-bar arb-filtros">
        <select className="admin-select" value={filtros.funcion} onChange={cambiarFiltro('funcion')} aria-label="Función">
          <option value="todas">Función: todas</option>
          {funciones.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select>
        <select className="admin-select" value={filtros.estado} onChange={cambiarFiltro('estado')} aria-label="Acreditación">
          <option value="todos">Acreditación: todas</option>
          {Object.entries(ESTADO_ACREDITACION).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <select className="admin-select" value={filtros.provincia} onChange={cambiarFiltro('provincia')} aria-label="Provincia">
          <option value="todas">Provincia: todas</option>
          {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          type="search"
          className="admin-input admin-input--search arb-busqueda"
          placeholder="Buscar por nombre o cédula…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-layout">
        <div className="admin-card arb-tabla-scroll">
          <table className="admin-table arb-tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Categoría</th>
                <th>Acreditación</th>
                <th>Partidos</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const estado = ESTADO_ACREDITACION[f.estado];
                const claseNumero = f.estado === 'POR_VENCER' ? 'arb-texto-aviso' : f.estado === 'VENCIDA' ? 'arb-texto-peligro' : '';
                return (
                  <tr key={f.id}>
                    <td>
                      <div className="admin-table__user-cell">
                        <span className="admin-table__user-name">{f.nombre}</span>
                        <span className="admin-table__user-email">{f.cedula}</span>
                      </div>
                    </td>
                    <td>{funcionCorta(f.funcion)} · {f.nivel?.value || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {f.estado === 'VENCIDA' ? 'Venció' : 'Vence'} {fechaCorta(f.vence)}
                    </td>
                    <td className={claseNumero}>{f.partidos}</td>
                    <td><span className={`badge-status ${estado.clase}`}>{estado.texto}</span></td>
                    <td className="arb-tabla__accion">
                      <Link to={`/admin/arbitraje/${f.personaId}`} className="admin-btn admin-btn--secondary arb-boton-chico">
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="arb-vacio">
                    {cargando ? 'Cargando cuerpo arbitral…' : 'No hay personas acreditadas que coincidan con los filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="admin-table-footer">
            <span>Mostrando {filas.length} de {total} personas acreditadas</span>
            <div className="admin-pagination-links">
              <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>&lt; Anterior</button>
              <button type="button" disabled={pagina >= totalPaginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente &gt;</button>
            </div>
          </div>
        </div>

        <aside className="arb-lateral">
          <section className="arb-lateral__card">
            <div className="arb-lateral__header">
              <div>
                <h2 className="arb-lateral__titulo">Cursos y acreditaciones</h2>
                <p className="arb-lateral__subtitulo">Próximas fechas</p>
              </div>
              <button type="button" className="arb-enlace" onClick={() => setVerCursos(true)}>Ver todos</button>
            </div>
            {resumen?.proximosCursos.length ? (
              <ul className="arb-cursos">
                {resumen.proximosCursos.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="arb-curso" onClick={() => setCursoAbierto(c.id)}>
                      <span className="arb-curso__nombre">{c.nombre}</span>
                      <span className="arb-curso__detalle">{detalleCurso(c)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="arb-lateral__vacio">{resumen ? 'No hay cursos programados.' : 'Cargando…'}</p>
            )}
          </section>

          <section className="arb-lateral__card">
            <div className="arb-lateral__header">
              <div>
                <h2 className="arb-lateral__titulo">Cobertura de la semana</h2>
                <p className="arb-lateral__subtitulo">
                  {cobertura ? `Partidos del ${fechaCorta(cobertura.desde)} al ${fechaCorta(cobertura.hasta)}` : 'Cargando…'}
                </p>
              </div>
            </div>
            <ul className="arb-cifras">
              <li>Partidos programados <strong>{cobertura?.programados ?? '—'}</strong></li>
              <li>Con los cuatro oficiales <strong className="arb-texto-ok">{cobertura?.completos ?? '—'}</strong></li>
              <li>Incompletos <strong className="arb-texto-aviso">{cobertura?.incompletos ?? '—'}</strong></li>
              <li>Sin ningún oficial <strong className="arb-texto-aviso">{cobertura?.sinOficiales ?? '—'}</strong></li>
            </ul>
          </section>

          {resumen?.vencidas > 0 && (
            <div className="arb-aviso arb-aviso--naranja">
              <span className="arb-aviso__titulo">
                {resumen.vencidas === 1 ? 'Una acreditación vencida' : `${resumen.vencidas} acreditaciones vencidas`}
              </span>
              <p>Filtre por “Vencida” y renueve cada acreditación desde la ficha de la persona para que pueda volver a recibir designaciones.</p>
            </div>
          )}
        </aside>
      </div>

      {verCursos && (
        <TodosLosCursos
          onCerrar={() => setVerCursos(false)}
          onAbrir={(id) => {
            setVerCursos(false);
            setCursoAbierto(id);
          }}
        />
      )}
      {cursoAbierto && (
        <CursoInscritos cursoId={cursoAbierto} onCerrar={() => setCursoAbierto(null)} onCambio={cargarResumen} />
      )}
    </div>
  );
}

// Lista de todos los cursos (también los ya terminados, para cargar sus notas).
function TodosLosCursos({ onCerrar, onAbrir }) {
  const [cursos, setCursos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    listarCursos()
      .then((lista) => !cancelado && setCursos(lista))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="admin-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="todos-cursos-titulo">
        <div className="admin-modal__header">
          <h2 id="todos-cursos-titulo" className="admin-modal__title">Cursos del cuerpo arbitral</h2>
          <button type="button" className="admin-modal__close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="admin-modal__body">
          {error && <p className="arb-error" role="alert">{error}</p>}
          {!cursos && !error && <p className="arb-vacio">Cargando cursos…</p>}
          {cursos && cursos.length === 0 && <p className="arb-vacio">Todavía no se han programado cursos.</p>}
          {cursos && cursos.length > 0 && (
            <ul className="arb-cursos" style={{ padding: 0 }}>
              {cursos.map((c) => (
                <li key={c.id}>
                  <button type="button" className="arb-curso" onClick={() => onAbrir(c.id)}>
                    <span className="arb-curso__nombre">{c.nombre}</span>
                    <span className="arb-curso__detalle">
                      {TIPOS_CURSO[c.tipo]} · {detalleCurso(c)}
                      {c.estado !== 'PUBLICADO' ? ` · ${c.estado.toLowerCase()}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
