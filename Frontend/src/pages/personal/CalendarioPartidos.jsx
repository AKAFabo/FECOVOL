import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import '../admin/AdminCommon.css';
import GenerarCalendarioModal from '../../components/GenerarCalendarioModal.jsx';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

// Extrae el texto de arbitraje de un partido
function getArbitrajeText(partido) {
  const asignaciones = (partido.arbitraje || []).filter(a => a.status !== 'ANULADA' && a.status !== 'RECHAZADA');
  if (asignaciones.length === 0) return 'Sin designar';
  const principal = asignaciones.find(a => a.puesto?.code === 'PRI');
  const otros = asignaciones.length - 1;
  if (principal) {
    const inicial = principal.arbitro?.first_name?.charAt(0) || '';
    const apellido = principal.arbitro?.last_name?.split(' ')[0] || '';
    const nombre = `${inicial}. ${apellido}`;
    return otros > 0 ? `${nombre} (+${otros})` : nombre;
  }
  return `${asignaciones.length} oficial${asignaciones.length > 1 ? 'es' : ''}`;
}

// Define las clases de badge según el estado del partido
const getBadgeClass = (status) => {
  if (status === 'FINALIZADO') return 'badge-status--activa';
  if (status === 'PROGRAMADO' || status === 'REPROGRAMADO') return 'badge-status--inactivo';
  if (status === 'SUSPENDIDO' || status === 'CANCELADO') return 'badge-status--suspendida';
  return '';
};

// Define los estilos para la animación de temblor y los banners inline
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
  .exito-alerta-inline {
    background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
    padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
  }
