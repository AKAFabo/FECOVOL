import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../admin/AdminCommon.css'; 
import { supabase } from '../../supabaseClient.js';
import { estadoCompetencia } from '../../utils/estadosCompetencia.js';
import Icono from '../../components/Icono.jsx'; 

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

const ESTILOS_SHAKE = `
  @keyframes shake {
    0% { transform: translateX(0); } 25% { transform: translateX(-5px); }
    50% { transform: translateX(5px); } 75% { transform: translateX(-5px); }
    100% { transform: translateX(0); }
  }
  .error-alerta-shake {
    background: #fee2e2; color: #991b1b; border: 1px solid #f87171;
    padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
    animation: shake 0.4s ease-in-out;
  }
`;

// Define los elementos por página
const ELEMENTOS_POR_PAGINA = 10;

export default function PersonalPanel({ basePath = '/personal' }) {
  const navigate = useNavigate();
  
  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [metricasGlobales, setMetricasGlobales] = useState({ resultados_pendientes: 0, solicitudes_reprogramacion: 0, partidos_sin_arbitro: 0 });
  // Métricas de cada competencia activa: el botón abre la primera que tenga casos de ese tipo.
  const [metricasPorCompetencia, setMetricasPorCompetencia] = useState([]);
  
  // Declara los estados de filtros
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroTemporada, setFiltroTemporada] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Declara los estados de paginación
  const [paginaActual, setPaginaActual] = useState(1);

  // Declara los estados del modal
  const [mostrarModal, setMostrarModal] = useState(false);
  const [competenciaEditando, setCompetenciaEditando] = useState(null);
  const [errorModal, setErrorModal] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [formData, setFormData] = useState({
    name: '', season: '2026', category_code: 'MAYOR', branch_code: 'FEM', modality_code: 'SALA',
    start_date: '', end_date: '', status: 'PLANIFICACION',
    max_teams: 12, registration_deadline: '',
    min_roster: 12, max_roster: 18,
    points_win_3_0: 3, points_win_3_2: 2, points_loss_2_3: 1, points_loss_0_3: 0
  });

  // Declara los estados del modal de archivado
  const [modalArchivar, setModalArchivar] = useState(false);
  const [compArchivar, setCompArchivar] = useState(null);
  const [cargandoArchivar, setCargandoArchivar] = useState(false);
  const [errorArchivar, setErrorArchivar] = useState('');
  const [shakeKeyArchivar, setShakeKeyArchivar] = useState(0);

  // Carga las competencias y las métricas al montar el componente
  useEffect(() => {
    cargarCompetencias();
  }, []);

  async function cargarCompetencias() {
    setCargando(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/competitions`);
      if (!res.ok) throw new Error('Error al cargar competencias');
      const json = await res.json();
      const lista = json.data || [];
      setCompetencias(lista);
      await cargarMetricasGlobales(lista, backendUrl);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las competencias. Verifica la conexión con el backend.');
    } finally {
      setCargando(false);
    }
  }

  // Calcula las métricas globales sumando todas las competencias activas
  async function cargarMetricasGlobales(lista, backendUrl) {
    const { data: { user } } = await supabase.auth.getUser();
    const activas = lista.filter(c => ['EN_CURSO', 'INSCRIPCIONES', 'PLANIFICACION'].includes(c.status));
    let totalPendientes = 0, totalSolicitudes = 0, totalSinArbitro = 0;
    const porCompetencia = [];

    for (const comp of activas) {
      try {
        const res = await fetch(`${backendUrl}/api/competitions/${comp.id}/metrics`, {
          headers: { 'x-user-email': user?.email || '' }
        });
        if (res.ok) {
          const json = await res.json();
          totalPendientes += json.data?.resultados_pendientes || 0;
          totalSolicitudes += json.data?.solicitudes_reprogramacion || 0;
          totalSinArbitro += json.data?.partidos_sin_arbitro || 0;
          porCompetencia.push({ id: comp.id, ...json.data });
        }
      } catch (e) {}
    }

    setMetricasPorCompetencia(porCompetencia);
    setMetricasGlobales({
      resultados_pendientes: totalPendientes,
      solicitudes_reprogramacion: totalSolicitudes,
      partidos_sin_arbitro: totalSinArbitro
    });
  }

  const showModalError = (msg) => { setErrorModal(msg); setShakeKey(prev => prev + 1); };

  // Abre Resultados o Calendario ya filtrados, en la primera competencia con casos de ese tipo.
  const abrirFiltrado = (pagina, metrica, filtro) => {
    const conCasos = metricasPorCompetencia.find((m) => (m[metrica] || 0) > 0);
    const params = new URLSearchParams({ filtro });
    if (conCasos) params.set('competencia', conCasos.id);
    navigate(`${basePath}/${pagina}?${params.toString()}`);
  };

  const abrirModalCrear = () => {
    setCompetenciaEditando(null);
    setFormData({
      name: '', season: '2026', category_code: 'MAYOR', branch_code: 'FEM', modality_code: 'SALA',
      start_date: '', end_date: '', status: 'PLANIFICACION',
      max_teams: 12, registration_deadline: '',
      min_roster: 12, max_roster: 18,
      points_win_3_0: 3, points_win_3_2: 2, points_loss_2_3: 1, points_loss_0_3: 0
    });
    setErrorModal('');
    setMostrarModal(true);
  };

  const abrirModalEditar = (comp) => {
    setCompetenciaEditando(comp);
    setFormData({
      name: comp.name, season: comp.season,
      category_code: comp.categoria?.code || 'MAYOR',
      branch_code: comp.rama?.code || 'FEM',
      modality_code: comp.modalidad?.code || 'SALA',
      start_date: comp.start_date, end_date: comp.end_date, status: comp.status,
      max_teams: comp.max_teams ?? 12,
      registration_deadline: comp.registration_deadline || '',
      min_roster: comp.min_roster ?? 12,
      max_roster: comp.max_roster ?? 18,
      points_win_3_0: comp.points_win_3_0 ?? 3,
      points_win_3_2: comp.points_win_3_2 ?? 2,
      points_loss_2_3: comp.points_loss_2_3 ?? 1,
      points_loss_0_3: comp.points_loss_0_3 ?? 0
    });
    setErrorModal('');
    setMostrarModal(true);
  };

  async function handleGuardarCompetencia(e) {
    e.preventDefault();
    setErrorModal('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const esEdicion = Boolean(competenciaEditando);
      const url = esEdicion ? `${backendUrl}/api/competitions/${competenciaEditando.id}` : `${backendUrl}/api/competitions`;
      const method = esEdicion ? 'PATCH' : 'POST';
      const payload = { ...formData };
      if (esEdicion) { delete payload.category_code; delete payload.branch_code; delete payload.modality_code; }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Error al guardar la competencia'); }
      setMostrarModal(false); setErrorModal(''); cargarCompetencias();
    } catch (err) { showModalError(err.message); }
  }

  const abrirModalArchivar = (comp) => { setCompArchivar(comp); setErrorArchivar(''); setModalArchivar(true); };

  async function handleArchivarCompetencia(e) {
    if (e) e.preventDefault();
    setErrorArchivar(''); setCargandoArchivar(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const res = await fetch(`${backendUrl}/api/competitions/${compArchivar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify({ status: 'CERRADA' })
      });
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || 'Error al archivar la competencia'); }
      setModalArchivar(false); cargarCompetencias();
    } catch (err) {
      setErrorArchivar(err.message); setShakeKeyArchivar(prev => prev + 1);
    } finally { setCargandoArchivar(false); }
  }

  // Filtra las competencias
  const temporadasDisponibles = [...new Set(competencias.map(c => c.season))].sort().reverse();
  const competenciasFiltradas = competencias.filter(c => {
    const matchNombre = c.name.toLowerCase().includes(filtroNombre.toLowerCase());
    const matchTemporada = filtroTemporada === 'todas' || c.season === filtroTemporada;
    const matchEstado = filtroEstado === 'todos' || c.status === filtroEstado;
    return matchNombre && matchTemporada && matchEstado;
  });

  // Calcula la paginación
  const totalPaginas = Math.ceil(competenciasFiltradas.length / ELEMENTOS_POR_PAGINA) || 1;
  const competenciasPaginadas = competenciasFiltradas.slice(
    (paginaActual - 1) * ELEMENTOS_POR_PAGINA,
    paginaActual * ELEMENTOS_POR_PAGINA
  );

  // Reinicia la página al cambiar los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroNombre, filtroTemporada, filtroEstado]);

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>

      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Competencias y Resultados</h1>
          <p className="admin-page-header__subtitle">Gestión de torneos, inscripciones y calendario oficial.</p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={abrirModalCrear}>Nueva competencia</button>
        </div>
      </div>

      {error && <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>{error}</div>}

      {/* Barra de filtros */}
      <div className="admin-filters-bar">
        <input type="search" className="admin-input admin-input--search" placeholder="Buscar competencia por nombre..." value={filtroNombre} onChange={(e) => setFiltroNombre(e.target.value)} />
        <select className="admin-select" value={filtroTemporada} onChange={(e) => setFiltroTemporada(e.target.value)}>
          <option value="todas">Temporada: todas</option>
          {temporadasDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Estado: todos</option>
          <option value="PLANIFICACION">Planificación</option>
          <option value="INSCRIPCIONES">Inscripciones</option>
          <option value="EN_CURSO">En Curso</option>
          <option value="FINALIZADA">Finalizada</option>
          <option value="CERRADA">Cerrada / Archivada</option>
        </select>
      </div>

      {/* Tabla de competencias con scroll horizontal y paginación */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h2 className="admin-card__title">Listado de competencias</h2>
          <span className="admin-card__badge">{competenciasFiltradas.length} torneos</span>
        </div>

        {cargando ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando competencias...</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="admin-table" style={{ minWidth: '1000px' }}>
                <thead>
                  <tr>
                    <th>Competencia</th>
                    <th>Temporada</th>
                    <th>Categoría</th>
                    <th>Rama</th>
                    <th>Equipos</th>
                    <th>Jornadas</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {competenciasPaginadas.map((comp) => (
                    <tr key={comp.id} style={{ opacity: comp.status === 'CERRADA' ? 0.6 : 1 }}>
                      <td>
                        <strong style={{ color: 'var(--texto)' }}>{comp.name}</strong>
                        {comp.jornadas_count > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
                            Jornada {comp.jornadas_jugadas || 0} de {comp.jornadas_count}
                          </div>
                        )}
                      </td>
                      <td>{comp.season}</td>
                      <td>{comp.categoria?.value || '—'}</td>
                      <td>{comp.rama?.value || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{comp.equipos_count || 0}</td>
                      <td style={{ fontWeight: 600 }}>{comp.jornadas_count || 0}</td>
                      <td>
                        <span className={estadoCompetencia(comp.status).clase}>{estadoCompetencia(comp.status).texto}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => navigate(`${basePath}/competencia/${comp.id}`)}>Gestionar</button>
                          <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => abrirModalEditar(comp)}>Editar</button>
                          {comp.status !== 'CERRADA' && (
                            <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => abrirModalArchivar(comp)}>Archivar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {competenciasPaginadas.length === 0 && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>No hay competencias que coincidan con los filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Controles de paginación */}
            <div className="admin-table-footer">
              <span>Mostrando {competenciasPaginadas.length} de {competenciasFiltradas.length} competencias</span>
              <div className="admin-pagination-links">
                <button type="button" onClick={() => setPaginaActual(p => Math.max(p - 1, 1))} disabled={paginaActual <= 1}>&lt; Anterior</button>
                <span style={{ fontSize: '0.78rem', padding: '0 8px' }}>Página {paginaActual} de {totalPaginas}</span>
                <button type="button" onClick={() => setPaginaActual(p => Math.min(p + 1, totalPaginas))} disabled={paginaActual >= totalPaginas}>Siguiente &gt;</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tarjetas de resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #c8102e' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#c8102e', fontFamily: 'var(--fuente-titulo)' }}>{metricasGlobales.resultados_pendientes}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>Resultados pendientes de registrar</div>
          <div style={{ marginTop: '12px' }}>
            <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => abrirFiltrado('resultados', 'resultados_pendientes', 'pendientes')}>Registrar ahora →</button>
          </div>
        </div>
        <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #a8501f' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a8501f', fontFamily: 'var(--fuente-titulo)' }}>{metricasGlobales.solicitudes_reprogramacion}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>Solicitudes de reprogramación</div>
          <div style={{ marginTop: '12px' }}>
            <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => abrirFiltrado('calendario', 'solicitudes_reprogramacion', 'reprogramacion')}>Revisar →</button>
          </div>
        </div>
        <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #0e3b6b' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0e3b6b', fontFamily: 'var(--fuente-titulo)' }}>{metricasGlobales.partidos_sin_arbitro}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>Partidos sin árbitro designado</div>
          <div style={{ marginTop: '12px' }}>
            <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => abrirFiltrado('calendario', 'partidos_sin_arbitro', 'sin-arbitro')}>Revisar →</button>
          </div>
        </div>
      </div>

      {/* Modal Crear / Editar */}
      {mostrarModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '720px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">{competenciaEditando ? 'Editar competencia' : 'Crear competencia'}</h3>
              <button type="button" className="admin-modal__close" onClick={() => setMostrarModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleGuardarCompetencia}>
              <div className="admin-modal__body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre *</label>
                  <input type="text" required className="campo__input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo"><label className="campo__etiqueta">Temporada *</label><input type="text" required className="campo__input" value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} /></div>
                  <div className="campo">
                    <label className="campo__etiqueta">Estado</label>
                    <select className="admin-select" style={{ width: '100%' }} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                      <option value="PLANIFICACION">Planificación</option>
                      <option value="INSCRIPCIONES">Inscripciones</option>
                      <option value="EN_CURSO">En Curso</option>
                      <option value="FINALIZADA">Finalizada</option>
                      <option value="CERRADA">Cerrada / Archivada</option>
                    </select>
                  </div>
                </div>
                {!competenciaEditando && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div className="campo">
                      <label className="campo__etiqueta">Categoría</label>
                      <select className="admin-select" style={{ width: '100%' }} value={formData.category_code} onChange={e => setFormData({...formData, category_code: e.target.value})}>
                        <option value="MAYOR">Mayor</option><option value="U21">Sub-21</option><option value="U19">Sub-19</option><option value="U17">Sub-17</option><option value="U15">Sub-15</option>
                      </select>
                    </div>
                    <div className="campo">
                      <label className="campo__etiqueta">Rama</label>
                      <select className="admin-select" style={{ width: '100%' }} value={formData.branch_code} onChange={e => setFormData({...formData, branch_code: e.target.value})}>
                        <option value="FEM">Femenina</option><option value="MAS">Masculina</option><option value="MIX">Mixta</option>
                      </select>
                    </div>
                    <div className="campo">
                      <label className="campo__etiqueta">Modalidad</label>
                      <select className="admin-select" style={{ width: '100%' }} value={formData.modality_code} onChange={e => setFormData({...formData, modality_code: e.target.value})}>
                        <option value="SALA">Sala</option><option value="PLAYA">Playa</option>
                      </select>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo"><label className="campo__etiqueta">Fecha Inicio *</label><input type="date" required className="campo__input" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} /></div>
                  <div className="campo"><label className="campo__etiqueta">Fecha Fin *</label><input type="date" required className="campo__input" value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Cupo máximo de equipos</label>
                    <input type="number" min="1" className="campo__input" value={formData.max_teams} onChange={e => setFormData({ ...formData, max_teams: e.target.value })} placeholder="Ej. 12" />
                    <small style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>Límite al inscribir equipos.</small>
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Cierre de inscripciones</label>
                    <input type="date" className="campo__input" value={formData.registration_deadline || ''} onChange={e => setFormData({ ...formData, registration_deadline: e.target.value })} />
                    <small style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>Si se deja vacío, se usa la fecha de inicio.</small>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Mínimo de integrantes en nómina</label>
                    <input type="number" min="1" className="campo__input" value={formData.min_roster} onChange={e => setFormData({ ...formData, min_roster: e.target.value })} placeholder="Ej. 12" />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Máximo de integrantes en nómina</label>
                    <input type="number" min="1" className="campo__input" value={formData.max_roster} onChange={e => setFormData({ ...formData, max_roster: e.target.value })} placeholder="Ej. 18" />
                  </div>
                </div>
                <div style={{ marginTop: '6px', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-mudo)' }}>
                  Reglas de puntuación
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Victoria 3-0 o 3-1</label>
                    <input type="number" min="0" step="0.5" className="campo__input" value={formData.points_win_3_0} onChange={e => setFormData({ ...formData, points_win_3_0: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Victoria 3-2</label>
                    <input type="number" min="0" step="0.5" className="campo__input" value={formData.points_win_3_2} onChange={e => setFormData({ ...formData, points_win_3_2: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Derrota 2-3</label>
                    <input type="number" min="0" step="0.5" className="campo__input" value={formData.points_loss_2_3} onChange={e => setFormData({ ...formData, points_loss_2_3: e.target.value })} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Derrota 0-3 o 1-3</label>
                    <input type="number" min="0" step="0.5" className="campo__input" value={formData.points_loss_0_3} onChange={e => setFormData({ ...formData, points_loss_0_3: e.target.value })} />
                  </div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid var(--linea)', borderRadius: '6px', padding: '10px 14px', fontSize: '0.8rem', color: 'var(--texto-mudo)', lineHeight: 1.5 }}>
                  Desempates: puntos totales → ratio de sets → ratio de puntos. Se aplican automáticamente en la tabla de posiciones.
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorModal && <div key={shakeKey} className="error-alerta-shake">{errorModal}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setMostrarModal(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--primary">{competenciaEditando ? 'Guardar cambios' : 'Crear competencia'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Archivar */}
      {modalArchivar && compArchivar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Archivar competencia</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalArchivar(false)}>&times;</button>
            </div>
            <form onSubmit={handleArchivarCompetencia}>
              <div className="admin-modal__body">
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icono nombre="alerta" tam={22} /></div>
                  <div>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: 'var(--texto)', fontSize: '0.98rem' }}>¿Estás seguro de archivar «{compArchivar.name}»?</p>
                    <p style={{ margin: 0, color: 'var(--texto-mudo)', fontSize: '0.85rem', lineHeight: '1.45' }}>La competencia pasará a estado <strong>Cerrada / Archivada</strong>. No se borrará y todo su historial se conservará intacto, pero ya no podrás inscribir más equipos ni programar partidos.</p>
                  </div>
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorArchivar && <div key={shakeKeyArchivar} className="error-alerta-shake">{errorArchivar}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalArchivar(false)} disabled={cargandoArchivar}>Cancelar</button>
                  <button type="submit" className="admin-btn" style={{ backgroundColor: '#dc2626', color: '#fff', borderColor: '#b91c1c' }} disabled={cargandoArchivar}>{cargandoArchivar ? 'Archivando...' : 'Sí, archivar competencia'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}