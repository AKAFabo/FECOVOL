import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export default function AuditoriaRespaldos() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [fechaMasAntigua, setFechaMasAntigua] = useState(null);

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);

  // Filtros
  const [filtroUsuario, setFiltroUsuario] = useState(searchParams.get('usuario') || 'todos');
  const [filtroTabla, setFiltroTabla] = useState(searchParams.get('tabla') || 'todos');
  const [filtroAccion, setFiltroAccion] = useState('todas');
  const [filtroRegistroId, setFiltroRegistroId] = useState(searchParams.get('registroId') || '');
  const [busqueda, setBusqueda] = useState('');

  // Filtros de fecha (RF-AUD-004)
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [rangoPreset, setRangoPreset] = useState('todo');

  // Modal para inspeccionar detalle de registro (JSONB)
  const [detalleLog, setDetalleLog] = useState(null);
  const [tabModal, setTabModal] = useState('comparar'); // 'comparar' | 'nuevo' | 'viejo'
  const [copiado, setCopiado] = useState(null); // 'viejo' | 'nuevo' | null

  // Sincronizar parámetros de búsqueda desde URL si cambian externamente
  useEffect(() => {
    const paramTabla = searchParams.get('tabla');
    const paramRegistroId = searchParams.get('registroId');
    const paramUsuario = searchParams.get('usuario');

    if (paramTabla) setFiltroTabla(paramTabla);
    if (paramRegistroId) setFiltroRegistroId(paramRegistroId);
    if (paramUsuario) setFiltroUsuario(paramUsuario);
  }, [searchParams]);

  function copiarTexto(data, tipo) {
    if (!data) return;
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      setCopiado(tipo);
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  function abrirDetalle(log) {
    const esSoloNuevo = ['INSERT', 'LOGOUT', 'ACCESO_DENEGADO', 'INTENTO_FALLIDO', 'PROCESO_AUTOMATICO', 'OPERACION_INVALIDA', 'DENIED'].includes(log.accion);
    setTabModal(esSoloNuevo ? 'nuevo' : (log.accion === 'DELETE' ? 'viejo' : 'comparar'));
    setCopiado(null);
    setDetalleLog(log);
  }

  // Cargar registros de audit_logs desde Supabase (RF-AUD-004)
  async function cargarBitacora() {
    setCargando(true);
    setError(null);
    try {
      const { data, error: errLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .order('fecha_hora', { ascending: false });

      if (errLogs) throw errLogs;

      const rawData = data || [];

      // Determinar la fecha más antigua conservada en la bitácora
      if (rawData.length > 0) {
        const fechas = rawData.map(r => new Date(r.fecha_hora).getTime()).filter(t => !isNaN(t));
        if (fechas.length > 0) {
          setFechaMasAntigua(new Date(Math.min(...fechas)));
        }
      }

      const formateados = rawData.map((l) => {
        let registroDesc = `ID: ${l.registro_id || '—'}`;
        const listaCambios = [];

        if (l.accion === 'INTENTO_FALLIDO') {
          registroDesc = l.registro_nuevo?.motivo || `Intento fallido de autenticación (${l.registro_nuevo?.email || l.usuario})`;
        } else if (l.accion === 'PROCESO_AUTOMATICO') {
          registroDesc = l.registro_nuevo?.evento || `Proceso automático del sistema (${l.tabla})`;
        } else if (l.accion === 'ACCESO_DENEGADO' || l.accion === 'OPERACION_INVALIDA' || l.accion === 'DENIED') {
          registroDesc = l.registro_nuevo?.motivo || l.registro_nuevo?.evento || `Operación denegada (${l.tabla})`;
        } else if (l.accion === 'LOGOUT') {
          registroDesc = `Cierre de sesión: ${l.registro_nuevo?.email || l.usuario}`;
        } else if (l.registro_nuevo?.evento) {
          registroDesc = l.registro_nuevo.destinatario_email 
            ? `${l.registro_nuevo.evento} (${l.registro_nuevo.destinatario_email})`
            : (l.registro_nuevo.email ? `${l.registro_nuevo.evento} (${l.registro_nuevo.email})` : l.registro_nuevo.evento);
        } else if (l.accion === 'UPDATE' && l.registro_viejo && l.registro_nuevo) {
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
          fechaIso: l.fecha_hora,
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

  // Presets rápidos para rangos de fecha
  function aplicarPresetFecha(preset) {
    setRangoPreset(preset);
    const ahora = new Date();
    const format = d => d.toISOString().slice(0, 10);

    if (preset === 'hoy') {
      const hoyStr = format(ahora);
      setFechaDesde(hoyStr);
      setFechaHasta(hoyStr);
    } else if (preset === '7dias') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFechaDesde(format(d));
      setFechaHasta(format(ahora));
    } else if (preset === '30dias') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFechaDesde(format(d));
      setFechaHasta(format(ahora));
    } else if (preset === 'esteMes') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      setFechaDesde(format(d));
      setFechaHasta(format(ahora));
    } else if (preset === 'todo') {
      setFechaDesde('');
      setFechaHasta('');
    }
  }

  // Restablecer todos los filtros
  function restablecerFiltros() {
    setFiltroUsuario('todos');
    setFiltroTabla('todos');
    setFiltroAccion('todas');
    setFiltroRegistroId('');
    setBusqueda('');
    setFechaDesde('');
    setFechaHasta('');
    setRangoPreset('todo');
    setSearchParams({});
    setPaginaActual(1);
  }

  // Exportar resultados de la consulta actual a formato CSV (RF-AUD-004 Flujo Alternativo 3)
  function exportarCsv() {
    if (logsFiltrados.length === 0) return;

    const headers = [
      'Fecha y Hora',
      'Usuario',
      'Acción',
      'Módulo / Tabla',
      'ID de Registro',
      'Detalle de la Operación',
      'Datos Anteriores (JSON)',
      'Datos Nuevos (JSON)'
    ];

    const csvRows = [headers.map(escapeCsvField).join(',')];

    logsFiltrados.forEach((l) => {
      const fila = [
        l.fechaHora,
        l.usuario,
        l.accion,
        l.modulo,
        l.registroId || '—',
        l.registroAfectado,
        l.detalleViejo ? JSON.stringify(l.detalleViejo) : '',
        l.detalleNuevo ? JSON.stringify(l.detalleNuevo) : ''
      ];
      csvRows.push(fila.map(escapeCsvField).join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bitacora_auditoria_fecovol_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const usuariosUnicos = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.usuario))).filter(Boolean);
  }, [logs]);

  const tablasUnicas = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.modulo))).filter(Boolean);
  }, [logs]);

  const accionesUnicas = useMemo(() => {
    const accionesBase = ['INSERT', 'UPDATE', 'DELETE', 'LOGOUT', 'ACCESO_DENEGADO', 'INTENTO_FALLIDO', 'PROCESO_AUTOMATICO'];
    const desdeLogs = logs.map(l => l.accion).filter(Boolean);
    return Array.from(new Set([...accionesBase, ...desdeLogs]));
  }, [logs]);

  // Filtrado compuesto multidimensional (RF-AUD-004)
  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      const matchUsuario = filtroUsuario === 'todos' || l.usuario === filtroUsuario;
      const matchTabla = filtroTabla === 'todos' || l.modulo === filtroTabla;
      const matchAccion = filtroAccion === 'todas' || l.accion === filtroAccion;
      const matchRegistroId = !filtroRegistroId || (l.registroId && l.registroId.toLowerCase().includes(filtroRegistroId.toLowerCase()));

      let matchFechaDesde = true;
      if (fechaDesde && l.fechaIso) {
        matchFechaDesde = new Date(l.fechaIso) >= new Date(`${fechaDesde}T00:00:00`);
      }

      let matchFechaHasta = true;
      if (fechaHasta && l.fechaIso) {
        matchFechaHasta = new Date(l.fechaIso) <= new Date(`${fechaHasta}T23:59:59.999`);
      }

      const matchBusqueda = busqueda === '' || 
        l.registroAfectado.toLowerCase().includes(busqueda.toLowerCase()) ||
        l.usuario.toLowerCase().includes(busqueda.toLowerCase()) ||
        l.modulo.toLowerCase().includes(busqueda.toLowerCase()) ||
        (l.registroId && l.registroId.toLowerCase().includes(busqueda.toLowerCase()));

      return matchUsuario && matchTabla && matchAccion && matchRegistroId && matchFechaDesde && matchFechaHasta && matchBusqueda;
    });
  }, [logs, filtroUsuario, filtroTabla, filtroAccion, filtroRegistroId, fechaDesde, fechaHasta, busqueda]);

  // Al cambiar cualquier filtro volvemos a la página 1
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroUsuario, filtroTabla, filtroAccion, filtroRegistroId, fechaDesde, fechaHasta, busqueda]);

  // Paginación de 10 registros
  const totalPaginas = Math.ceil(logsFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  const logsPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
    return logsFiltrados.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [logsFiltrados, paginaActual]);

  function getBadgeClass(accion) {
    if (accion === 'INSERT') return 'badge-status--activa';
    if (accion === 'DELETE' || accion === 'ACCESO_DENEGADO' || accion === 'OPERACION_INVALIDA' || accion === 'DENIED' || accion === 'INTENTO_FALLIDO') {
      return 'badge-status--suspendida';
    }
    if (accion === 'LOGOUT') return 'badge-status--logout';
    return 'badge-status--inactivo';
  }

  // Verificación de si el rango seleccionado excede la fecha más antigua conservada (Excepción 3)
  const excedeFechaDisponible = useMemo(() => {
    if (!fechaDesde || !fechaMasAntigua) return false;
    return new Date(`${fechaDesde}T00:00:00`) < fechaMasAntigua;
  }, [fechaDesde, fechaMasAntigua]);

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Auditoría y respaldos</h1>
          <p className="admin-page-header__subtitle">
            {logsFiltrados.length} {logsFiltrados.length === 1 ? 'evento filtrado' : 'eventos filtrados'} de {logs.length} totales en la bitácora
          </p>
        </div>
        <div className="admin-page-header__actions" style={{ display: 'flex', gap: '10px' }}>
          <button 
            type="button" 
            className="admin-btn admin-btn--secondary"
            onClick={cargarBitacora}
          >
            Refrescar bitácora
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={exportarCsv}
            disabled={logsFiltrados.length === 0}
            title="Exportar registros filtrados a formato CSV compatible con Excel"
          >
            Exportar a CSV ({logsFiltrados.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Banner de contexto: Llegada desde un registro afectado específico (RF-AUD-004 Criterio 2) */}
      {filtroRegistroId && (
        <div className="admin-banner" style={{
          marginBottom: '20px',
          background: '#eff6ff',
          borderColor: '#93c5fd',
          color: '#1e40af',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <strong>Filtro de registro activo:</strong> Mostrando el historial asociado al registro ID: <code>{filtroRegistroId}</code>
            {filtroTabla !== 'todos' && <span> en la entidad <strong>{filtroTabla}</strong></span>}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            style={{ padding: '4px 12px', fontSize: '0.78rem' }}
            onClick={() => {
              setFiltroRegistroId('');
              setSearchParams({});
            }}
          >
            Quitar filtro y ver toda la bitácora
          </button>
        </div>
      )}

      {/* Aviso informativo: La fecha consultada excede los registros conservados (RF-AUD-004 Excepción 3) */}
      {excedeFechaDisponible && fechaMasAntigua && (
        <div className="admin-banner" style={{
          marginBottom: '20px',
          background: '#fefce8',
          borderColor: '#fde047',
          color: '#854d0e'
        }}>
          <strong>Aviso de retención:</strong> El período seleccionado inicia antes de la fecha más antigua disponible en la bitácora. 
          Los registros del sistema se conservan a partir del <strong>{fechaMasAntigua.toLocaleDateString('es-CR')}</strong>.
        </div>
      )}

      {/* Barra de Filtros Primaria: Selectores y Búsqueda */}
      <div className="admin-filters-bar" style={{ marginBottom: '12px' }}>
        <select 
          className="admin-select"
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
          aria-label="Filtrar por usuario"
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
          aria-label="Filtrar por tabla o módulo"
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
          aria-label="Filtrar por acción"
        >
          <option value="todas">Acción: todas</option>
          {accionesUnicas.map(a => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <input 
          type="search"
          className="admin-input admin-input--search"
          placeholder="Buscar por texto, ID o descripción..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ minWidth: '260px' }}
        />
      </div>

      {/* Barra de Filtros Secundaria: Rango de Fechas y Presets (RF-AUD-004) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        background: '#f8fafc',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--borde, #e2e8f0)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--texto-suave, #64748b)' }}>
            Rango de fechas:
          </span>
          <input 
            type="date"
            className="admin-input"
            style={{ padding: '5px 8px', fontSize: '0.8rem', width: 'auto' }}
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              setRangoPreset('personalizado');
            }}
            title="Fecha desde"
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--texto-mudo, #94a3b8)' }}>hasta</span>
          <input 
            type="date"
            className="admin-input"
            style={{ padding: '5px 8px', fontSize: '0.8rem', width: 'auto' }}
            value={fechaHasta}
            onChange={(e) => {
              setFechaHasta(e.target.value);
              setRangoPreset('personalizado');
            }}
            title="Fecha hasta"
          />
        </div>

        {/* Botones de presets rápidos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'todo', label: 'Todo el historial' },
            { id: 'hoy', label: 'Hoy' },
            { id: '7dias', label: 'Últimos 7 días' },
            { id: '30dias', label: 'Últimos 30 días' },
            { id: 'esteMes', label: 'Este mes' }
          ].map(p => (
            <button
              key={p.id}
              type="button"
              className={`admin-btn ${rangoPreset === p.id ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
              onClick={() => aplicarPresetFecha(p.id)}
            >
              {p.label}
            </button>
          ))}

          {(filtroUsuario !== 'todos' || filtroTabla !== 'todos' || filtroAccion !== 'todas' || busqueda || fechaDesde || fechaHasta || filtroRegistroId) && (
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              style={{ padding: '4px 10px', fontSize: '0.74rem', marginLeft: 'auto', color: '#dc2626' }}
              onClick={restablecerFiltros}
            >
              Restablecer filtros
            </button>
          )}
        </div>
      </div>

      {/* Grid: Tabla de auditoría + Columna lateral */}
      <div className="admin-grid-layout">
        {/* Audit Log Table */}
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Bitácora de cambios</h2>
            <span className="admin-card__badge">{logsFiltrados.length} eventos</span>
          </div>

          {cargando ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
              Cargando bitácora…
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
                      <span className={`badge-status ${getBadgeClass(log.accion)}`}>
                        {log.accion.replace(/_/g, ' ')}
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
                
                {/* Estado vacío con sugerencia de ampliación de rango (RF-AUD-004 Excepción 1) */}
                {logsPaginados.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--texto-mudo)' }}>
                      <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                        <p style={{ fontWeight: 600, color: 'var(--texto)', marginBottom: '8px', fontSize: '0.95rem' }}>
                          No se encontraron eventos en la bitácora con los filtros aplicados
                        </p>
                        <p style={{ fontSize: '0.84rem', lineHeight: '1.45', marginBottom: '16px' }}>
                          Sugerencia: Intente ampliar el rango de fechas, cambiar la acción seleccionada o limpiar el término de búsqueda.
                        </p>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          onClick={restablecerFiltros}
                        >
                          Restablecer todos los filtros
                        </button>
                      </div>
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
              <p className="admin-side-card__subtitle">Respaldos diarios automáticos</p>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, color: 'var(--texto)', fontSize: '0.84rem' }}>Copia de seguridad</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>Gestionado por el proveedor de la base de datos</span>
                </div>
                <span className="badge-status badge-status--activa">
                  ACTIVO
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal: Ver Detalle JSON del Log (Solo lectura, con tabs y copia) */}
      {detalleLog && (
        <div className="admin-modal-overlay" onClick={() => setDetalleLog(null)}>
          <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <div>
                <h3 className="admin-modal__title">Detalle del registro de auditoría</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.8rem', color: 'var(--texto-mudo)', flexWrap: 'wrap' }}>
                  <span className={`badge-status ${getBadgeClass(detalleLog.accion)}`}>
                    {detalleLog.accion.replace(/_/g, ' ')}
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
              {/* Notificación informativa para operaciones denegadas, intentos fallidos o procesos automáticos */}
              {detalleLog.detalleNuevo?.evento && (
                <div style={{
                  marginBottom: '16px',
                  background: (detalleLog.accion === 'ACCESO_DENEGADO' || detalleLog.accion === 'INTENTO_FALLIDO' || detalleLog.accion === 'OPERACION_INVALIDA') ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${(detalleLog.accion === 'ACCESO_DENEGADO' || detalleLog.accion === 'INTENTO_FALLIDO' || detalleLog.accion === 'OPERACION_INVALIDA') ? '#fecaca' : '#cbd5e1'}`,
                  borderRadius: '6px',
                  padding: '12px 16px',
                  color: (detalleLog.accion === 'ACCESO_DENEGADO' || detalleLog.accion === 'INTENTO_FALLIDO' || detalleLog.accion === 'OPERACION_INVALIDA') ? '#991b1b' : '#1e293b'
                }}>
                  <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px' }}>
                    {detalleLog.detalleNuevo.evento}
                  </strong>
                  {detalleLog.detalleNuevo.motivo && (
                    <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                      <strong>Motivo:</strong> {detalleLog.detalleNuevo.motivo}
                    </div>
                  )}
                  {detalleLog.detalleNuevo.endpoint && (
                    <div style={{ fontSize: '0.78rem', marginTop: '2px', opacity: 0.9 }}>
                      <strong>Endpoint:</strong> <code>{detalleLog.detalleNuevo.endpoint}</code>
                    </div>
                  )}
                  {detalleLog.detalleNuevo.ip && (
                    <div style={{ fontSize: '0.78rem', marginTop: '2px', opacity: 0.9 }}>
                      <strong>Dirección IP:</strong> {detalleLog.detalleNuevo.ip}
                    </div>
                  )}
                </div>
              )}

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
                          {copiado === 'viejo' ? 'Copiado' : 'Copiar JSON'}
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
                {(detalleLog.accion !== 'DELETE' && (tabModal === 'comparar' || tabModal === 'nuevo')) && (
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                        Fila nueva / Evento (JSONB)
                      </label>
                      {detalleLog.detalleNuevo && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                          onClick={() => copiarTexto(detalleLog.detalleNuevo, 'nuevo')}
                        >
                          {copiado === 'nuevo' ? 'Copiado' : 'Copiar JSON'}
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