`;

export default function CalendarioPartidos() {
  const navigate = useNavigate();

  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [competenciaSeleccionada, setCompetenciaSeleccionada] = useState('');
  const [partidos, setPartidos] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Declara los estados de filtros y vista
  const [filtroJornada, setFiltroJornada] = useState('todas');
  const [filtroSede, setFiltroSede] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState('lista');

  // Declara los estados de mensajes inline (fuera de modales)
  const [mensajeInline, setMensajeInline] = useState({ tipo: '', texto: '' });
  const [shakeKeyInline, setShakeKeyInline] = useState(0);

  // Declara los estados del modal de rechazo
  const [modalRechazo, setModalRechazo] = useState(false);
  const [solicitudRechazo, setSolicitudRechazo] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorRechazo, setErrorRechazo] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  // Declara los estados del modal de generación automática
  const [modalGenerar, setModalGenerar] = useState(false);
  const [modalConfirmarRegenerar, setModalConfirmarRegenerar] = useState(false);

  // Declara los estados del modal de editar partido (hora + sede)
  const [partidoEditando, setPartidoEditando] = useState(null);
  const [editHora, setEditHora] = useState('');
  const [editSedeId, setEditSedeId] = useState('');
  const [errorEditarPartido, setErrorEditarPartido] = useState('');
  const [shakeKeyEditarPartido, setShakeKeyEditarPartido] = useState(0);

  // Declara los estados del modal de editar jornada (fecha)
  const [jornadaEditando, setJornadaEditando] = useState(null);
  const [editFechaJornada, setEditFechaJornada] = useState('');
  const [errorEditarJornada, setErrorEditarJornada] = useState('');
  const [shakeKeyEditarJornada, setShakeKeyEditarJornada] = useState(0);

  // Declara el catálogo de sedes
  const [sedesCatalogo, setSedesCatalogo] = useState([]);

  // Carga las competencias al montar
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

  // Carga el catálogo de sedes al montar
  useEffect(() => {
    async function cargarSedes() {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${backendUrl}/api/catalogs/Sedes/values`);
        if (res.ok) {
          const json = await res.json();
          setSedesCatalogo(json.data || []);
        }
      } catch (e) {}
    }
    cargarSedes();
  }, []);

  // Carga partidos y solicitudes cuando cambia la competencia
  useEffect(() => {
    if (competenciaSeleccionada) cargarDatos();
  }, [competenciaSeleccionada]);

  // Muestra un mensaje de error inline con animación de temblor
  const mostrarErrorInline = (texto) => {
    setMensajeInline({ tipo: 'error', texto });
    setShakeKeyInline(prev => prev + 1);
  };

  // Muestra un mensaje de éxito inline en verde
  const mostrarExitoInline = (texto) => {
    setMensajeInline({ tipo: 'exito', texto });
  };

  // Limpia el mensaje inline
  const limpiarMensajeInline = () => setMensajeInline({ tipo: '', texto: '' });

  async function cargarDatos() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const [resMatches, resSolicitudes] = await Promise.all([
        fetch(`${backendUrl}/api/matches?competition_id=${competenciaSeleccionada}`),
        fetch(`${backendUrl}/api/matches/reschedule-requests?competition_id=${competenciaSeleccionada}`, { headers: { 'x-user-email': user?.email || '' } })
      ]);

      if (resMatches.ok) setPartidos((await resMatches.json()).data || []);
      if (resSolicitudes.ok) setSolicitudes((await resSolicitudes.json()).data || []);
    } catch (err) {
      console.error('Error cargando calendario:', err);
    } finally {
      setCargando(false);
    }
  }

  // Aprueba una solicitud de reprogramación
  async function handleAprobar(solicitudId) {
    limpiarMensajeInline();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/reschedule-requests/${solicitudId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      mostrarExitoInline('Solicitud de reprogramación aprobada con éxito.');
      cargarDatos();
    } catch (err) {
      mostrarErrorInline(err.message);
    }
  }

  // Abre el modal para rechazar una solicitud
  const abrirModalRechazo = (solicitud) => {
    setSolicitudRechazo(solicitud);
    setMotivoRechazo('');
    setErrorRechazo('');
    setModalRechazo(true);
  };

  // Procesa el rechazo
  async function handleRechazar(e) {
    e.preventDefault();
    setErrorRechazo('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/reschedule-requests/${solicitudRechazo.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify({ rejection_reason: motivoRechazo })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setModalRechazo(false);
      mostrarExitoInline('Solicitud de reprogramación rechazada.');
      cargarDatos();
    } catch (err) {
      setErrorRechazo(err.message);
      setShakeKey(prev => prev + 1);
    }
  }

  // Abre el modal de editar partido (solo hora y sede)
  function abrirEditarPartido(p) {
    setPartidoEditando(p);
    setEditHora(p.scheduled_time || '19:00');
    setEditSedeId(p.venue_id || '');
    setErrorEditarPartido('');
  }

  // Guarda el cambio de hora y sede de un partido
  async function guardarEdicionPartido(e) {
    e.preventDefault();
    setErrorEditarPartido('');
    if (!editHora) {
      setErrorEditarPartido('Debes indicar la hora.');
      setShakeKeyEditarPartido(k => k + 1);
      return;
    }
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/${partidoEditando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify({
          scheduled_time: editHora,
          venue_id: editSedeId || null
        })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setPartidoEditando(null);
      mostrarExitoInline('Partido actualizado.');
      cargarDatos();
    } catch (err) {
      setErrorEditarPartido(err.message);
      setShakeKeyEditarPartido(k => k + 1);
    }
  }

  // Abre el modal de editar jornada (solo fecha)
  function abrirEditarJornada(jornada) {
    const partidosJornada = partidos.filter(p => p.matchday === jornada);
    if (partidosJornada.length === 0) return;
    setJornadaEditando(jornada);
    setEditFechaJornada(partidosJornada[0].scheduled_date || '');
    setErrorEditarJornada('');
  }

  // Calcula el rango permitido para una jornada según las vecinas
  function calcularRangoJornada(jornada) {
    const fechas = {};
    partidos.forEach(p => { if (!fechas[p.matchday]) fechas[p.matchday] = p.scheduled_date; });
    const nums = Object.keys(fechas).map(Number).sort((a, b) => a - b);
    const idx = nums.indexOf(jornada);
    const anterior = idx > 0 ? fechas[nums[idx - 1]] : null;
    const siguiente = idx < nums.length - 1 ? fechas[nums[idx + 1]] : null;
    return {
      anterior,
      siguiente,
      numeroAnterior: idx > 0 ? nums[idx - 1] : null,
      numeroSiguiente: idx < nums.length - 1 ? nums[idx + 1] : null
    };
  }

  // Guarda el cambio de fecha de una jornada completa
  async function guardarEdicionJornada(e) {
    e.preventDefault();
    setErrorEditarJornada('');
    if (!editFechaJornada) {
      setErrorEditarJornada('Debes indicar la fecha.');
      setShakeKeyEditarJornada(k => k + 1);
      return;
    }
    const rango = calcularRangoJornada(jornadaEditando);
    if (rango.anterior && editFechaJornada <= rango.anterior) {
      setErrorEditarJornada(`La fecha debe ser estrictamente posterior a la jornada ${rango.numeroAnterior} (${rango.anterior}).`);
      setShakeKeyEditarJornada(k => k + 1);
      return;
    }
    if (rango.siguiente && editFechaJornada >= rango.siguiente) {
      setErrorEditarJornada(`La fecha debe ser estrictamente anterior a la jornada ${rango.numeroSiguiente} (${rango.siguiente}).`);
      setShakeKeyEditarJornada(k => k + 1);
      return;
    }
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/competitions/${competenciaSeleccionada}/matchdays/${jornadaEditando}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify({ scheduled_date: editFechaJornada })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setJornadaEditando(null);
      mostrarExitoInline(`Jornada ${jornadaEditando} actualizada.`);
      cargarDatos();
    } catch (err) {
      setErrorEditarJornada(err.message);
      setShakeKeyEditarJornada(k => k + 1);
    }
  }

  // Nombre visible de la sede
  const nombreSede = (partido) => partido?.sede?.value || '—';

  // Sedes ya usadas en el calendario actual (deriva del venue_id de los partidos)
  const sedesEnUso = (() => {
    const ids = new Set();
    partidos.forEach(p => { if (p.venue_id) ids.add(p.venue_id); });
    return sedesCatalogo.filter(s => ids.has(s.id));
  })();

  // Listas de filtros calculadas a partir de los partidos cargados
  const jornadas = [...new Set(partidos.map(p => p.matchday))].sort((a, b) => a - b);
  const sedes = [...new Set(partidos.map(p => p.sede?.value).filter(Boolean))].sort();

  const partidosFiltrados = partidos.filter(p => {
    const matchJornada = filtroJornada === 'todas' || p.matchday === parseInt(filtroJornada);
    const matchSede = filtroSede === 'todas' || (p.sede?.value === filtroSede);
    const matchEstado = filtroEstado === 'todos' || p.status === filtroEstado;
    const matchBusqueda = !busqueda || (p.local?.name || '').toLowerCase().includes(busqueda.toLowerCase()) || (p.visitante?.name || '').toLowerCase().includes(busqueda.toLowerCase());
    return matchJornada && matchSede && matchEstado && matchBusqueda;
  });

  // Cuenta la ocupación de sedes
  const ocupacionSedes = partidos.reduce((acc, p) => {
    const sede = p.sede?.value;
    if (sede) acc[sede] = (acc[sede] || 0) + 1;
    return acc;
  }, {});

  const partidosPorFecha = partidosFiltrados.reduce((acc, p) => {
    if (!acc[p.scheduled_date]) acc[p.scheduled_date] = [];
    acc[p.scheduled_date].push(p);
    return acc;
  }, {});

  // Variables para el control de generación
  const tienePartidos = partidos.length > 0;
  const tieneJugados = partidos.some(p => p.status === 'FINALIZADO');

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>

      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Calendario y partidos</h1>
          <p className="admin-page-header__subtitle">Programación de partidos, solicitudes de reprogramación y ocupación de sedes.</p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => {
              if (tienePartidos) setModalConfirmarRegenerar(true);
              else setModalGenerar(true);
            }}
            disabled={!competenciaSeleccionada || tieneJugados}
            title={tieneJugados ? 'No se puede regenerar porque hay partidos jugados' : !competenciaSeleccionada ? 'Selecciona una competencia primero' : 'Generar calendario automáticamente'}
          >
            Generar calendario
          </button>
          <select className="admin-select" value={competenciaSeleccionada} onChange={(e) => setCompetenciaSeleccionada(e.target.value)} style={{ minWidth: '260px' }}>
            <option value="">Selecciona una competencia</option>
            {competencias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Banner inline de error o éxito */}
      {mensajeInline.texto && (
        mensajeInline.tipo === 'error' ? (
          <div key={shakeKeyInline} className="error-alerta-shake" style={{ marginBottom: '16px' }}>
            {mensajeInline.texto}
          </div>
        ) : (
          <div className="exito-alerta-inline" style={{ marginBottom: '16px' }}>
            {mensajeInline.texto}
          </div>
        )
      )}

      {!competenciaSeleccionada ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
          Selecciona una competencia para ver su calendario.
        </div>
      ) : cargando ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando calendario...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
          <div>
            <div className="admin-filters-bar">
              <select className="admin-select" value={filtroJornada} onChange={(e) => setFiltroJornada(e.target.value)}>
                <option value="todas">Jornada: todas</option>
                {jornadas.map(j => <option key={j} value={j}>Jornada {j}</option>)}
              </select>
              <select className="admin-select" value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
                <option value="todas">Sede: todas</option>
                {sedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="todos">Estado: todos</option>
                <option value="PROGRAMADO">Programado</option>
                <option value="REPROGRAMADO">Reprogramado</option>
                <option value="FINALIZADO">Finalizado</option>
                <option value="SUSPENDIDO">Suspendido</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <input type="search" className="admin-input admin-input--search" placeholder="Buscar por equipo..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              <div style={{ display: 'flex', gap: '0', marginLeft: 'auto', border: '1px solid var(--borde)', borderRadius: '6px', overflow: 'hidden' }}>
                <button type="button" className={`admin-btn ${vista === 'lista' ? 'admin-btn--primary' : 'admin-btn--secondary'}`} style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: 0, border: 'none' }} onClick={() => setVista('lista')}>Lista</button>
                <button type="button" className={`admin-btn ${vista === 'calendario' ? 'admin-btn--primary' : 'admin-btn--secondary'}`} style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: 0, border: 'none' }} onClick={() => setVista('calendario')}>Calendario</button>
              </div>
            </div>

            {vista === 'lista' ? (
              <div className="admin-card">
                <div className="admin-card__header">
                  <h2 className="admin-card__title">Partidos programados</h2>
                  <span className="admin-card__badge">{partidosFiltrados.length} partidos</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Partido</th>
                      <th>Jornada</th>
                      <th>Fecha y Hora</th>
                      <th>Sede</th>
                      <th>Arbitraje</th>
                      <th>Estado</th>
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
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{p.matchday}</span>
                            <button
                              type="button"
                              className="admin-btn admin-btn--secondary"
                              style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                              onClick={() => abrirEditarJornada(p.matchday)}
                              title="Editar fecha de la jornada completa"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>{formatearFecha(p.scheduled_date)} {p.scheduled_time}</td>
                        <td style={{ fontSize: '0.82rem' }}>{nombreSede(p)}</td>
                        <td style={{ fontSize: '0.82rem' }}>{getArbitrajeText(p)}</td>
                        <td><span className={`badge-status ${getBadgeClass(p.status)}`}>{p.status}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => abrirEditarPartido(p)}>Hora / Sede</button>
                            <button className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => navigate(`/personal/resultados/${p.id}`)}>Resultado</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {partidosFiltrados.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>No hay partidos que coincidan con los filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Vista de calendario agrupada por fecha */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries(partidosPorFecha).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, lista]) => {
                  const jornadaDeLista = lista[0]?.matchday;
                  return (
                    <div key={fecha} className="admin-card">
                      <div className="admin-card__header" style={{ background: 'var(--campo)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 className="admin-card__title" style={{ fontSize: '0.95rem' }}>{formatearFecha(fecha)}</h3>
                          {jornadaDeLista && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>· Jornada {jornadaDeLista}</span>
                          )}
                          {jornadaDeLista && (
                            <button
                              type="button"
                              className="admin-btn admin-btn--secondary"
                              style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                              onClick={() => abrirEditarJornada(jornadaDeLista)}
                              title="Editar fecha de la jornada completa"
                            >
                              ✎ Editar fecha
                            </button>
                          )}
                        </div>
                        <span className="admin-card__badge">{lista.length} partidos</span>
                      </div>
                      <div style={{ padding: '12px 20px' }}>
                        {lista.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--linea)' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--texto)' }}>{p.local?.name} vs {p.visitante?.name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
                                {p.scheduled_time} · {nombreSede(p)} · Jornada {p.matchday}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className={`badge-status ${getBadgeClass(p.status)}`}>{p.status}</span>
                              <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => abrirEditarPartido(p)}>Hora / Sede</button>
                              <button className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => navigate(`/personal/resultados/${p.id}`)}>Resultado</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {partidosFiltrados.length === 0 && (
                  <div className="admin-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--texto-mudo)' }}>No hay partidos que coincidan con los filtros.</div>
                )}
              </div>
            )}
          </div>

          <aside>
            <div className="admin-side-card">
              <div className="admin-side-card__header">
                <h2 className="admin-side-card__title">Solicitudes de reprogramación</h2>
                <p className="admin-side-card__subtitle">{solicitudes.length} pendientes</p>
              </div>
              {solicitudes.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)', margin: 0 }}>No hay solicitudes pendientes.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {solicitudes.map(sol => (
                    <li key={sol.id} style={{ borderBottom: '1px solid var(--linea)', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--texto)', marginBottom: '4px' }}>
                        {sol.partido?.local?.name} vs {sol.partido?.visitante?.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', marginBottom: '8px' }}>
                        {formatearFecha(sol.previous_date)} → {formatearFecha(sol.new_date)}
                      </div>
                      {sol.new_venue && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', marginBottom: '8px' }}>
                          Sede: {sol.new_venue}
                        </div>
                      )}
                      <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginBottom: '8px', fontStyle: 'italic' }}>
                        «{sol.reason}»
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="admin-btn admin-btn--primary" style={{ padding: '3px 10px', fontSize: '0.74rem' }} onClick={() => handleAprobar(sol.id)}>Aprobar</button>
                        <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '3px 10px', fontSize: '0.74rem' }} onClick={() => abrirModalRechazo(sol)}>Rechazar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="admin-side-card">
              <div className="admin-side-card__header">
                <h2 className="admin-side-card__title">Ocupación de sedes</h2>
                <p className="admin-side-card__subtitle">Partidos por sede en la competencia</p>
              </div>
              <ul className="admin-side-card__list">
                {Object.entries(ocupacionSedes).map(([sede, count]) => (
                  <li key={sede} className="admin-side-card__item">
                    <span className="admin-side-card__item-label">{sede}</span>
                    <span className="admin-side-card__item-val">{count} {count === 1 ? 'partido' : 'partidos'}</span>
                  </li>
                ))}
                {Object.keys(ocupacionSedes).length === 0 && (
                  <li style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>Sin sedes asignadas.</li>
                )}
              </ul>
            </div>
          </aside>
        </div>
      )}

      {/* MODAL: Generación automática */}
      <GenerarCalendarioModal
        isOpen={modalGenerar}
        onClose={() => setModalGenerar(false)}
        competitionId={competenciaSeleccionada}
        competitionName={competencias.find(c => c.id === competenciaSeleccionada)?.name || ''}
        hasExistingMatches={tienePartidos}
        onSuccess={(data) => {
          mostrarExitoInline(`Calendario generado: ${data.matches_created} partidos en ${data.matchdays} jornadas.`);
          cargarDatos();
        }}
      />

      {/* MODAL: Confirmación inicial para regenerar */}
      {modalConfirmarRegenerar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Regenerar calendario</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalConfirmarRegenerar(false)}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                Esta competencia ya tiene un calendario programado (ningún partido jugado aún). Si continúas, podrás configurar uno nuevo y reemplazar el actual. ¿Deseas continuar?
              </p>
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalConfirmarRegenerar(false)}>Cancelar</button>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => { setModalConfirmarRegenerar(false); setModalGenerar(true); }}>Sí, continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Editar partido (hora + sede) */}
      {partidoEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar partido</h3>
              <button type="button" className="admin-modal__close" onClick={() => setPartidoEditando(null)}>&times;</button>
            </div>
            <form onSubmit={guardarEdicionPartido}>
              <div className="admin-modal__body">
                <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--texto-suave)' }}>
                  <strong>{partidoEditando.local?.name}</strong> vs <strong>{partidoEditando.visitante?.name}</strong>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
                    Jornada {partidoEditando.matchday} · Partido #{partidoEditando.match_number} · {formatearFecha(partidoEditando.scheduled_date)}
                  </span>
                </p>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Hora *</label>
                  <input type="time" className="campo__input" value={editHora} onChange={e => setEditHora(e.target.value)} />
                </div>
                <div className="campo">
                  <label className="campo__etiqueta">Sede</label>
                  <select className="admin-select" value={editSedeId} onChange={e => setEditSedeId(e.target.value)}>
                    <option value="">— Sin sede / por definir —</option>
                    {(sedesEnUso.length > 0 ? sedesEnUso : sedesCatalogo).map(s => (
                      <option key={s.id} value={s.id}>{s.value}</option>
                    ))}
                  </select>
                  <small style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>
                    {sedesEnUso.length > 0 ? 'Se muestran las sedes ya usadas en esta competencia.' : 'Se muestran todas las sedes del catálogo.'}
                  </small>
                </div>
                {errorEditarPartido && <div key={shakeKeyEditarPartido} className="error-alerta-shake" style={{ marginTop: '12px' }}>{errorEditarPartido}</div>}
              </div>
              <div className="admin-modal__footer">
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setPartidoEditando(null)}>Cancelar</button>
                <button type="submit" className="admin-btn admin-btn--primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar jornada (fecha) */}
      {jornadaEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar fecha de jornada {jornadaEditando}</h3>
              <button type="button" className="admin-modal__close" onClick={() => setJornadaEditando(null)}>&times;</button>
            </div>
            <form onSubmit={guardarEdicionJornada}>
              <div className="admin-modal__body">
                {(() => {
                  const rango = calcularRangoJornada(jornadaEditando);
                  return (
                    <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '6px', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '14px' }}>
                      {!rango.anterior && !rango.siguiente && 'Única jornada del calendario.'}
                      {rango.anterior && rango.siguiente && `Debe quedar estrictamente entre el ${formatearFecha(rango.anterior)} (jornada ${rango.numeroAnterior}) y el ${formatearFecha(rango.siguiente)} (jornada ${rango.numeroSiguiente}).`}
                      {!rango.anterior && rango.siguiente && `Debe ser estrictamente anterior al ${formatearFecha(rango.siguiente)} (jornada ${rango.numeroSiguiente}).`}
                      {rango.anterior && !rango.siguiente && `Debe ser estrictamente posterior al ${formatearFecha(rango.anterior)} (jornada ${rango.numeroAnterior}).`}
                    </div>
                  );
                })()}
                <div className="campo">
                  <label className="campo__etiqueta">Nueva fecha *</label>
                  <input type="date" className="campo__input" value={editFechaJornada} onChange={e => setEditFechaJornada(e.target.value)} />
                </div>
                {errorEditarJornada && <div key={shakeKeyEditarJornada} className="error-alerta-shake" style={{ marginTop: '12px' }}>{errorEditarJornada}</div>}
              </div>
              <div className="admin-modal__footer">
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setJornadaEditando(null)}>Cancelar</button>
                <button type="submit" className="admin-btn admin-btn--primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de rechazo */}
      {modalRechazo && solicitudRechazo && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Rechazar solicitud</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalRechazo(false)}>&times;</button>
            </div>
            <form onSubmit={handleRechazar}>
              <div className="admin-modal__body">
                <div className="campo">
                  <label className="campo__etiqueta">Motivo del rechazo *</label>
                  <textarea required rows="3" className="campo__input" placeholder="Explica por qué se rechaza la reprogramación..." value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} />
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorRechazo && <div key={shakeKey} className="error-alerta-shake">{errorRechazo}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalRechazo(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--danger">Rechazar solicitud</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}