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
  const [tabModal, setTabModal] = useState('comparar'); // 'comparar' | 'nuevo' | 'viejo'
  const [copiado, setCopiado] = useState(null); // 'viejo' | 'nuevo' | null

  function copiarTexto(data, tipo) {
    if (!data) return;
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      setCopiado(tipo);
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  function abrirDetalle(log) {
    setTabModal(log.accion === 'INSERT' ? 'nuevo' : (log.accion === 'DELETE' ? 'viejo' : 'comparar'));
    setCopiado(null);
    setDetalleLog(log);
  }

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
        const listaCambios = [];

        if (l.accion === 'UPDATE' && l.registro_viejo && l.registro_nuevo) {
          for (const key of Object.keys(l.registro_nuevo)) {
            if (l.registro_viejo[key] !== l.registro_nuevo[key] && key !== 'updated_at') {
              const valViejo = l.registro_viejo[key] !== undefined && l.registro_viejo[key] !== null ? String(l.registro_viejo[key]) : '—';
              const valNuevo = l.registro_nuevo[key] !== undefined && l.registro_nuevo[key] !== null ? String(l.registro_nuevo[key]) : '—';
              listaCambios.push({
                campo: key,
                antes: valViejo,
                despues: valNuevo
              });
            }
          }
          if (listaCambios.length > 0) {
            const primeros = listaCambios.slice(0, 2).map(c => `${c.campo}: ${c.antes} → ${c.despues}`).join(' · ');
            registroDesc = listaCambios.length > 2 ? `${primeros} (+${listaCambios.length - 2} más)` : primeros;
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
          registroId: l.registro_id,
          registroAfectado: registroDesc,
          cambios: listaCambios,
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
                        onClick={() => abrirDetalle(log)}
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
        </div>
      </div>

      {/* Modal: Ver Detalle JSON del Log (Con tabs, copia y layout responsivo que no se corta) */}
      {detalleLog && (
        <div className="admin-modal-overlay" onClick={() => setDetalleLog(null)}>
          <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div>
                <h3 className="admin-modal__title">Detalle del registro de auditoría</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.8rem', color: 'var(--texto-mudo)', flexWrap: 'wrap' }}>
                  <span className={`badge-status ${detalleLog.accion === 'INSERT' ? 'badge-status--activa' : (detalleLog.accion === 'DELETE' ? 'badge-status--suspendida' : 'badge-status--inactivo')}`}>
                    {detalleLog.accion}
                  </span>
                  <span>Tabla: <strong>{detalleLog.modulo}</strong></span>
                  {detalleLog.registroId && (
                    <span>· Registro ID: <code style={{ fontSize: '0.78rem' }}>{detalleLog.registroId}</code></span>
                  )}
                  <span>· {detalleLog.fechaHora}</span>
                  <span>· Por: <strong>{detalleLog.usuario}</strong></span>
                </div>
              </div>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setDetalleLog(null)}
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>

            <div className="admin-modal__body">
              {/* Resumen de campos modificados cuando la acción es UPDATE */}
              {detalleLog.accion === 'UPDATE' && detalleLog.cambios?.length > 0 && (
                <div style={{
                  marginBottom: '16px',
                  background: '#f8fafc',
                  border: '1px solid var(--linea)',
                  borderRadius: '6px',
                  padding: '12px 16px'
                }}>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--texto)', display: 'block', marginBottom: '8px' }}>
                    Campos modificados ({detalleLog.cambios.length}):
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {detalleLog.cambios.map((c, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <code style={{ background: '#e2e8f0', color: '#1e293b', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          {c.campo}
                        </code>
                        <span style={{ color: '#dc2626', textDecoration: 'line-through', fontFamily: 'monospace' }}>
                          {c.antes}
                        </span>
                        <span style={{ color: 'var(--texto-mudo)' }}>&rarr;</span>
                        <span style={{ color: '#16a34a', fontWeight: 600, fontFamily: 'monospace' }}>
                          {c.despues}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selector de vistas para UPDATE */}
              {detalleLog.accion === 'UPDATE' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--linea)', paddingBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setTabModal('comparar')}
                    className={`admin-btn ${tabModal === 'comparar' ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Comparativa (2 columnas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabModal('nuevo')}
                    className={`admin-btn ${tabModal === 'nuevo' ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Fila nueva (Completa)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabModal('viejo')}
                    className={`admin-btn ${tabModal === 'viejo' ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Fila anterior (Completa)
                  </button>
                </div>
              )}

              {/* Contenedores de JSON */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: (detalleLog.accion === 'UPDATE' && tabModal === 'comparar') ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                gap: '16px'
              }}>
                {/* Columna Fila Anterior */}
                {(detalleLog.accion === 'DELETE' || (detalleLog.accion === 'UPDATE' && (tabModal === 'comparar' || tabModal === 'viejo'))) && (
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                        Fila anterior (JSONB)
                      </label>
                      {detalleLog.detalleViejo && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                          onClick={() => copiarTexto(detalleLog.detalleViejo, 'viejo')}
                        >
                          {copiado === 'viejo' ? '✓ Copiado' : 'Copiar JSON'}
                        </button>
                      )}
                    </div>
                    <pre style={{
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '14px 16px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      lineHeight: '1.5',
                      fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxHeight: '460px',
                      border: '1px solid #1e293b',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0
                    }}>
                      {detalleLog.detalleViejo ? JSON.stringify(detalleLog.detalleViejo, null, 2) : '(Ninguno - INSERT)'}
                    </pre>
                  </div>
                )}

                {/* Columna Fila Nueva */}
                {(detalleLog.accion === 'INSERT' || (detalleLog.accion === 'UPDATE' && (tabModal === 'comparar' || tabModal === 'nuevo'))) && (
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                        Fila nueva (JSONB)
                      </label>
                      {detalleLog.detalleNuevo && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                          onClick={() => copiarTexto(detalleLog.detalleNuevo, 'nuevo')}
                        >
                          {copiado === 'nuevo' ? '✓ Copiado' : 'Copiar JSON'}
                        </button>
                      )}
                    </div>
                    <pre style={{
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '14px 16px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      lineHeight: '1.5',
                      fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxHeight: '460px',
                      border: '1px solid #1e293b',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0
                    }}>
                      {detalleLog.detalleNuevo ? JSON.stringify(detalleLog.detalleNuevo, null, 2) : '(Ninguno - DELETE)'}
                    </pre>
                  </div>
                )}
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
