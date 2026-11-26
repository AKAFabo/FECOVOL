import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient.js';
import { estadoCompetencia, estadoInscripcion } from '../../utils/estadosCompetencia.js';
import Icono from '../../components/Icono.jsx';
import '../admin/AdminCommon.css';

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

// Define los estados de competencia que aceptan solicitudes de inscripción
const ESTADOS_CON_INSCRIPCIONES = ['PLANIFICACION', 'INSCRIPCIONES', 'EN_CURSO'];

// Devuelve el nombre visible de una asociación a partir del objeto equipo.
// Si no hay datos, retorna un guion largo para no dejar la celda vacía.
function nombreAsociacion(equipo) {
  if (!equipo) return '—';
  const asoc = equipo.asociacion || equipo.associations || null;
  if (!asoc) return 'Sin asociación';
  return asoc.short_name || asoc.name || 'Sin asociación';
}

// Devuelve el id de la asociación para usar en filtros y deduplicar.
function idAsociacion(equipo) {
  const asoc = equipo?.asociacion || equipo?.associations || null;
  return asoc?.id || null;
}

export default function Inscripciones() {
  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [competenciaSeleccionada, setCompetenciaSeleccionada] = useState('');
  const [metricas, setMetricas] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoCompetencias, setCargandoCompetencias] = useState(true);

  // Declara los estados de filtros
  const [filtroAsociacion, setFiltroAsociacion] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  // Declara los estados del modal de revisión
  const [modalRevision, setModalRevision] = useState(false);
  const [inscripcionSeleccionada, setInscripcionSeleccionada] = useState(null);
  const [formRevision, setFormRevision] = useState({ status: 'INSCRITO', observaciones: '' });
  const [errorRevision, setErrorRevision] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  // Declara los estados de mensajes inline (fuera de modales)
  const [mensajeInline, setMensajeInline] = useState({ tipo: '', texto: '' });
  const [shakeKeyInline, setShakeKeyInline] = useState(0);

  // Carga las competencias que permiten inscripciones al montar
  useEffect(() => {
    async function cargarCompetencias() {
      setCargandoCompetencias(true);
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      try {
        // Trae todas las competencias y filtra por los estados que aceptan inscripciones.
        // El backend no acepta múltiples estados en un solo query, así que filtras en cliente.
        const res = await fetch(`${backendUrl}/api/competitions`);
        const json = await res.json();
        const lista = (json.data || []).filter(c => ESTADOS_CON_INSCRIPCIONES.includes(c.status));
        setCompetencias(lista);
        if (lista.length > 0 && !competenciaSeleccionada) {
          setCompetenciaSeleccionada(lista[0].id);
        }
      } catch (err) {
        console.error('Error al cargar competencias:', err);
      } finally {
        setCargandoCompetencias(false);
      }
    }
    cargarCompetencias();
  }, []);

  // Carga inscripciones y métricas cuando se selecciona una competencia
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

  // Limpia el mensaje inline actual
  const limpiarMensajeInline = () => setMensajeInline({ tipo: '', texto: '' });

  async function cargarDatos() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const [resMetrics, resInscripciones] = await Promise.all([
        fetch(`${backendUrl}/api/inscriptions/metrics/${competenciaSeleccionada}`, { headers: { 'x-user-email': user?.email || '' } }),
        fetch(`${backendUrl}/api/inscriptions?competition_id=${competenciaSeleccionada}`, { headers: { 'x-user-email': user?.email || '' } })
      ]);

      if (resMetrics.ok) {
        const json = await resMetrics.json();
        setMetricas(json.data);
      }
      if (resInscripciones.ok) {
        const json = await resInscripciones.json();
        setInscripciones(json.data || []);
      }
    } catch (err) {
      console.error('Error cargando inscripciones:', err);
    } finally {
      setCargando(false);
    }
  }

  // Abre el modal para revisar una inscripción
  const abrirModalRevision = (inscripcion) => {
    setInscripcionSeleccionada(inscripcion);
    setFormRevision({ status: inscripcion.status === 'PENDIENTE' ? 'INSCRITO' : inscripcion.status, observaciones: inscripcion.observaciones || '' });
    setErrorRevision('');
    setModalRevision(true);
  };

  // Procesa la revisión (aprobar / devolver / subsanar)
  async function handleGuardarRevision(e) {
    e.preventDefault();
    setErrorRevision('');
    limpiarMensajeInline();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const res = await fetch(`${backendUrl}/api/inscriptions/${inscripcionSeleccionada.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify(formRevision)
      });

      if (!res.ok) throw new Error((await res.json()).error);
      setModalRevision(false);
      mostrarExitoInline(`Inscripción revisada y guardada como ${formRevision.status}.`);
      cargarDatos();
    } catch (err) {
      setErrorRevision(err.message);
      setShakeKey(prev => prev + 1);
    }
  }

  // Filtra las inscripciones. Deduplica asociaciones con un Map por id.
  const asociacionesUnicas = [
    ...new Map(
      inscripciones
        .map(i => {
          const asoc = i.equipo?.asociacion || i.equipo?.associations || null;
          return asoc?.id ? [asoc.id, asoc] : null;
        })
        .filter(Boolean)
    ).values()
  ];

  const inscripcionesFiltradas = inscripciones.filter(i => {
    const matchAsociacion = filtroAsociacion === 'todas' || idAsociacion(i.equipo) === filtroAsociacion;
    const matchEstado = filtroEstado === 'todos' || i.status === filtroEstado;
    const matchBusqueda = !busqueda || i.equipo?.name?.toLowerCase().includes(busqueda.toLowerCase());
    return matchAsociacion && matchEstado && matchBusqueda;
  });

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>

      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Inscripciones</h1>
          <p className="admin-page-header__subtitle">Revisión y gestión de solicitudes de inscripción por competencia.</p>
        </div>
        <div className="admin-page-header__actions">
          <select
            className="admin-select"
            value={competenciaSeleccionada}
            onChange={(e) => { setCompetenciaSeleccionada(e.target.value); limpiarMensajeInline(); }}
            style={{ minWidth: '280px' }}
            disabled={cargandoCompetencias}
          >
            {cargandoCompetencias ? (
              <option value="">Cargando competencias…</option>
            ) : competencias.length === 0 ? (
              <option value="">No hay competencias con inscripciones habilitadas</option>
            ) : (
              <>
                <option value="">Selecciona una competencia</option>
                {competencias.map(c => (
                  <option key={c.id} value={c.id}>{c.name} · {estadoCompetencia(c.status).texto}</option>
                ))}
              </>
            )}
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
          {competencias.length === 0
            ? 'No hay competencias en planificación, inscripciones o en curso. Crea o activa una competencia desde el módulo de Competencias para habilitar las inscripciones.'
            : 'Selecciona una competencia para ver sus inscripciones.'}
        </div>
      ) : cargando ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando inscripciones...</div>
      ) : (
        <>
          {/* Tarjetas de resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #1b6b31' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1b6b31', fontFamily: 'var(--fuente-titulo)' }}>{metricas?.inscritos || 0}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>Equipos inscritos</div>
            </div>
            <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #a8501f' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a8501f', fontFamily: 'var(--fuente-titulo)' }}>{metricas?.pendientes || 0}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>Solicitudes por revisar</div>
            </div>
            <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #c8102e' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#c8102e', fontFamily: 'var(--fuente-titulo)' }}>{metricas?.devueltas || 0}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>Devueltas para corregir</div>
            </div>
            <div className="admin-card" style={{ padding: '20px', borderLeft: '4px solid #0e3b6b' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0e3b6b', fontFamily: 'var(--fuente-titulo)' }}>{metricas?.dias_para_cierre || 0}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>Días para el cierre</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
            {/* Tabla principal */}
            <div>
              <div className="admin-filters-bar">
                <select className="admin-select" value={filtroAsociacion} onChange={(e) => setFiltroAsociacion(e.target.value)}>
                  <option value="todas">Asociación: todas</option>
                  {asociacionesUnicas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                  <option value="todos">Estado: todos</option>
                  <option value="INSCRITO">Inscrito</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="DEVUELTA">Devuelta</option>
                  <option value="POR_SUBSANAR">Por subsanar</option>
                  <option value="RETIRADO">Retirado</option>
                </select>
                <input type="search" className="admin-input admin-input--search" placeholder="Buscar equipo..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>

              <div className="admin-card">
                <div className="admin-card__header">
                  <h2 className="admin-card__title">Solicitudes</h2>
                  <span className="admin-card__badge">{inscripcionesFiltradas.length} equipos</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Equipo</th><th>Asociación</th><th>Enviada</th><th>Estado</th><th>Observaciones</th><th style={{ textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inscripcionesFiltradas.map(insc => (
                      <tr key={insc.id}>
                        <td><strong>{insc.equipo?.name || 'Equipo sin nombre'}</strong></td>
                        <td>{nombreAsociacion(insc.equipo)}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>
                          {insc.enviada_at ? new Date(insc.enviada_at).toLocaleDateString('es-CR') : '—'}
                        </td>
                        <td>
                          <span className={estadoInscripcion(insc.status).clase}>{estadoInscripcion(insc.status).texto}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {insc.observaciones || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => abrirModalRevision(insc)}>
                            Revisar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {inscripcionesFiltradas.length === 0 && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>No hay inscripciones registradas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel lateral de requisitos */}
            <aside>
              <div className="admin-side-card">
                <div className="admin-side-card__header">
                  <h2 className="admin-side-card__title">Requisitos de la competencia</h2>
                  <p className="admin-side-card__subtitle">Verifica que cada equipo cumpla con estos puntos antes de aprobar</p>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--texto-suave)' }}>
                  <li style={{ padding: '8px 0', borderBottom: '1px solid var(--linea)' }}><Icono nombre="check" tam={14} style={{ color: 'var(--ok)', marginRight: 6, verticalAlign: '-2px' }} />Nómina con al menos {metricas?.min_roster ?? 12} integrantes</li>
                  <li style={{ padding: '8px 0', borderBottom: '1px solid var(--linea)' }}><Icono nombre="check" tam={14} style={{ color: 'var(--ok)', marginRight: 6, verticalAlign: '-2px' }} />Categoría acorde a la competencia</li>
                  <li style={{ padding: '8px 0', borderBottom: '1px solid var(--linea)' }}><Icono nombre="check" tam={14} style={{ color: 'var(--ok)', marginRight: 6, verticalAlign: '-2px' }} />Nómina aprobada por FECOVOL</li>
                  <li style={{ padding: '8px 0', borderBottom: '1px solid var(--linea)' }}><Icono nombre="check" tam={14} style={{ color: 'var(--ok)', marginRight: 6, verticalAlign: '-2px' }} />Aval de la asociación</li>
                  <li style={{ padding: '8px 0' }}><Icono nombre="check" tam={14} style={{ color: 'var(--ok)', marginRight: 6, verticalAlign: '-2px' }} />Cuota de inscripción pagada</li>
                </ul>
              </div>

              <div className="admin-side-card" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                <div className="admin-side-card__header">
                  <h2 className="admin-side-card__title" style={{ color: '#1e40af' }}>Cupos disponibles</h2>
                </div>
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e40af', fontFamily: 'var(--fuente-titulo)' }}>
                    {metricas?.cupos_disponibles || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>de {metricas?.cupos_maximos || 12} cupos</div>
                </div>
                <div style={{ background: '#dbeafe', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ background: '#1e40af', height: '100%', width: `${((metricas?.inscritos || 0) / (metricas?.cupos_maximos || 12)) * 100}%` }} />
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {/* Modal de revisión */}
      {modalRevision && inscripcionSeleccionada && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '540px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Revisar inscripción</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalRevision(false)}>&times;</button>
            </div>
            <form onSubmit={handleGuardarRevision}>
              <div className="admin-modal__body">
                <p style={{ marginBottom: '16px', color: 'var(--texto-suave)' }}>
                  <strong>{inscripcionSeleccionada.equipo?.name}</strong> · {nombreAsociacion(inscripcionSeleccionada.equipo)}
                </p>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Estado de la solicitud</label>
                  <select className="admin-select" style={{ width: '100%' }} value={formRevision.status} onChange={e => setFormRevision({...formRevision, status: e.target.value})}>
                    <option value="INSCRITO">Aprobar (INSCRITO)</option>
                    <option value="DEVUELTA">Devolver con observaciones (DEVUELTA)</option>
                    <option value="POR_SUBSANAR">Marcar por subsanar (POR_SUBSANAR)</option>
                  </select>
                </div>
                <div className="campo">
                  <label className="campo__etiqueta">Observaciones {formRevision.status !== 'INSCRITO' && '*'}</label>
                  <textarea rows="4" required={formRevision.status !== 'INSCRITO'} className="campo__input" placeholder="Indica qué debe corregir la asociación..." value={formRevision.observaciones} onChange={e => setFormRevision({...formRevision, observaciones: e.target.value})} />
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorRevision && <div key={shakeKey} className="error-alerta-shake">{errorRevision}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalRevision(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--primary">Guardar revisión</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}