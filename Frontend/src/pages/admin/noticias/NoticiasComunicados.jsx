import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../AdminCommon.css';
import './NoticiasComunicados.css';
import { listarNoticias, obtenerResumen } from './noticiasDatos.js';

const RESUMEN_VACIO = { total: 0, borradores: 0, programadas: 0, publicadasAnio: 0, archivadas: 0, autores: [] };
const POR_PAGINA = 20;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// '2026-09-12T22:40' → '12 set · 22:40'
function formatearPublicacion(valor) {
  if (!valor) return 'Sin fecha';
  const f = new Date(valor);
  const hora = f.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${f.getDate()} ${MESES[f.getMonth()]} · ${hora}`;
}

const CLASE_ESTADO = {
  PUBLICADA: 'badge-status--activa',
  PROGRAMADA: 'badge-status--programada',
  BORRADOR: 'badge-status--borrador',
  ARCHIVADA: 'badge-status--inactivo'
};

const formatoNumero = (n) => n.toLocaleString('es-CR');

export default function NoticiasComunicados() {
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroAutor, setFiltroAutor] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);

  const [noticias, setNoticias] = useState([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState(RESUMEN_VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerResumen().then(setResumen).catch((e) => setError(e.message));
  }, []);

  // Espera a que el usuario deje de escribir antes de consultar.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusquedaAplicada(busqueda);
      setPagina(1);
    }, 350);
    return () => clearTimeout(espera);
  }, [busqueda]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    listarNoticias({ estado: filtroEstado, autorId: filtroAutor, busqueda: busquedaAplicada, pagina, porPagina: POR_PAGINA })
      .then((resultado) => {
        if (cancelado) return;
        setNoticias(resultado.noticias);
        setTotal(resultado.total);
        setError('');
      })
      .catch((e) => {
        if (cancelado) return;
        setNoticias([]);
        setTotal(0);
        setError(e.message);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [filtroEstado, filtroAutor, busquedaAplicada, pagina]);

  const cambiarFiltro = (aplicar) => (e) => {
    aplicar(e.target.value);
    setPagina(1);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Noticias y comunicados</h1>
          <p className="admin-page-header__subtitle">
            {resumen.total} publicaciones · {resumen.borradores} borradores
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/noticias" className="admin-btn admin-btn--secondary">
            Ver el sitio público
          </Link>
          <Link to="/admin/noticias/redactar" className="admin-btn admin-btn--primary">
            Redactar noticia
          </Link>
        </div>
      </div>

      {/* Resumen */}
      <div className="noticias-resumen">
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor">{formatoNumero(resumen.publicadasAnio)}</span>
          <span className="noticias-resumen__etiqueta">Publicadas este año</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor noticias-resumen__valor--neutro">{resumen.borradores}</span>
          <span className="noticias-resumen__etiqueta">Borradores</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor noticias-resumen__valor--aviso">{resumen.programadas}</span>
          <span className="noticias-resumen__etiqueta">Programadas</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor noticias-resumen__valor--neutro">{resumen.archivadas}</span>
          <span className="noticias-resumen__etiqueta">Archivadas</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="admin-filters-bar">
        <select className="admin-select" value={filtroEstado} onChange={cambiarFiltro(setFiltroEstado)}>
          <option value="todos">Estado: todos</option>
          <option value="PUBLICADA">Publicada</option>
          <option value="PROGRAMADA">Programada</option>
          <option value="BORRADOR">Borrador</option>
          <option value="ARCHIVADA">Archivada</option>
        </select>

        <select className="admin-select" value={filtroAutor} onChange={cambiarFiltro(setFiltroAutor)}>
          <option value="todos">Autor: todos</option>
          {resumen.autores.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>

        <input
          type="search"
          className="admin-input admin-input--search noticias-busqueda"
          placeholder="Buscar por título…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <p className="noticias-error" role="alert">{error}</p>}

      {/* Tabla */}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Competencia</th>
              <th>Publicación</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {noticias.map((n) => (
              <tr key={n.id}>
                <td>
                  <div className="admin-table__user-cell">
                    <span className="admin-table__user-name">{n.titulo}</span>
                    <span className="admin-table__user-email">Por {n.autor}</span>
                  </div>
                </td>
                <td>{n.competencia || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatearPublicacion(n.fechaPublicacion)}</td>
                <td>
                  <span className={`badge-status ${CLASE_ESTADO[n.estado]}`}>{n.estado}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Link
                    to={`/admin/noticias/${n.id}/editar`}
                    className="admin-btn admin-btn--secondary"
                    style={{ padding: '4px 14px', fontSize: '0.82rem' }}
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {noticias.length === 0 && (
              <tr>
                <td colSpan={5} className="noticias-vacio">
                  {cargando ? 'Cargando noticias…' : 'No hay noticias que coincidan con los filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="admin-table-footer">
          <span>{noticias.length} de {total} publicaciones</span>
          <div className="admin-pagination-links">
            <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>
              &lt; Anterior
            </button>
            <button type="button" disabled={pagina >= totalPaginas || cargando} onClick={() => setPagina((p) => p + 1)}>
              Siguiente &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
