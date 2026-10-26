import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../AdminCommon.css';
import './NoticiasComunicados.css';
import { listarNoticias } from './noticiasDatos.js';

// Datos de ejemplo: TODO agregar logica
const RESUMEN = {
  totalPublicaciones: 53,
  borradores: 3,
  publicadasAnio: 48,
  programadas: 2,
  lecturasMes: 12400
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// '2026-09-12T22:40' → '12 set · 22:40'
function formatearPublicacion(valor) {
  if (!valor) return 'Sin fecha';
  const f = new Date(valor);
  const hora = f.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${f.getDate()} ${MESES[f.getMonth()]} · ${hora}`;
}

const CATEGORIAS = ['Liga Superior', 'Selecciones', 'Competencias', 'Arbitraje', 'Voleibol de playa'];
const AUTORES = ['Prensa FECOVOL', 'Fabricio Herrera'];

const CLASE_ESTADO = {
  PUBLICADA: 'badge-status--activa',
  PROGRAMADA: 'badge-status--programada',
  BORRADOR: 'badge-status--borrador'
};

const formatoNumero = (n) => n.toLocaleString('es-CR');

export default function NoticiasComunicados() {
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroAutor, setFiltroAutor] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const [noticias, setNoticias] = useState([]);

  useEffect(() => {
    listarNoticias().then(setNoticias);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Noticias y comunicados</h1>
          <p className="admin-page-header__subtitle">
            {RESUMEN.totalPublicaciones} publicaciones · {RESUMEN.borradores} borradores
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
          <span className="noticias-resumen__valor">{formatoNumero(RESUMEN.publicadasAnio)}</span>
          <span className="noticias-resumen__etiqueta">Publicadas este año</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor noticias-resumen__valor--neutro">{RESUMEN.borradores}</span>
          <span className="noticias-resumen__etiqueta">Borradores</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor noticias-resumen__valor--aviso">{RESUMEN.programadas}</span>
          <span className="noticias-resumen__etiqueta">Programadas</span>
        </div>
        <div className="noticias-resumen__card">
          <span className="noticias-resumen__valor">{formatoNumero(RESUMEN.lecturasMes)}</span>
          <span className="noticias-resumen__etiqueta">Lecturas del mes</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="admin-filters-bar">
        <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Estado: todos</option>
          <option value="PUBLICADA">Publicada</option>
          <option value="PROGRAMADA">Programada</option>
          <option value="BORRADOR">Borrador</option>
        </select>

        <select className="admin-select" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="todas">Categoría: todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select className="admin-select" value={filtroAutor} onChange={(e) => setFiltroAutor(e.target.value)}>
          <option value="todos">Autor: todos</option>
          {AUTORES.map((a) => (
            <option key={a} value={a}>{a}</option>
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

      {/* Tabla */}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Categoría</th>
              <th>Publicación</th>
              <th>Estado</th>
              <th>Lecturas</th>
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
                <td>{n.categoria}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatearPublicacion(n.fechaPublicacion)}</td>
                <td>
                  <span className={`badge-status ${CLASE_ESTADO[n.estado]}`}>{n.estado}</span>
                </td>
                <td>{n.lecturas != null ? formatoNumero(n.lecturas) : '—'}</td>
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
          </tbody>
        </table>

        <div className="admin-table-footer">
          <span>{noticias.length} de {RESUMEN.totalPublicaciones} publicaciones</span>
          <div className="admin-pagination-links">
            <button type="button">&lt; Anterior</button>
            <button type="button">Siguiente &gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
}
