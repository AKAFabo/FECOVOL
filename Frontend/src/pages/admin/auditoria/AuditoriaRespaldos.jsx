import { useState, useMemo } from 'react';
import '../AdminCommon.css';

const AUDITORIA_MOCK = [
  {
    id: 'a1',
    fechaHora: 'Hoy 14:20',
    usuario: 'Gabriela Rojas',
    accion: 'Corrección oficial',
    modulo: 'Personas',
    registroAfectado: 'María F. Rojas · nacimiento 2002 → 2001',
    detalleViejo: { nacimiento: '2002-05-14' },
    detalleNuevo: { nacimiento: '2001-05-14' }
  },
  {
    id: 'a2',
    fechaHora: 'Hoy 11:05',
    usuario: 'Luis Mora',
    accion: 'Envío de nómina',
    modulo: 'Asociaciones',
    registroAfectado: 'AD Cartago Mayor F · 16 integrantes',
    detalleViejo: null,
    detalleNuevo: { equipo: 'AD Cartago Mayor F', integrantes: 16, estado: 'ENVIADA' }
  },
  {
    id: 'a3',
    fechaHora: 'Hoy 09:12',
    usuario: 'Andrés Vargas',
    accion: 'Reprogramación',
    modulo: 'Competencias',
    registroAfectado: 'Partido #223 · sáb → dom',
    detalleViejo: { fecha: '2026-09-19', hora: '18:00' },
    detalleNuevo: { fecha: '2026-09-20', hora: '10:00' }
  },
  {
    id: 'a4',
    fechaHora: 'Ayer 21:38',
    usuario: 'Marta Vega',
    accion: 'Cierre de partido',
    modulo: 'Arbitraje',
    registroAfectado: 'Partido #214 · acta enviada',
    detalleViejo: { estado: 'PROGRAMADO' },
    detalleNuevo: { estado: 'JUGADO', sets: '3-1', acta_adjunta: true }
  },
  {
    id: 'a5',
    fechaHora: 'Ayer 18:40',
    usuario: 'Luis Mora',
    accion: 'Alta de persona',
    modulo: 'Personas',
    registroAfectado: 'Melissa Chaves Soto',
    detalleViejo: null,
    detalleNuevo: { nombre: 'Melissa Chaves Soto', cedula: '1-1544-0988', rol: 'Jugadora' }
  },
  {
    id: 'a6',
    fechaHora: 'Ayer 16:02',
    usuario: 'Gabriela Rojas',
    accion: 'Cambio de permisos',
    modulo: 'Seguridad',
    registroAfectado: 'R. Baltodano · cuenta suspendida',
    detalleViejo: { status: 'ACTIVA' },
    detalleNuevo: { status: 'SUSPENDIDA' }
  },
  {
    id: 'a7',
    fechaHora: '11 set 22:10',
    usuario: 'Laura Campos',
    accion: 'Registro de incidente',
    modulo: 'Incidentes',
    registroAfectado: 'EXP-2026-07 · tarjeta roja',
    detalleViejo: null,
    detalleNuevo: { expediente: 'EXP-2026-07', tipo: 'Tarjeta roja', sancion: '1 partido' }
  }
];

const RESPALDOS_MOCK = [
  { id: 'r1', fecha: 'Hoy 03:00', tamano: '412 MB', estado: 'CORRECTO' },
  { id: 'r2', fecha: 'Ayer 03:00', tamano: '409 MB', estado: 'CORRECTO' },
  { id: 'r3', fecha: '15 set 03:00', tamano: '407 MB', estado: 'CORRECTO' },
  { id: 'r4', fecha: '14 set 03:00', tamano: '—', estado: 'FALLÓ' },
  { id: 'r5', fecha: '13 set 03:00', tamano: '404 MB', estado: 'CORRECTO' }
];

