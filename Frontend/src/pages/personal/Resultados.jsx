import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import '../admin/AdminCommon.css';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

export default function Resultados() {
  const navigate = useNavigate();

  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [competenciaSeleccionada, setCompetenciaSeleccionada] = useState('');
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Declara los estados de filtros
  const [filtroJornada, setFiltroJornada] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Carga las competencias activas al montar
  useEffect(() => {
    async function cargarCompetencias() {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/competitions`);
      const json = await res.json();
      const lista = (json.data || []).filter(c => ['EN_CURSO', 'INSCRIPCIONES'].includes(c.status));
      setCompetencias(lista);
      if (lista.length > 0 && !competenciaSeleccionada) setCompetenciaSeleccionada(lista[0].id);
    }
    cargarCompetencias();
  }, []);

  // Carga los partidos cuando cambia la competencia
  useEffect(() => {
    if (competenciaSeleccionada) cargarPartidos();
  }, [competenciaSeleccionada]);

  async function cargarPartidos() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${backendUrl}/api/matches?competition_id=${competenciaSeleccionada}`);
      if (res.ok) setPartidos((await res.json()).data || []);
    } catch (err) {
      console.error('Error cargando partidos:', err);
    } finally {
      setCargando(false);
    }
  }

  // Filtra los partidos
  const jornadas = [...new Set(partidos.map(p => p.matchday))].sort((a, b) => a - b);

  const partidosFiltrados = partidos.filter(p => {
    const matchJornada = filtroJornada === 'todas' || p.matchday === parseInt(filtroJornada);
    const matchEstado = filtroEstado === 'todos' || p.status === filtroEstado;
    return matchJornada && matchEstado;
  });

  // Cuenta los pendientes
  const pendientes = partidos.filter(p => p.status === 'PROGRAMADO').length;

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Resultados</h1>
          <p className="admin-page-header__subtitle">Registro y validación de resultados por competencia.</p>
        </div>
        <div className="admin-page-header__actions">
          <select className="admin-select" value={competenciaSeleccionada} onChange={(e) => setCompetenciaSeleccionada(e.target.value)} style={{ minWidth: '260px' }}>
            <option value="">Selecciona una competencia</option>
            {competencias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {!competenciaSeleccionada ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
          Selecciona una competencia para ver sus resultados.
        </div>
      ) : cargando ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando partidos...</div>
      ) : (
        <>
          {pendientes > 0 && (
            <div className="admin-card" style={{ padding: '16px 20px', marginBottom: '24px', borderLeft: '4px solid #c8102e', background: '#fef2f2' }}>
              <strong style={{ color: '#991b1b', fontSize: '0.92rem' }}>
                Hay {pendientes} {pendientes === 1 ? 'partido pendiente' : 'partidos pendientes'} de registrar resultado.
              </strong>
            </div>
          )}

          <div className="admin-filters-bar">
            <select className="admin-select" value={filtroJornada} onChange={(e) => setFiltroJornada(e.target.value)}>
              <option value="todas">Jornada: todas</option>
              {jornadas.map(j => <option key={j} value={j}>Jornada {j}</option>)}
            </select>
            <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="todos">Estado: todos</option>
              <option value="PROGRAMADO">Programado (pendiente de resultado)</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="SUSPENDIDO">Suspendido</option>
            </select>
          </div>

          <div className="admin-card">
            <div className="admin-card__header">
              <h2 className="admin-card__title">Listado de partidos</h2>
              <span className="admin-card__badge">{partidosFiltrados.length} partidos</span>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Partido</th>
                  <th>Jornada</th>
                  <th>Fecha / Hora</th>
                  <th>Estado</th>
                  <th>Acta</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {partidosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ color: 'var(--texto)' }}>{p.local?.name} vs {p.visitante?.name}</strong>
                      {p.match_number && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>Partido #{p.match_number}</div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.matchday}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>{formatearFecha(p.scheduled_date)} {p.scheduled_time}</td>
                    <td>
                      <span className={`badge-status ${p.status === 'FINALIZADO' ? 'badge-status--activa' : p.status === 'PROGRAMADO' ? 'badge-status--inactivo' : ''}`}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <span className={`badge-status ${p.acta_status === 'VALIDADA' ? 'badge-status--activa' : p.acta_status === 'ENVIADA' ? 'badge-status--inactivo' : 'badge-status--suspendida'}`}>
                        {p.acta_status || 'BORRADOR'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => navigate(`/personal/resultados/${p.id}`)}>
                        {p.status === 'FINALIZADO' ? 'Ver / Editar' : 'Registrar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {partidosFiltrados.length === 0 && (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>No hay partidos que coincidan con los filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}