import { useState, useEffect, useMemo } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

export default function AuditoriaRespaldos() {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);

  // Filtros
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroTabla, setFiltroTabla] = useState('todos');
  const [filtroAccion, setFiltroAccion] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  // Modal para inspeccionar detalle de registro (JSONB)
  const [detalleLog, setDetalleLog] = useState(null);

  // Cargar registros de audit_logs desde Supabase
  async function cargarBitacora() {
    setCargando(true);
    setError(null);
    try {
      const { data, error: errLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .order('fecha_hora', { ascending: false });

      if (errLogs) throw errLogs;

      const formateados = (data || []).map((l) => {
        // Formatear texto descriptivo de lo que cambió
        let registroDesc = `ID: ${l.registro_id || '—'}`;
        if (l.accion === 'UPDATE' && l.registro_viejo && l.registro_nuevo) {
          const cambios = [];
          for (const key of Object.keys(l.registro_nuevo)) {
            if (l.registro_viejo[key] !== l.registro_nuevo[key] && key !== 'updated_at') {
              cambios.push(`${key}: ${l.registro_viejo[key] ?? '—'} → ${l.registro_nuevo[key] ?? '—'}`);
            }
          }
          if (cambios.length > 0) {
            registroDesc = cambios.slice(0, 2).join(' · ');
          }
        } else if (l.accion === 'INSERT' && l.registro_nuevo) {
          registroDesc = l.registro_nuevo.name || l.registro_nuevo.full_name || l.registro_nuevo.value || `Nuevo registro (${l.tabla})`;
        } else if (l.accion === 'DELETE' && l.registro_viejo) {
          registroDesc = l.registro_viejo.name || l.registro_viejo.full_name || l.registro_viejo.value || `Eliminado (${l.tabla})`;
        }

        return {
          id: l.id,
          fechaHora: new Date(l.fecha_hora).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }),
          usuario: l.usuario || 'Sistema',
          accion: l.accion,
          modulo: l.tabla,
          registroAfectado: registroDesc,
          detalleViejo: l.registro_viejo,
          detalleNuevo: l.registro_nuevo,
        };
      });

      setLogs(formateados);
    } catch (err) {
      console.error('Error al cargar bitácora:', err);
      setError('No se pudieron cargar los registros de auditoría: ' + err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarBitacora();
  }, []);

  const usuariosUnicos = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.usuario))).filter(Boolean);
  }, [logs]);

  const tablasUnicas = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.modulo))).filter(Boolean);
  }, [logs]);

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      const matchUsuario = filtroUsuario === 'todos' || l.usuario === filtroUsuario;
      const matchTabla = filtroTabla === 'todos' || l.modulo === filtroTabla;
      const matchAccion = filtroAccion === 'todas' || l.accion === filtroAccion;
      const matchBusqueda = busqueda === '' || 
        l.registroAfectado.toLowerCase().includes(busqueda.toLowerCase()) ||
        l.usuario.toLowerCase().includes(busqueda.toLowerCase());
      return matchUsuario && matchTabla && matchAccion && matchBusqueda;
    });
  }, [logs, filtroUsuario, filtroTabla, filtroAccion, busqueda]);

  // Al cambiar filtros volvemos a la página 1
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroUsuario, filtroTabla, filtroAccion, busqueda]);

  // Paginación de 10 registros
  const totalPaginas = Math.ceil(logsFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  const logsPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
    return logsFiltrados.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [logsFiltrados, paginaActual]);

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Auditoría y respaldos</h1>
          <p className="admin-page-header__subtitle">{logs.length} eventos registrados en la bitácora</p>
        </div>
        <div className="admin-page-header__actions">
          <button 
            type="button" 
            className="admin-btn admin-btn--secondary"
            onClick={cargarBitacora}
          >
            Refrescar bitácora
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Filters Bar */}
      <div className="admin-filters-bar">
        <select 
          className="admin-select"
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
        >
          <option value="todos">Usuario: todos</option>
          {usuariosUnicos.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <select 
          className="admin-select"
          value={filtroTabla}
          onChange={(e) => setFiltroTabla(e.target.value)}
        >
          <option value="todos">Tabla / Módulo: todos</option>
          {tablasUnicas.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select 
          className="admin-select"
          value={filtroAccion}
          onChange={(e) => setFiltroAccion(e.target.value)}
        >
          <option value="todas">Acción: todas</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>

        <input 
          type="search"
          className="admin-input admin-input--search"
          placeholder="Buscar registro..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Grid: Audit table + Backups Sidebar */}
      <div className="admin-grid-layout">
        {/* Audit Log Table */}
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Bitácora de cambios</h2>
            <span className="admin-card__badge">{logsFiltrados.length} eventos</span>
          </div>

          {cargando ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
              Cargando bitácora desde Supabase...
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Tabla / Módulo</th>
                  <th>Registro afectado</th>
                  <th style={{ textAlign: 'right' }}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logsPaginados.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{log.fechaHora}</td>
                    <td style={{ color: 'var(--texto)', fontWeight: 600 }}>{log.usuario}</td>
                    <td>
                      <span className={`badge-status ${log.accion === 'INSERT' ? 'badge-status--activa' : (log.accion === 'DELETE' ? 'badge-status--suspendida' : 'badge-status--inactivo')}`}>
                        {log.accion}
                      </span>
                    </td>
                    <td><code>{log.modulo}</code></td>
                    <td>{log.registroAfectado}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        type="button" 
                        className="admin-btn admin-btn--secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={() => setDetalleLog(log)}
                      >
                        Ver JSON
                      </button>
                    </td>
                  </tr>
                ))}
                {logsPaginados.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                      No hay eventos en la bitácora que coincidan con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Pagination Controls */}
          <div className="admin-table-footer">
            <span>
              Mostrando {logsPaginados.length} de {logsFiltrados.length} registros
              {totalPaginas > 1 && ` (Página ${paginaActual} de ${totalPaginas})`}
            </span>
            <div className="admin-pagination-links">
              <button 
                type="button" 
                onClick={() => setPaginaActual(p => Math.max(p - 1, 1))}
                disabled={paginaActual <= 1}
              >
                &lt; Anterior
              </button>
              <button 
                type="button" 
                onClick={() => setPaginaActual(p => Math.min(p + 1, totalPaginas))}
                disabled={paginaActual >= totalPaginas}
              >
                Siguiente &gt;
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: Backups & Retention policy */}
        <div>
          {/* Backups card */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Respaldos de base de datos</h2>
              <p className="admin-side-card__subtitle">Supabase PITR / Respaldos diarios</p>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, color: 'var(--texto)', fontSize: '0.84rem' }}>Copia de seguridad</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>Gestionado por Supabase</span>
                </div>
                <span className="badge-status badge-status--activa">
                  ACTIVO
                </span>
              </li>
            </ul>
          </div>

          {/* Retention Policy (Acorde al prototipo oficial de Figma) */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Política de retención</h2>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Respaldos diarios</span>
                <strong style={{ color: 'var(--texto)', fontSize: '0.82rem' }}>Se conservan 30 días</strong>
              </li>
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Respaldos mensuales</span>
                <strong style={{ color: 'var(--texto)', fontSize: '0.82rem' }}>Se conservan 12 meses</strong>
              </li>
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Bitácora</span>
                <strong style={{ color: 'var(--texto)', fontSize: '0.82rem' }}>No se depura</strong>
              </li>
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Ubicación</span>
                <strong style={{ color: 'var(--texto)', fontSize: '0.82rem' }}>Almacenamiento de la Federación</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal: Ver Detalle JSON del Log (Con ancho amplio para evitar que se corte) */}
      {detalleLog && (
        <div className="admin-modal-overlay">
          <div className="admin-modal admin-modal--wide">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Detalle del registro de auditoría</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setDetalleLog(null)}
              >
                &times;
              </button>
            </div>
            <div className="admin-modal__body">
              <div style={{ marginBottom: '16px' }}>
                <strong style={{ fontSize: '0.95rem', display: 'block', color: 'var(--texto)' }}>
                  Acción {detalleLog.accion} sobre la tabla «{detalleLog.modulo}»
                </strong>
                <span style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>
                  Por <strong>{detalleLog.usuario}</strong> · {detalleLog.fechaHora}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Fila anterior (JSONB)
                  </label>
                  <pre style={{
                    background: '#f8fafc',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    overflowX: 'auto',
                    maxHeight: '340px',
                    border: '1px solid var(--linea)',
                    whiteSpace: 'pre',
                    margin: 0
                  }}>
                    {detalleLog.detalleViejo ? JSON.stringify(detalleLog.detalleViejo, null, 2) : '(Ninguno - INSERT)'}
                  </pre>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Fila nueva (JSONB)
                  </label>
                  <pre style={{
                    background: '#f8fafc',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    overflowX: 'auto',
                    maxHeight: '340px',
                    border: '1px solid var(--linea)',
                    whiteSpace: 'pre',
                    margin: 0
                  }}>
                    {detalleLog.detalleNuevo ? JSON.stringify(detalleLog.detalleNuevo, null, 2) : '(Ninguno - DELETE)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="admin-modal__footer">
              <button 
                type="button" 
                className="admin-btn admin-btn--primary"
                onClick={() => setDetalleLog(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