export default function AuditoriaRespaldos() {
  const [logs] = useState(AUDITORIA_MOCK);
  const [respaldos, setRespaldos] = useState(RESPALDOS_MOCK);
  
  // Filtros
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [filtroAccion, setFiltroAccion] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  // Modal para inspeccionar detalle de registro (JSONB)
  const [detalleLog, setDetalleLog] = useState(null);

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      const matchUsuario = filtroUsuario === 'todos' || l.usuario === filtroUsuario;
      const matchModulo = filtroModulo === 'todos' || l.modulo === filtroModulo;
      const matchAccion = filtroAccion === 'todas' || l.accion === filtroAccion;
      const matchBusqueda = busqueda === '' || 
        l.registroAfectado.toLowerCase().includes(busqueda.toLowerCase()) ||
        l.usuario.toLowerCase().includes(busqueda.toLowerCase());
      return matchUsuario && matchModulo && matchAccion && matchBusqueda;
    });
  }, [logs, filtroUsuario, filtroModulo, filtroAccion, busqueda]);

  const handleGenerarRespaldo = () => {
    const nuevo = {
      id: `r-${Date.now()}`,
      fecha: 'Ahora mismo',
      tamano: '415 MB',
      estado: 'CORRECTO'
    };
    setRespaldos([nuevo, ...respaldos]);
  };

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Auditoría y respaldos</h1>
          <p className="admin-page-header__subtitle">12 480 registros en el periodo</p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary">
            Exportar bitácora
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={handleGenerarRespaldo}
          >
            Generar respaldo ahora
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="admin-filters-bar">
        <select 
          className="admin-select"
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
        >
          <option value="todos">Usuario: todos</option>
          <option value="Gabriela Rojas">Gabriela Rojas</option>
          <option value="Andrés Vargas">Andrés Vargas</option>
          <option value="Luis Mora">Luis Mora</option>
          <option value="Marta Vega">Marta Vega</option>
          <option value="Laura Campos">Laura Campos</option>
        </select>

        <select 
          className="admin-select"
          value={filtroModulo}
          onChange={(e) => setFiltroModulo(e.target.value)}
        >
          <option value="todos">Módulo: todos</option>
          <option value="Personas">Personas</option>
          <option value="Asociaciones">Asociaciones</option>
          <option value="Competencias">Competencias</option>
          <option value="Arbitraje">Arbitraje</option>
          <option value="Seguridad">Seguridad</option>
          <option value="Incidentes">Incidentes</option>
        </select>

        <select 
          className="admin-select"
          value={filtroAccion}
          onChange={(e) => setFiltroAccion(e.target.value)}
        >
          <option value="todas">Acción: todas</option>
          <option value="Corrección oficial">Corrección oficial</option>
          <option value="Envío de nómina">Envío de nómina</option>
          <option value="Reprogramación">Reprogramación</option>
          <option value="Cierre de partido">Cierre de partido</option>
          <option value="Alta de persona">Alta de persona</option>
          <option value="Cambio de permisos">Cambio de permisos</option>
          <option value="Registro de incidente">Registro de incidente</option>
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
            <span className="admin-card__badge">{logsFiltrados.length} registros</span>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Módulo</th>
                <th>Registro afectado</th>
                <th style={{ textAlign: 'right' }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{log.fechaHora}</td>
                  <td style={{ color: 'var(--texto)', fontWeight: 600 }}>{log.usuario}</td>
                  <td><strong>{log.accion}</strong></td>
                  <td>{log.modulo}</td>
                  <td>{log.registroAfectado}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      type="button" 
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => setDetalleLog(log)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {logsFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                    No hay eventos de bitácora que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="admin-table-footer">
            <span>Mostrando {logsFiltrados.length} de {logs.length} registros del periodo</span>
            <div className="admin-pagination-links">
              <button type="button" disabled>&lt; Anterior</button>
              <button type="button" disabled>Siguiente &gt;</button>
            </div>
          </div>
        </div>

        {/* Sidebar: Backups & Retention policy */}
        <div>
          {/* Backups card */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Respaldos</h2>
              <p className="admin-side-card__subtitle">Automático diario a las 03:00</p>
            </div>
            <ul className="admin-side-card__list">
              {respaldos.map((r) => (
                <li key={r.id} className="admin-side-card__item">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, color: 'var(--texto)', fontSize: '0.84rem' }}>{r.fecha}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>{r.tamano}</span>
                  </div>
                  <span className={`badge-status ${r.estado === 'CORRECTO' ? 'badge-status--activa' : 'badge-status--suspendida'}`} style={{ color: r.estado === 'FALLÓ' ? '#b91c1c' : undefined, background: r.estado === 'FALLÓ' ? '#fee2e2' : undefined }}>
                    {r.estado}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Retention Policy */}
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
                <strong style={{ color: 'var(--texto)', fontSize: '0.82rem' }}>Almacenamiento FECOVOL</strong>
              </li>
            </ul>
          </div>

          {/* Warning Banner */}
          <div className="admin-banner" style={{ background: '#fff7ed', borderColor: '#ea580c' }}>
            <strong style={{ display: 'block', marginBottom: '2px', color: '#c2410c' }}>
              EL RESPALDO DEL 14 DE SETIEMBRE FALLÓ
            </strong>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#9a3412' }}>
              Espacio insuficiente en el destino. Conviene revisarlo antes del próximo cierre de jornada.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Ver Detalle JSON del Log */}
      {detalleLog && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
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
                <strong style={{ fontSize: '0.88rem', display: 'block', color: 'var(--texto)' }}>
                  {detalleLog.accion} en {detalleLog.modulo}
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                  Por {detalleLog.usuario} · {detalleLog.fechaHora}
                </span>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                  Registro afectado
                </label>
                <p style={{ fontSize: '0.9rem', color: 'var(--texto)', marginTop: '2px' }}>
                  {detalleLog.registroAfectado}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                    Valor anterior (JSONB)
                  </label>
                  <pre style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', fontSize: '0.75rem', overflow: 'auto', border: '1px solid var(--linea)' }}>
                    {detalleLog.detalleViejo ? JSON.stringify(detalleLog.detalleViejo, null, 2) : '(Ninguno - INSERT)'}
                  </pre>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                    Valor nuevo (JSONB)
                  </label>
                  <pre style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', fontSize: '0.75rem', overflow: 'auto', border: '1px solid var(--linea)' }}>
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
