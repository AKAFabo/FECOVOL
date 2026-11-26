import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import '../admin/AdminCommon.css'; 
import { supabase } from '../../supabaseClient.js';
import { estadoInscripcion, estadoPartido } from '../../utils/estadosCompetencia.js';
import Icono from '../../components/Icono.jsx';
import { hoyCR } from '../../utils/partidos.js';
import GenerarCalendarioModal from '../../components/GenerarCalendarioModal.jsx';

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
  .exito-alerta-inline {
    background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
    padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;
  }
`;

// Componente Combobox con búsqueda en tiempo real
function Combobox({ opciones, valor, onChange, placeholder, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [textoSeleccionado, setTextoSeleccionado] = useState('');

  useEffect(() => {
    if (valor) {
      const opcion = opciones.find(o => o.id === valor);
      if (opcion) setTextoSeleccionado(opcion.nombre + (opcion.asociacion ? ` (${opcion.asociacion})` : ''));
    } else {
      setTextoSeleccionado('');
    }
  }, [valor, opciones]);

  const opcionesFiltradas = opciones.filter(o =>
    o.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (o.asociacion && o.asociacion.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" className="campo__input" placeholder={placeholder}
        value={abierto ? busqueda : textoSeleccionado} disabled={disabled}
        onFocus={() => { setAbierto(true); setBusqueda(''); }}
        onBlur={() => setTimeout(() => setAbierto(false), 200)}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{ backgroundColor: disabled ? '#f1f5f9' : '#fff', cursor: disabled ? 'not-allowed' : 'text' }}
      />
      {abierto && !disabled && (
        <div style={{ position: 'relative', marginTop: '4px', background: '#fff', border: '1px solid var(--borde)', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          {opcionesFiltradas.map(o => (
            <div key={o.id} onClick={() => { onChange(o.id); setAbierto(false); }}
              style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--linea)' }}
              onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.background = '#fff'}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{o.nombre}</div>
              {o.asociacion && <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>{o.asociacion}</div>}
            </div>
          ))}
          {opcionesFiltradas.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--texto-mudo)', textAlign: 'center' }}>No se encontraron resultados</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompetenciaDetalle({ basePath = '/personal' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Declara los estados principales
  const [competencia, setCompetencia] = useState(null);
  const [standings, setStandings] = useState([]);
  const [equiposInscritos, setEquiposInscritos] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [listaEquiposDisponibles, setListaEquiposDisponibles] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState(searchParams.get('tab') || 'posiciones');

  // Declara los estados de filtros
  const [filtroEquipos, setFiltroEquipos] = useState('');
  const [filtroPartidos, setFiltroPartidos] = useState('');
  const [filtroNomina, setFiltroNomina] = useState('');

  // Declara los estados de errores dentro de modales
  const [errorModal, setErrorModal] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  // Declara los estados de mensajes inline (fuera de modales)
  const [mensajeInline, setMensajeInline] = useState({ tipo: '', texto: '' });
  const [shakeKeyInline, setShakeKeyInline] = useState(0);

  // Declara el estado del modal de confirmación reutilizable
  const [modalConfirmacion, setModalConfirmacion] = useState(null);

  // Declara los estados de modales (inscripción, programación, reprogramación)
  const [modalEquipo, setModalEquipo] = useState(false);
  const [teamIdSelected, setTeamIdSelected] = useState('');
  const [modalPartido, setModalPartido] = useState(false);
  const [nuevoPartido, setNuevoPartido] = useState({ matchday: 1, home_team_id: '', away_team_id: '', scheduled_date: '', scheduled_time: '', venue_id: '' });

  const [modalReprogramar, setModalReprogramar] = useState(false);
  const [partidoReprogramar, setPartidoReprogramar] = useState(null);
  const [formReprogramar, setFormReprogramar] = useState({ scheduled_date: '', scheduled_time: '', venue_id: '', status: 'REPROGRAMADO', reason: '' });

  // Declara el estado del modal de generación automática de calendario
  const [modalGenerarCal, setModalGenerarCal] = useState(false);
  // Declara el estado del modal de confirmación para regenerar el calendario
  const [modalConfirmarRegenerar, setModalConfirmarRegenerar] = useState(false);

  // Declara los estados de la nómina
  const [modalNomina, setModalNomina] = useState(false);
  const [equipoNomina, setEquipoNomina] = useState(null);
  const [nominaActual, setNominaActual] = useState([]);
  const [nominaPendiente, setNominaPendiente] = useState(null);
  const [miembrosDisponibles, setMiembrosDisponibles] = useState([]);
  const [formNomina, setFormNomina] = useState({ person_id: '', jersey_number: '', roster_role: 'JUGADOR', reason: '' });

  // Declara los estados del modal de rechazo de nómina
  const [modalRechazoNomina, setModalRechazoNomina] = useState(false);
  const [motivoRechazoNomina, setMotivoRechazoNomina] = useState('');
  const [errorRechazoNomina, setErrorRechazoNomina] = useState('');
  const [shakeKeyRechazoNomina, setShakeKeyRechazoNomina] = useState(0);

  // Declara los estados de reportes
  const [tipoReporte, setTipoReporte] = useState('jornada');
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(1);
  const [datosReporte, setDatosReporte] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);

  // Carga los datos al montar el componente
  useEffect(() => { cargarTodo(); }, [id]);

  // Detecta si se debe abrir un modal de reprogramación automáticamente
  useEffect(() => {
    if (cargando || partidos.length === 0) return;
    const matchId = searchParams.get('match');
    const action = searchParams.get('action');
    if (!matchId || action !== 'edit') return;

    const partido = partidos.find(p => p.id === matchId);
    if (!partido) return;

    abrirModalReprogramar(partido);
    setSearchParams({ tab: 'calendario' }, { replace: true });
  }, [cargando, partidos]);

  async function cargarTodo() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    try {
      const [resComp, resPos, resTeams, resMatches, resAllTeams, resSedes] = await Promise.all([
        fetch(`${backendUrl}/api/competitions/${id}`),
        fetch(`${backendUrl}/api/competitions/${id}/standings`),
        fetch(`${backendUrl}/api/competitions/${id}/teams`),
        fetch(`${backendUrl}/api/matches?competition_id=${id}`),
        fetch(`${backendUrl}/api/teams?status=ACTIVO`),
        fetch(`${backendUrl}/api/catalogs/Sedes/values`)
      ]);
      const [jsonComp, jsonPos, jsonTeams, jsonMatches, jsonAllTeams, jsonSedes] = await Promise.all([
        resComp.json(), resPos.json(), resTeams.json(), resMatches.json(), resAllTeams.json(), resSedes.json().catch(() => ({ data: [] }))
      ]);
      setCompetencia(jsonComp.data);
      setStandings(jsonPos.data || []);
      setEquiposInscritos(jsonTeams.data || []);
      setPartidos(jsonMatches.data || []);
      setListaEquiposDisponibles(jsonAllTeams.data || []);
      setSedes(jsonSedes.data || []);
    } catch (err) {
      console.error('Error cargando detalle:', err);
    } finally {
      setCargando(false);
    }
  }

  // Muestra un mensaje de error dentro de un modal, con animación de temblor
  const showModalError = (msg) => { setErrorModal(msg); setShakeKey(prev => prev + 1); };

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

  // Abre el modal de confirmación reutilizable
  const pedirConfirmacion = ({ titulo, mensaje, textoConfirmar = 'Confirmar', tipo = 'normal', onConfirmar }) => {
    setModalConfirmacion({ titulo, mensaje, textoConfirmar, tipo, onConfirmar });
  };

  // Devuelve el nombre visible de la sede de un partido
  const nombreSede = (partido) => partido?.sede?.value || '—';

  // ==========================================
  // EQUIPOS Y NÓMINA
  // ==========================================

  async function handleInscribirEquipo(e) {
    e.preventDefault();
    setErrorModal('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/competitions/${id}/teams`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify({ team_id: teamIdSelected })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setModalEquipo(false); setTeamIdSelected(''); setErrorModal(''); cargarTodo();
    } catch (err) { showModalError(err.message); }
  }

  // Abre el modal de confirmación para retirar al equipo de la competencia
  function handleRetirarEquipo(teamId, teamName) {
    limpiarMensajeInline();
    pedirConfirmacion({
      titulo: 'Retirar equipo',
      mensaje: `¿Retirar al equipo «${teamName}» de esta competencia? La inscripción queda como Retirado. Si fue un error, puede reincorporarlo mientras la competencia no haya finalizado.`,
      textoConfirmar: 'Sí, retirar equipo',
      tipo: 'peligro',
      onConfirmar: async () => {
        setModalConfirmacion(null);
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        const { data: { user } } = await supabase.auth.getUser();
        try {
          const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${teamId}`, {
            method: 'DELETE', headers: { 'x-user-email': user?.email || 'admin@fecovol.cr' }
          });
          if (!res.ok) throw new Error((await res.json()).error);
          mostrarExitoInline(`Equipo «${teamName}» retirado con éxito.`);
          cargarTodo();
        } catch (err) {
          mostrarErrorInline(err.message);
        }
      }
    });
  }

  // Reincorpora un equipo retirado por error (el backend revisa el estado de la competencia y el cupo).
  function handleReincorporarEquipo(teamId, teamName) {
    limpiarMensajeInline();
    pedirConfirmacion({
      titulo: 'Reincorporar equipo',
      mensaje: `¿Reincorporar al equipo «${teamName}» a esta competencia? Su inscripción vuelve a quedar como Inscrito.`,
      textoConfirmar: 'Sí, reincorporar',
      onConfirmar: async () => {
        setModalConfirmacion(null);
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        try {
          const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${teamId}/reincorporar`, { method: 'POST' });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo reincorporar el equipo.');
          mostrarExitoInline(`Equipo «${teamName}» reincorporado.`);
          cargarTodo();
        } catch (err) {
          mostrarErrorInline(err.message);
        }
      }
    });
  }

  // Carga la nómina oficial y, si existe, el cambio pendiente de aprobación.
  // Envía x-user-email porque el endpoint exige autenticación.
  async function cargarNominaEquipo(equipo) {
    setEquipoNomina(equipo); setModalNomina(true); setErrorModal(''); setFiltroNomina('');
    setFormNomina({ person_id: '', jersey_number: '', roster_role: 'JUGADOR', reason: '' });
    setNominaPendiente(null);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const teamId = equipo.equipo.id;

    // Recupera el correo del usuario para autenticar la consulta
    const { data: { user } } = await supabase.auth.getUser();
    const headers = { 'x-user-email': user?.email || '' };

    try {
      const resNomina = await fetch(`${backendUrl}/api/competitions/${id}/teams/${teamId}/roster`, { headers });
      if (!resNomina.ok) {
        const errJson = await resNomina.json().catch(() => ({}));
        throw new Error(errJson.error || 'No se pudo cargar la nómina.');
      }
      const jsonNomina = await resNomina.json();
      setNominaActual(jsonNomina.data || []);
      setNominaPendiente(jsonNomina.pendiente || null);

      const resMiembros = await fetch(`${backendUrl}/api/teams/${teamId}/members`, { headers });
      const jsonMiembros = await resMiembros.json();
      setMiembrosDisponibles(jsonMiembros.data || []);
    } catch (err) {
      showModalError(err.message || 'Error al cargar los datos de la nómina.');
    }
  }

  async function handleAgregarNomina(e) {
    e.preventDefault(); setErrorModal('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${equipoNomina.equipo.id}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify(formNomina)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al procesar el cambio.');

      if (json.status === 'PENDIENTE_APROBACION') {
        mostrarExitoInline('Cambio enviado a revisión de FECOVOL.');
      } else {
        mostrarExitoInline('Integrante agregado a la nómina.');
      }

      setFormNomina({ person_id: '', jersey_number: '', roster_role: 'JUGADOR', reason: '' });
      cargarNominaEquipo(equipoNomina);
    } catch (err) {
      showModalError(err.message);
    }
  }

  // Abre el modal de confirmación para dar de baja a un integrante de la nómina
  function handleEliminarNomina(rosterId) {
    limpiarMensajeInline();
    pedirConfirmacion({
      titulo: 'Dar de baja integrante',
      mensaje: '¿Estás seguro de dar de baja a este integrante? Su historial se conservará pero no podrá participar en los próximos partidos. Si no eres FECOVOL, se enviará a revisión.',
      textoConfirmar: 'Sí, dar de baja',
      tipo: 'peligro',
      onConfirmar: async () => {
        setModalConfirmacion(null);
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        const { data: { user } } = await supabase.auth.getUser();
        try {
          const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${equipoNomina.equipo.id}/roster/${rosterId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
            body: JSON.stringify({ reason: null })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || 'Error al procesar la baja.');

          if (json.status === 'PENDIENTE_APROBACION') {
            mostrarExitoInline('Baja enviada a revisión de FECOVOL.');
          } else {
            mostrarExitoInline('Integrante dado de baja.');
          }
          cargarNominaEquipo(equipoNomina);
        } catch (err) {
          showModalError(err.message);
        }
      }
    });
  }

  // Aprueba el cambio pendiente. Solo funciona para FECOVOL (isAdmin).
  async function handleAprobarPendiente() {
    if (!nominaPendiente) return;
    limpiarMensajeInline();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${equipoNomina.equipo.id}/roster/versions/${nominaPendiente.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al aprobar el cambio.');
      mostrarExitoInline('Cambio aprobado y aplicado a la nómina.');
      cargarNominaEquipo(equipoNomina);
    } catch (err) {
      mostrarErrorInline(err.message);
    }
  }

  // Envía el rechazo del cambio pendiente
  async function handleRechazarPendiente(e) {
    e.preventDefault();
    setErrorRechazoNomina('');
    if (!motivoRechazoNomina.trim()) {
      setErrorRechazoNomina('Debes indicar el motivo del rechazo.');
      setShakeKeyRechazoNomina(prev => prev + 1);
      return;
    }
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/competitions/${id}/teams/${equipoNomina.equipo.id}/roster/versions/${nominaPendiente.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify({ rejection_reason: motivoRechazoNomina.trim() })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al rechazar el cambio.');
      setModalRechazoNomina(false);
      mostrarExitoInline('Cambio rechazado. La nómina oficial no fue modificada.');
      cargarNominaEquipo(equipoNomina);
    } catch (err) {
      setErrorRechazoNomina(err.message);
      setShakeKeyRechazoNomina(prev => prev + 1);
    }
  }

  // ==========================================
  // PARTIDOS
  // ==========================================

  async function handleProgramarPartido(e) {
    e.preventDefault(); setErrorModal('');

    if (nuevoPartido.home_team_id === nuevoPartido.away_team_id) {
      return showModalError('El equipo local y visitante no pueden ser el mismo.');
    }

    // Valida que ambos equipos estén inscritos como INSCRITO antes de enviar al backend
    const localInscrito = equiposInscritos.some(
      eq => eq.equipo.id === nuevoPartido.home_team_id && eq.status === 'INSCRITO'
    );
    const visitanteInscrito = equiposInscritos.some(
      eq => eq.equipo.id === nuevoPartido.away_team_id && eq.status === 'INSCRITO'
    );

    if (!localInscrito) {
      return showModalError('El equipo local debe estar inscrito en la competencia con estado INSCRITO.');
    }
    if (!visitanteInscrito) {
      return showModalError('El equipo visitante debe estar inscrito en la competencia con estado INSCRITO.');
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const payload = {
        ...nuevoPartido,
        venue_id: nuevoPartido.venue_id || null,
        competition_id: id,
        match_number: partidos.length + 1
      };

      const res = await fetch(`${backendUrl}/api/matches`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setModalPartido(false); setErrorModal('');
      setNuevoPartido({ matchday: 1, home_team_id: '', away_team_id: '', scheduled_date: '', scheduled_time: '', venue_id: '' });
      cargarTodo();
    } catch (err) { showModalError(err.message); }
  }

  function abrirModalReprogramar(partido) {
    setPartidoReprogramar(partido);
    setFormReprogramar({
      scheduled_date: partido.scheduled_date,
      scheduled_time: partido.scheduled_time,
      venue_id: partido.venue_id || '',
      status: partido.status,
      reason: ''
    });
    setModalReprogramar(true); setErrorModal('');
  }

  async function handleReprogramarPartido(e) {
    e.preventDefault(); setErrorModal('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const payload = {
        ...formReprogramar,
        venue_id: formReprogramar.venue_id || null
      };

      const res = await fetch(`${backendUrl}/api/matches/${partidoReprogramar.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || 'admin@fecovol.cr' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setModalReprogramar(false); cargarTodo();
    } catch (err) { showModalError(err.message); }
  }

  // ==========================================
  // REPORTES
  // ==========================================

  async function generarReporte(tipo) {
    setCargandoReporte(true); setTipoReporte(tipo); setDatosReporte(null);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    try {
      if (tipo === 'jornada') { const res = await fetch(`${backendUrl}/api/reports/results/${id}/${jornadaSeleccionada}`); setDatosReporte({ tipo, data: (await res.json()).data }); }
      else if (tipo === 'proxima') { const res = await fetch(`${backendUrl}/api/reports/next-matchday/${id}`); setDatosReporte({ tipo, data: (await res.json()).data }); }
      else if (tipo === 'posiciones') { setDatosReporte({ tipo, data: standings }); }
      else if (tipo === 'consolidado') { const res = await fetch(`${backendUrl}/api/reports/consolidated/${id}`); setDatosReporte({ tipo, data: (await res.json()).data }); }
      else if (tipo === 'nominas') { const res = await fetch(`${backendUrl}/api/reports/roster-compliance/${id}`); setDatosReporte({ tipo, data: (await res.json()).data }); }
      else if (tipo === 'estadisticas') { const res = await fetch(`${backendUrl}/api/reports/team-stats/${id}`); setDatosReporte({ tipo, data: (await res.json()).data }); }
    } catch (err) { console.error('Error al generar reporte:', err); }
    finally { setCargandoReporte(false); }
  }

  function exportarCSV() {
    if (!datosReporte || !datosReporte.data) return;
    let headers = []; let rows = [];
    if (datosReporte.tipo === 'jornada' || datosReporte.tipo === 'proxima') {
      headers = ['Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Sede', 'Estado', 'Sets L', 'Sets V'];
      rows = (datosReporte.tipo === 'proxima' ? datosReporte.data.matches : datosReporte.data || []).map(m => [m.matchday, m.scheduled_date, m.scheduled_time, m.local?.name || '', m.visitante?.name || '', m.venue || '', m.status, m.home_sets_won || 0, m.away_sets_won || 0]);
    } else if (datosReporte.tipo === 'posiciones') {
      headers = ['Pos', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos'];
      rows = (datosReporte.data || []).map((p, i) => [i + 1, p.team_name, p.matches_played, p.matches_won, p.matches_lost, p.sets_won, p.sets_lost, p.total_points]);
    } else if (datosReporte.tipo === 'consolidado') {
      headers = ['Jornada', 'Fecha', 'Local', 'Visitante', 'Sets L', 'Sets V'];
      rows = (datosReporte.data || []).map(m => [m.matchday, m.scheduled_date, m.local?.name || '', m.visitante?.name || '', m.home_sets_won, m.away_sets_won]);
    } else if (datosReporte.tipo === 'nominas') {
      headers = ['Equipo', 'Integrantes', 'Mínimo', 'Documentos Vencidos', 'Estado'];
      rows = (datosReporte.data || []).map(d => [d.equipo?.name, d.integrantes, d.minimo_requerido, d.documentos_vencidos, d.estado_general]);
    } else if (datosReporte.tipo === 'estadisticas') {
      headers = ['#', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos', 'Ratio Sets', 'Ratio Puntos'];
      rows = (datosReporte.data || []).map((t, i) => [i + 1, t.team_name, t.matches_played, t.matches_won, t.matches_lost, t.sets_won, t.sets_lost, t.total_points, t.ratio_sets, t.ratio_puntos]);
    }
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `Reporte_${datosReporte.tipo}_${competencia.name.replace(/\s+/g, '_')}.csv`;
    link.click(); URL.revokeObjectURL(url);
  }

  function imprimirReporte() { window.print(); }

  // ==========================================
  // FILTROS Y CÁLCULOS DERIVADOS
  // ==========================================

  const equiposFiltrados = equiposInscritos.filter(eq => eq.equipo.name.toLowerCase().includes(filtroEquipos.toLowerCase()) || (eq.equipo.asociacion?.name || '').toLowerCase().includes(filtroEquipos.toLowerCase()));
  const partidosFiltrados = partidos.filter(p => (p.local?.name || '').toLowerCase().includes(filtroPartidos.toLowerCase()) || (p.visitante?.name || '').toLowerCase().includes(filtroPartidos.toLowerCase()) || (p.scheduled_date || '').includes(filtroPartidos));
  const nominaFiltrada = nominaActual.filter(n => `${n.persona.first_name} ${n.persona.last_name}`.toLowerCase().includes(filtroNomina.toLowerCase()));

  // Solo ofrece en los combos los equipos con estado INSCRITO
  const equiposInscritosValidos = equiposInscritos.filter(eq => eq.status === 'INSCRITO');
  const equiposParaLocal = equiposInscritosValidos.filter(eq => eq.equipo.id !== nuevoPartido.away_team_id);
  const equiposParaVisitante = equiposInscritosValidos.filter(eq => eq.equipo.id !== nuevoPartido.home_team_id);

  const localValido = equiposInscritosValidos.some(eq => eq.equipo.id === nuevoPartido.home_team_id);
  const visitanteValido = equiposInscritosValidos.some(eq => eq.equipo.id === nuevoPartido.away_team_id);
  const partidoListoParaProgramar = Boolean(
    nuevoPartido.home_team_id &&
    nuevoPartido.away_team_id &&
    nuevoPartido.scheduled_date &&
    nuevoPartido.scheduled_time &&
    nuevoPartido.matchday &&
    localValido &&
    visitanteValido
  );

  // Calcula si la competencia ya tiene partidos y si alguno fue jugado
  const tienePartidos = partidos.length > 0;
  const tieneJugados = partidos.some(p => p.status === 'FINALIZADO');

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando panel de competencia...</div>;
  if (!competencia) return <div style={{ padding: '40px', textAlign: 'center' }}>Competencia no encontrada.</div>;

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>

      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <span style={{ fontSize: '0.8rem', color: 'var(--rojo)', fontWeight: 700, cursor: 'pointer' }} onClick={() => navigate(basePath)}>← Volver a competencias</span>
          <h1 style={{ marginTop: '8px' }}>{competencia.name}</h1>
          <p className="admin-page-header__subtitle">{competencia.categoria?.value} · {competencia.rama?.value} · Temporada {competencia.season}</p>
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

      <div style={{ display: 'flex', gap: '32px', borderBottom: '2px solid var(--linea)', marginBottom: '32px' }}>
        {['posiciones', 'equipos', 'calendario', 'reportes'].map((tab) => (
          <button key={tab} onClick={() => { setTabActiva(tab); setSearchParams({ tab }); }} style={{
            background: 'none', border: 'none', padding: '12px 0', fontSize: '1.05rem', fontWeight: 700,
            textTransform: 'capitalize', cursor: 'pointer', color: tabActiva === tab ? 'var(--azul)' : 'var(--texto-mudo)',
            borderBottom: tabActiva === tab ? '3px solid var(--rojo)' : '3px solid transparent', marginBottom: '-2px'
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Pestaña: Posiciones */}
      {tabActiva === 'posiciones' && (
        <div className="admin-card">
          <table className="admin-table" style={{ textAlign: 'center' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: '24px' }}>#</th>
                <th style={{ textAlign: 'left' }}>Equipo</th>
                <th>PJ</th>
                <th>PG</th>
                <th>PP</th>
                <th>SG</th>
                <th>SP</th>
                <th>Ratio Sets</th>
                <th>Ratio Pts</th>
                <th>PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((pos, index) => (
                <tr key={pos.team_id}>
                  <td style={{ textAlign: 'left', paddingLeft: '24px', fontWeight: 700 }}>{index + 1}</td>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{pos.team_name}</td>
                  <td>{pos.matches_played}</td>
                  <td>{pos.matches_won}</td>
                  <td>{pos.matches_lost}</td>
                  <td>{pos.sets_won}</td>
                  <td>{pos.sets_lost}</td>
                  <td style={{ fontWeight: 600 }}>{typeof pos.ratio_sets === 'number' ? pos.ratio_sets.toFixed(2) : (pos.ratio_sets ?? '—')}</td>
                  <td style={{ fontWeight: 600 }}>{typeof pos.ratio_puntos === 'number' ? pos.ratio_puntos.toFixed(2) : (pos.ratio_puntos ?? '—')}</td>
                  <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{pos.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pestaña: Equipos */}
      {tabActiva === 'equipos' && (
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Equipos Inscritos</h2>
            <button className="admin-btn admin-btn--primary" onClick={() => { setModalEquipo(true); setErrorModal(''); }}>Inscribir Equipo</button>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <input type="text" className="campo__input" placeholder="Buscar equipo por nombre o asociación..." style={{ maxWidth: '400px' }} value={filtroEquipos} onChange={(e) => setFiltroEquipos(e.target.value)} />
          </div>
          <table className="admin-table">
            <thead><tr><th>Equipo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
            <tbody>
              {equiposFiltrados.map(eq => (
                <tr key={eq.id}>
                  <td><strong>{eq.equipo.name}</strong></td>
                  <td><span className={estadoInscripcion(eq.status).clase}>{estadoInscripcion(eq.status).texto}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {eq.status !== 'RETIRADO' && (
                      <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', marginRight: '8px' }} onClick={() => cargarNominaEquipo(eq)}>Gestionar Nómina</button>
                    )}
                    {eq.status === 'RETIRADO' ? (
                      <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleReincorporarEquipo(eq.equipo.id, eq.equipo.name)}>Reincorporar</button>
                    ) : (
                      <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', color: '#a3202c', borderColor: '#e3a9b0' }} onClick={() => handleRetirarEquipo(eq.equipo.id, eq.equipo.name)}>Retirar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pestaña: Calendario */}
      {tabActiva === 'calendario' && (
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Calendario de Partidos</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="admin-btn admin-btn--secondary"
                onClick={() => {
                  if (tienePartidos) setModalConfirmarRegenerar(true);
                  else setModalGenerarCal(true);
                }}
                disabled={tieneJugados}
                title={tieneJugados ? 'No se puede regenerar porque hay partidos jugados' : 'Generar calendario automáticamente'}
              >
                Generar calendario
              </button>
              <button className="admin-btn admin-btn--primary" onClick={() => { setModalPartido(true); setErrorModal(''); }}>Programar Partido</button>
            </div>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <input type="text" className="campo__input" placeholder="Buscar por equipo o fecha..." style={{ maxWidth: '400px' }} value={filtroPartidos} onChange={(e) => setFiltroPartidos(e.target.value)} />
          </div>
          <table className="admin-table">
            <thead><tr><th>Jornada</th><th>Local</th><th>Visitante</th><th>Fecha / Hora</th><th>Sede</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
            <tbody>
              {partidosFiltrados.map(p => (
                <tr key={p.id}>
                  <td>{p.matchday}</td>
                  <td>{p.local?.name}</td>
                  <td>{p.visitante?.name}</td>
                  <td>{formatearFecha(p.scheduled_date)} {p.scheduled_time?.slice(0, 5)}</td>
                  <td>{nombreSede(p)}</td>
                  <td><span className={estadoPartido(p.status).clase}>{estadoPartido(p.status).texto}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status !== 'CANCELADO' && (
                      <button className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', marginRight: '8px' }} onClick={() => abrirModalReprogramar(p)}>Editar Estado</button>
                    )}
                    {(p.status === 'PROGRAMADO' || p.status === 'FINALIZADO') && (
                      <button className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => navigate(`${basePath}/resultados/${p.id}`)}>
                        {p.status === 'FINALIZADO' ? 'Editar Resultado' : 'Registrar Resultado'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pestaña: Reportes */}
      {tabActiva === 'reportes' && (
        <div className="admin-card" style={{ padding: '24px' }}>
          <div className="admin-page-header" style={{ marginBottom: '24px' }}>
            <div className="admin-page-header__title-group">
              <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Generador de Reportes</h2>
              <p className="admin-page-header__subtitle">Selecciona el tipo de reporte que deseas generar o imprimir.</p>
            </div>
            <div className="admin-page-header__actions">
              {datosReporte && (
                <>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={exportarCSV}>Exportar a CSV</button>
                  <button type="button" className="admin-btn admin-btn--primary" onClick={imprimirReporte}>Imprimir / PDF</button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
            <div className="campo" style={{ width: '280px', marginBottom: 0 }}>
              <label className="campo__etiqueta">Tipo de Reporte</label>
              <select className="admin-select" style={{ width: '100%' }} value={tipoReporte} onChange={(e) => { setTipoReporte(e.target.value); setDatosReporte(null); }}>
                <option value="jornada">Resultados por Jornada</option>
                <option value="proxima">Programación Próxima Jornada</option>
                <option value="posiciones">Tabla de Posiciones Oficial</option>
                <option value="consolidado">Consolidado de Resultados</option>
                <option value="nominas">Cumplimiento de Nóminas</option>
                <option value="estadisticas">Estadísticas por Equipo</option>
              </select>
            </div>
            {tipoReporte === 'jornada' && (
              <div className="campo" style={{ width: '150px', marginBottom: 0 }}>
                <label className="campo__etiqueta">Jornada #</label>
                <input type="number" className="campo__input" min="1" value={jornadaSeleccionada} onChange={(e) => setJornadaSeleccionada(parseInt(e.target.value) || 1)} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => generarReporte(tipoReporte)}>Generar Reporte</button>
            </div>
          </div>

          {cargandoReporte ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Generando reporte...</div>
          ) : datosReporte ? (
            <div id="area-impresion" style={{ background: '#fff', padding: '32px', border: '1px solid var(--linea)', borderRadius: '8px' }}>
              <div style={{ textAlign: 'center', marginBottom: '32px', borderBottom: '2px solid var(--texto)', paddingBottom: '16px' }}>
                <h2 style={{ fontSize: '1.8rem', margin: '0 0 8px 0' }}>{competencia.name}</h2>
                <p style={{ margin: 0, color: 'var(--texto-mudo)', fontWeight: 600 }}>
                  {tipoReporte === 'jornada' && `Resultados - Jornada ${jornadaSeleccionada}`}
                  {tipoReporte === 'proxima' && `Programación Próxima Jornada ${datosReporte.data.matchday ? `(#${datosReporte.data.matchday})` : ''}`}
                  {tipoReporte === 'posiciones' && `Tabla de Posiciones Oficial`}
                  {tipoReporte === 'consolidado' && `Consolidado General de Resultados`}
                  {tipoReporte === 'nominas' && `Cumplimiento de Nóminas`}
                  {tipoReporte === 'estadisticas' && `Estadísticas por Equipo`}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--texto-tenue)' }}>Generado el {new Date().toLocaleDateString('es-CR')}</p>
              </div>

              {['jornada', 'proxima'].includes(datosReporte.tipo) && (
                <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr><th>Hora</th><th>Local</th><th style={{ textAlign: 'center' }}>Resultado</th><th>Visitante</th><th>Sede</th></tr>
                  </thead>
                  <tbody>
                    {datosReporte.tipo === 'proxima' ? (
                      (datosReporte.data.matches || []).map((m, i) => (
                        <tr key={i}>
                          <td>{m.scheduled_date} {m.scheduled_time?.slice(0, 5)}</td>
                          <td style={{ fontWeight: 600 }}>{m.local?.name}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800 }}>vs</td>
                          <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                          <td>{m.venue || 'Por definir'}</td>
                        </tr>
                      ))
                    ) : (
                      (datosReporte.data || []).map((m, i) => (
                        <tr key={i}>
                          <td>{m.scheduled_time?.slice(0, 5)}</td>
                          <td style={{ fontWeight: 600, textAlign: 'right' }}>{m.local?.name}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: m.status === 'FINALIZADO' ? 'var(--azul)' : 'inherit' }}>
                            {m.status === 'FINALIZADO' ? `${m.home_sets_won} - ${m.away_sets_won}` : 'Pendiente'}
                          </td>
                          <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                          <td>{m.venue || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {datosReporte.tipo === 'posiciones' && (
                <table className="admin-table" style={{ border: '1px solid var(--borde)', textAlign: 'center' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr><th>#</th><th style={{ textAlign: 'left' }}>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th><th>PTS</th></tr>
                  </thead>
                  <tbody>
                    {(datosReporte.data || []).map((p, i) => (
                      <tr key={i} style={{ backgroundColor: i < 4 ? '#f0f9ff' : '#fff' }}>
                        <td style={{ fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{p.team_name}</td>
                        <td>{p.matches_played}</td><td>{p.matches_won}</td><td>{p.matches_lost}</td>
                        <td>{p.sets_won}</td><td>{p.sets_lost}</td>
                        <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{p.total_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {datosReporte.tipo === 'consolidado' && (
                <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr><th>Jornada</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Local</th><th style={{ textAlign: 'center' }}>Sets</th><th>Visitante</th></tr>
                  </thead>
                  <tbody>
                    {(datosReporte.data || []).map((m, i) => (
                      <tr key={i}>
                        <td>{m.matchday}</td><td>{formatearFecha(m.scheduled_date)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.local?.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--azul)' }}>{m.home_sets_won} - {m.away_sets_won}</td>
                        <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {datosReporte.tipo === 'nominas' && (
                <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr><th>Equipo</th><th>Integrantes</th><th>Mínimo</th><th>Docs. Vencidos</th><th>Estado</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {(datosReporte.data || []).map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{d.equipo?.name}</td>
                        <td>{d.integrantes}</td>
                        <td>{d.minimo_requerido}</td>
                        <td style={{ color: d.documentos_vencidos > 0 ? 'var(--rojo)' : 'inherit' }}>{d.documentos_vencidos}</td>
                        <td>
                          <span className={`badge-status ${d.estado_general === 'COMPLETO' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                            {d.estado_general}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>{d.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {datosReporte.tipo === 'estadisticas' && (
                <table className="admin-table" style={{ border: '1px solid var(--borde)', textAlign: 'center' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr><th>#</th><th style={{ textAlign: 'left' }}>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th><th>PTS</th><th>Ratio Sets</th><th>Ratio Pts</th></tr>
                  </thead>
                  <tbody>
                    {(datosReporte.data || []).map((t, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{t.team_name}</td>
                        <td>{t.matches_played}</td><td>{t.matches_won}</td><td>{t.matches_lost}</td>
                        <td>{t.sets_won}</td><td>{t.sets_lost}</td>
                        <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{t.total_points}</td>
                        <td>{t.ratio_sets}</td><td>{t.ratio_puntos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--texto-tenue)', borderTop: '1px solid var(--linea)', paddingTop: '16px' }}>
                Federación Costarricense de Voleibol - Documento Oficial
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--texto-mudo)' }}>Selecciona las opciones y haz clic en "Generar Reporte".</div>
          )}
        </div>
      )}

      {/* MODAL: Gestionar Nómina */}
      {modalNomina && equipoNomina && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '750px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Nómina: {equipoNomina.equipo.name}</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalNomina(false)}>&times;</button>
            </div>
            <div className="admin-modal__body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Banner de cambio pendiente de aprobación */}
              {nominaPendiente && (
                <div style={{ marginBottom: '16px', background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '12px 14px', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '4px' }}>
                    Cambio pendiente de aprobación
                  </div>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                    {nominaPendiente.changes_summary || 'Cambio en la nómina'} · Solicitado por {nominaPendiente.created_by} el {new Date(nominaPendiente.created_at).toLocaleDateString('es-CR')}.
                    {nominaPendiente.reason && (<><br />Motivo: «{nominaPendiente.reason}»</>)}
                  </div>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button type="button" className="admin-btn admin-btn--primary" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={handleAprobarPendiente}>Aprobar cambio</button>
                    <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '4px 12px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => { setMotivoRechazoNomina(''); setErrorRechazoNomina(''); setModalRechazoNomina(true); }}>Rechazar</button>
                  </div>
                </div>
              )}

              <form onSubmit={handleAgregarNomina} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                <div className="campo" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label className="campo__etiqueta">Integrante *</label>
                  <Combobox
                    opciones={miembrosDisponibles.filter(m => !nominaActual.some(n => n.persona.id === m.persona.id && n.status === 'ACTIVO')).map(m => ({ id: m.persona.id, nombre: `${m.persona.first_name} ${m.persona.last_name}` }))}
                    valor={formNomina.person_id} onChange={(id) => setFormNomina({...formNomina, person_id: id})} placeholder="Buscar en el equipo..."
                  />
                </div>
                <div className="campo" style={{ width: '100px', marginBottom: 0 }}>
                  <label className="campo__etiqueta">Dorsal</label>
                  <input type="number" min="1" max="99" className="campo__input" placeholder="Ej. 10" value={formNomina.jersey_number} onChange={e => setFormNomina({...formNomina, jersey_number: parseInt(e.target.value) || ''})} />
                </div>
                <div className="campo" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label className="campo__etiqueta">Motivo del cambio</label>
                  <input
                    type="text"
                    className="campo__input"
                    placeholder="Ej. Alta de jugadora convocada"
                    value={formNomina.reason}
                    onChange={e => setFormNomina({ ...formNomina, reason: e.target.value })}
                  />
                </div>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={!formNomina.person_id}>Agregar</button>
              </form>
              <div style={{ padding: '0 0 16px' }}>
                <input type="text" className="campo__input" placeholder="Filtrar nómina por nombre..." value={filtroNomina} onChange={(e) => setFiltroNomina(e.target.value)} />
              </div>
              <table className="admin-table">
                <thead><tr><th>Jugador</th><th>Rol</th><th>Dorsal</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                <tbody>
                  {nominaFiltrada.map(n => (
                    <tr key={n.id} style={{ opacity: n.status === 'BAJA' ? 0.5 : 1 }}>
                      <td><strong>{n.persona.first_name} {n.persona.last_name}</strong></td>
                      <td>{n.roster_role}</td><td>{n.jersey_number || '—'}</td>
                      <td><span className={`badge-status ${n.status === 'ACTIVO' ? 'badge-status--activa' : 'badge-status--inactivo'}`}>{n.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {n.status === 'ACTIVO' && (
                          <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#dc2626' }} onClick={() => handleEliminarNomina(n.id)}>Dar de baja</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {nominaFiltrada.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--texto-mudo)' }}>No hay integrantes en la nómina.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
              {errorModal && <div key={shakeKey} className="error-alerta-shake">{errorModal}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => setModalNomina(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Inscribir Equipo */}
      {modalEquipo && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ minHeight: '340px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Inscribir Equipo</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalEquipo(false)}>&times;</button>
            </div>
            <form onSubmit={handleInscribirEquipo} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div className="admin-modal__body" style={{ flex: 1 }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '14px', lineHeight: 1.45 }}>
                  Esta inscripción se crea directamente como <strong>INSCRITO</strong>, ya que la realiza el personal de FECOVOL.
                  Si la asociación necesita que su equipo quede pendiente de revisión, debe enviar la solicitud desde el módulo de <strong>Inscripciones</strong> para que quede en estado <strong>PENDIENTE</strong>.
                </p>
                <div className="campo">
                  <label className="campo__etiqueta">Busca y selecciona el Equipo *</label>
                  <Combobox opciones={listaEquiposDisponibles.filter(eq => !equiposInscritos.some(inscrito => inscrito.equipo.id === eq.id)).map(eq => ({ id: eq.id, nombre: eq.name, asociacion: eq.asociacion?.name }))} valor={teamIdSelected} onChange={setTeamIdSelected} placeholder="Escribe para buscar..." />
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorModal && <div key={shakeKey} className="error-alerta-shake">{errorModal}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalEquipo(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={!teamIdSelected}>Inscribir</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Programar Partido */}
      {modalPartido && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Programar Partido</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalPartido(false)}>&times;</button>
            </div>
            <form onSubmit={handleProgramarPartido}>
              <div className="admin-modal__body">
                {equiposInscritosValidos.length < 2 && (
                  <div className="admin-banner" style={{ marginBottom: '14px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
                    Aún no hay al menos dos equipos inscritos con estado <strong>INSCRITO</strong> en esta competencia. Inscribe equipos antes de programar partidos.
                  </div>
                )}
                {sedes.length === 0 && (
                  <div className="admin-banner" style={{ marginBottom: '14px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
                    No hay sedes en el catálogo. Puedes programar sin sede o pedir al administrador que registre sedes en Listas de valores.
                  </div>
                )}
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Jornada *</label>
                  <input type="number" required className="campo__input" value={nuevoPartido.matchday} onChange={e => setNuevoPartido({...nuevoPartido, matchday: parseInt(e.target.value)})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Equipo Local *</label>
                    <Combobox
                      opciones={equiposParaLocal.map(eq => ({ id: eq.equipo.id, nombre: eq.equipo.name, asociacion: eq.equipo.asociacion?.name }))}
                      valor={nuevoPartido.home_team_id}
                      onChange={(id) => setNuevoPartido({...nuevoPartido, home_team_id: id})}
                      placeholder="Buscar local..."
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Equipo Visitante *</label>
                    <Combobox
                      opciones={equiposParaVisitante.map(eq => ({ id: eq.equipo.id, nombre: eq.equipo.name, asociacion: eq.equipo.asociacion?.name }))}
                      valor={nuevoPartido.away_team_id}
                      onChange={(id) => setNuevoPartido({...nuevoPartido, away_team_id: id})}
                      placeholder="Buscar visitante..."
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo"><label className="campo__etiqueta">Fecha *</label><input type="date" required className="campo__input" min={hoyCR()} value={nuevoPartido.scheduled_date} onChange={e => setNuevoPartido({...nuevoPartido, scheduled_date: e.target.value})} /></div>
                  <div className="campo"><label className="campo__etiqueta">Hora *</label><input type="time" required className="campo__input" value={nuevoPartido.scheduled_time} onChange={e => setNuevoPartido({...nuevoPartido, scheduled_time: e.target.value})} /></div>
                </div>
                <div className="campo">
                  <label className="campo__etiqueta">Sede (Gimnasio)</label>
                  <select
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevoPartido.venue_id}
                    onChange={e => setNuevoPartido({ ...nuevoPartido, venue_id: e.target.value })}
                  >
                    <option value="">Sin sede / por definir</option>
                    {sedes.map(s => (
                      <option key={s.id} value={s.id}>{s.value}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorModal && <div key={shakeKey} className="error-alerta-shake">{errorModal}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalPartido(false)}>Cancelar</button>
                  <button
                    type="submit"
                    className="admin-btn admin-btn--primary"
                    disabled={!partidoListoParaProgramar}
                    title={!partidoListoParaProgramar ? 'Selecciona jornada, equipos inscritos, fecha y hora' : 'Programar el partido'}
                  >
                    Programar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reprogramar Partido */}
      {modalReprogramar && partidoReprogramar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Reprogramar / Cambiar Estado</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalReprogramar(false)}>&times;</button>
            </div>
            <form onSubmit={handleReprogramarPartido}>
              <div className="admin-modal__body">
                <p style={{ fontWeight: 700, marginBottom: '16px' }}>{partidoReprogramar.local?.name} vs {partidoReprogramar.visitante?.name}</p>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nuevo Estado</label>
                  <select className="admin-select" style={{ width: '100%' }} value={formReprogramar.status} onChange={e => setFormReprogramar({...formReprogramar, status: e.target.value})}>
                    <option value="PROGRAMADO">Programado (Normal)</option>
                    <option value="REPROGRAMADO">Reprogramado</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo"><label className="campo__etiqueta">Nueva Fecha</label><input type="date" required className="campo__input" min={hoyCR()} value={formReprogramar.scheduled_date} onChange={e => setFormReprogramar({...formReprogramar, scheduled_date: e.target.value})} /></div>
                  <div className="campo"><label className="campo__etiqueta">Nueva Hora</label><input type="time" required className="campo__input" value={formReprogramar.scheduled_time} onChange={e => setFormReprogramar({...formReprogramar, scheduled_time: e.target.value})} /></div>
                </div>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nueva Sede</label>
                  <select
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={formReprogramar.venue_id}
                    onChange={e => setFormReprogramar({ ...formReprogramar, venue_id: e.target.value })}
                  >
                    <option value="">Sin sede / por definir</option>
                    {sedes.map(s => (
                      <option key={s.id} value={s.id}>{s.value}</option>
                    ))}
                  </select>
                </div>
                <div className="campo"><label className="campo__etiqueta">Motivo del cambio *</label><textarea required rows="2" className="campo__input" placeholder="Ej. Solicitud de la asociación por problemas de transporte" value={formReprogramar.reason} onChange={e => setFormReprogramar({...formReprogramar, reason: e.target.value})} /></div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorModal && <div key={shakeKey} className="error-alerta-shake">{errorModal}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalReprogramar(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--primary">Guardar Cambios</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirmación reutilizable */}
      {modalConfirmacion && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">{modalConfirmacion.titulo}</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalConfirmacion(null)}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: modalConfirmacion.tipo === 'peligro' ? '#fee2e2' : '#eff6ff',
                  color: modalConfirmacion.tipo === 'peligro' ? '#b91c1c' : '#1e40af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '1.3rem'
                }}>
                  <Icono nombre={modalConfirmacion.tipo === 'peligro' ? 'alerta' : 'info'} tam={22} />
                </div>
                <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                  {modalConfirmacion.mensaje}
                </p>
              </div>
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalConfirmacion(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={modalConfirmacion.tipo === 'peligro' ? 'admin-btn admin-btn--danger' : 'admin-btn admin-btn--primary'}
                onClick={modalConfirmacion.onConfirmar}
              >
                {modalConfirmacion.textoConfirmar || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Rechazo del cambio pendiente de nómina */}
      {modalRechazoNomina && nominaPendiente && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Rechazar cambio de nómina</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalRechazoNomina(false)}>&times;</button>
            </div>
            <form onSubmit={handleRechazarPendiente}>
              <div className="admin-modal__body">
                <p style={{ marginTop: 0, color: 'var(--texto-suave)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  El cambio «{nominaPendiente.changes_summary || 'Nómina'}» quedará rechazado y la nómina oficial se mantendrá intacta.
                </p>
                <div className="campo">
                  <label className="campo__etiqueta">Motivo del rechazo *</label>
                  <textarea
                    required
                    rows="3"
                    className="campo__input"
                    placeholder="Explica por qué se rechaza el cambio..."
                    value={motivoRechazoNomina}
                    onChange={e => setMotivoRechazoNomina(e.target.value)}
                  />
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorRechazoNomina && <div key={shakeKeyRechazoNomina} className="error-alerta-shake">{errorRechazoNomina}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalRechazoNomina(false)}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--danger">Rechazar cambio</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Generación automática de calendario */}
      <GenerarCalendarioModal
        isOpen={modalGenerarCal}
        onClose={() => setModalGenerarCal(false)}
        competitionId={id}
        competitionName={competencia.name}
        hasExistingMatches={tienePartidos}
        onSuccess={() => cargarTodo()}
      />

      {/* MODAL: Confirmación para regenerar calendario (cuando ya hay partidos sin jugar) */}
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
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => { setModalConfirmarRegenerar(false); setModalGenerarCal(true); }}>Sí, continuar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}