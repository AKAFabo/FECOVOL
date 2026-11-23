import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import '../admin/AdminCommon.css';

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

// Máximo de sets permitidos en un partido de voleibol
const MAX_SETS = 5;

// Define los tipos de resultado especial y su etiqueta legible.
// Los sets no se registran pero el backend fija sets ganados para la tabla.
const RESULTADOS_ESPECIALES = {
  NO_PRESENTADO_LOCAL:          { label: 'No presentación del equipo local' },
  NO_PRESENTADO_VISITANTE:      { label: 'No presentación del equipo visitante' },
  GANADO_POR_DEFECTO_LOCAL:     { label: 'Victoria por defecto del local' },
  GANADO_POR_DEFECTO_VISITANTE: { label: 'Victoria por defecto del visitante' },
  SUSPENDIDO_DEFINITIVO:        { label: 'Suspendido definitivamente' }
};

export default function ResultadoDetalle({ basePath = '/personal' }) {
  const { matchId } = useParams();
  const navigate = useNavigate();

  // Declara los estados principales
  const [partido, setPartido] = useState(null);
  const [competencia, setCompetencia] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Declara los estados del marcador
  const [setsResultado, setSetsResultado] = useState([{ set_number: 1, home_points: 0, away_points: 0 }]);

  // Declara los estados de evidencias
  const [archivoEvidencia, setArchivoEvidencia] = useState(null);
  const [tipoEvidencia, setTipoEvidencia] = useState('HOJA_ANOTACION');
  const [descripcionEvidencia, setDescripcionEvidencia] = useState('');
  const [errorEvidencia, setErrorEvidencia] = useState('');
  const [shakeKeyEvidencia, setShakeKeyEvidencia] = useState(0);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);

  // Declara los estados del modal de eliminación de evidencia
  const [evidenciaAEliminar, setEvidenciaAEliminar] = useState(null);
  const [eliminandoEvidencia, setEliminandoEvidencia] = useState(false);
  const [errorEliminarEvidencia, setErrorEliminarEvidencia] = useState('');
  const [shakeKeyEliminarEvidencia, setShakeKeyEliminarEvidencia] = useState(0);

  // Declara los estados de guardado
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [shakeKeyGuardar, setShakeKeyGuardar] = useState(0);

  // Declara el estado del modal de motivo de corrección
  const [modalMotivo, setModalMotivo] = useState(null);

  // Declara el estado del modal de resultado especial
  const [modalResultadoEspecial, setModalResultadoEspecial] = useState(false);
  const [formResultadoEspecial, setFormResultadoEspecial] = useState({ result_type: 'NO_PRESENTADO_LOCAL', resolution_notes: '' });
  const [errorResultadoEspecial, setErrorResultadoEspecial] = useState('');
  const [shakeKeyResultadoEspecial, setShakeKeyResultadoEspecial] = useState(0);
  const [procesandoEspecial, setProcesandoEspecial] = useState(false);

  // Declara el estado del modal de confirmación para revertir el resultado especial
  const [modalRevertirEspecial, setModalRevertirEspecial] = useState(false);
  const [errorRevertirEspecial, setErrorRevertirEspecial] = useState('');
  const [shakeKeyRevertirEspecial, setShakeKeyRevertirEspecial] = useState(0);

  // Carga los datos al montar el componente
  useEffect(() => { cargarTodo(); }, [matchId]);

  async function cargarTodo() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      // Carga primero el partido para conocer su competencia
      const resMatch = await fetch(`${backendUrl}/api/matches/${matchId}`);
      if (!resMatch.ok) {
        setError('Partido no encontrado.');
        setCargando(false);
        return;
      }
      const jsonMatch = await resMatch.json();
      const match = jsonMatch.data;
      setPartido(match);

      // Inicializa los sets (si ya existen o con un set vacío) sin exceder el máximo
      if (match.sets && match.sets.length > 0) {
        setSetsResultado(match.sets.slice(0, MAX_SETS));
      } else {
        setSetsResultado([{ set_number: 1, home_points: 0, away_points: 0 }]);
      }

      // Carga el resto en paralelo
      const [resComp, resChecklist, resEvidencias] = await Promise.all([
        fetch(`${backendUrl}/api/competitions/${match.competition_id}`),
        fetch(`${backendUrl}/api/matches/${matchId}/validation-checklist`, { headers: { 'x-user-email': user?.email || '' } }),
        fetch(`${backendUrl}/api/matches/${matchId}/evidence`, { headers: { 'x-user-email': user?.email || '' } })
      ]);

      if (resComp.ok) setCompetencia((await resComp.json()).data);
      if (resChecklist.ok) setChecklist((await resChecklist.json()).data || []);
      if (resEvidencias.ok) setEvidencias((await resEvidencias.json()).data || []);
    } catch (err) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar el partido.');
    } finally {
      setCargando(false);
    }
  }

  // Agrega un set al marcador. Bloquea si ya alcanzó el máximo reglamentario.
  function agregarSet() {
    if (setsResultado.length >= MAX_SETS) return;
    setSetsResultado([
      ...setsResultado,
      { set_number: setsResultado.length + 1, home_points: 0, away_points: 0 }
    ]);
  }

  // Remueve un set del marcador y renumera los restantes
  function removerSet(index) {
    setSetsResultado(
      setsResultado
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, set_number: i + 1 }))
    );
  }

  // Pide el motivo de corrección con un modal cuando el partido ya está finalizado
  function pedirMotivoCorreccion() {
    return new Promise((resolve) => {
      if (partido?.status !== 'FINALIZADO') return resolve('');
      setModalMotivo({
        valor: '',
        onConfirmar: (motivo) => {
          setModalMotivo(null);
          resolve(motivo);
        },
        onCancelar: () => {
          setModalMotivo(null);
          resolve(null);
        }
      });
    });
  }

  // Valida reglas de sets antes de enviar al backend
  function validarSets() {
    if (setsResultado.length === 0) {
      return 'Debes registrar al menos un set.';
    }
    if (setsResultado.length > MAX_SETS) {
      return `Un partido no puede tener más de ${MAX_SETS} sets.`;
    }

    const numeros = new Set();
    for (const s of setsResultado) {
      if (!Number.isInteger(s.set_number) || s.set_number < 1 || s.set_number > MAX_SETS) {
        return `El set ${s.set_number} tiene un número inválido. Debe estar entre 1 y ${MAX_SETS}.`;
      }
      if (numeros.has(s.set_number)) {
        return `El set ${s.set_number} está duplicado.`;
      }
      numeros.add(s.set_number);

      if (!Number.isInteger(s.home_points) || !Number.isInteger(s.away_points)) {
        return `Los puntos del set ${s.set_number} deben ser números enteros.`;
      }
      if (s.home_points < 0 || s.away_points < 0) {
        return `Los puntos del set ${s.set_number} no pueden ser negativos.`;
      }
      if (s.home_points === s.away_points) {
        return `El set ${s.set_number} no puede terminar en empate.`;
      }
    }

    return null;
  }

  // Sube el archivo seleccionado al backend (multipart).
  // Valida tipo MIME y tamaño antes de enviar para dar un mensaje claro.
  async function handleAgregarEvidencia(e) {
    e.preventDefault();
    setErrorEvidencia('');

    if (!archivoEvidencia) {
      setErrorEvidencia('Debes seleccionar un archivo antes de adjuntarlo.');
      setShakeKeyEvidencia(prev => prev + 1);
      return;
    }

    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(archivoEvidencia.type)) {
      setErrorEvidencia('Solo se aceptan archivos PDF, JPG o PNG.');
      setShakeKeyEvidencia(prev => prev + 1);
      return;
    }

    if (archivoEvidencia.size > 10 * 1024 * 1024) {
      setErrorEvidencia('El archivo supera el límite de 10 MB.');
      setShakeKeyEvidencia(prev => prev + 1);
      return;
    }

    setSubiendoEvidencia(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const formData = new FormData();
      formData.append('file', archivoEvidencia);
      formData.append('file_type', tipoEvidencia);
      if (descripcionEvidencia.trim()) {
        formData.append('description', descripcionEvidencia.trim());
      }

      // No pongas Content-Type manual; el navegador lo resuelve con el boundary
      const res = await fetch(`${backendUrl}/api/matches/${matchId}/evidence`, {
        method: 'POST',
        headers: { 'x-user-email': user?.email || '' },
        body: formData
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al subir la evidencia.');

      // Limpia el formulario y recarga la lista + checklist
      setArchivoEvidencia(null);
      setDescripcionEvidencia('');
      const inputFile = document.getElementById('evidencia-file');
      if (inputFile) inputFile.value = '';

      const [resEv, resChk] = await Promise.all([
        fetch(`${backendUrl}/api/matches/${matchId}/evidence`, { headers: { 'x-user-email': user?.email || '' } }),
        fetch(`${backendUrl}/api/matches/${matchId}/validation-checklist`, { headers: { 'x-user-email': user?.email || '' } })
      ]);
      if (resEv.ok) setEvidencias((await resEv.json()).data || []);
      if (resChk.ok) setChecklist((await resChk.json()).data || []);
    } catch (err) {
      setErrorEvidencia(err.message);
      setShakeKeyEvidencia(prev => prev + 1);
    } finally {
      setSubiendoEvidencia(false);
    }
  }

  // Abre el modal de confirmación para eliminar una evidencia.
  function abrirModalEliminarEvidencia(evidencia) {
    setErrorEliminarEvidencia('');
    setEvidenciaAEliminar(evidencia);
  }

  // Ejecuta el borrado cuando el usuario confirma en el modal.
  async function handleEliminarEvidenciaConfirmada() {
    if (!evidenciaAEliminar) return;
    setErrorEliminarEvidencia('');
    setEliminandoEvidencia(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/${matchId}/evidence/${evidenciaAEliminar.id}`, {
        method: 'DELETE',
        headers: { 'x-user-email': user?.email || '' }
      });
      if (!res.ok) throw new Error((await res.json()).error);

      // Actualiza la lista local de evidencias
      setEvidencias(prev => prev.filter(e => e.id !== evidenciaAEliminar.id));
      setEvidenciaAEliminar(null);

      // Recarga el checklist para reflejar que ya no hay hoja de anotación
      const resChk = await fetch(`${backendUrl}/api/matches/${matchId}/validation-checklist`, { headers: { 'x-user-email': user?.email || '' } });
      if (resChk.ok) setChecklist((await resChk.json()).data || []);

    } catch (err) {
      setErrorEliminarEvidencia(err.message);
      setShakeKeyEliminarEvidencia(prev => prev + 1);
    } finally {
      setEliminandoEvidencia(false);
    }
  }

  // Guarda el borrador (solo sets)
  async function handleGuardarBorrador() {
    setErrorGuardar('');

    const errorSets = validarSets();
    if (errorSets) {
      setErrorGuardar(errorSets);
      setShakeKeyGuardar(prev => prev + 1);
      return;
    }

    const correction_reason = await pedirMotivoCorreccion();
    if (correction_reason === null) {
      setErrorGuardar('Debes indicar el motivo de la corrección para modificar un resultado finalizado.');
      setShakeKeyGuardar(prev => prev + 1);
      return;
    }

    setGuardando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const body = { sets: setsResultado };
      if (correction_reason) body.correction_reason = correction_reason;

      const res = await fetch(`${backendUrl}/api/matches/${matchId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      // Recarga el checklist
      const resChk = await fetch(`${backendUrl}/api/matches/${matchId}/validation-checklist`, { headers: { 'x-user-email': user?.email || '' } });
      if (resChk.ok) setChecklist((await resChk.json()).data || []);
    } catch (err) {
      setErrorGuardar(err.message);
      setShakeKeyGuardar(prev => prev + 1);
    } finally {
      setGuardando(false);
    }
  }

  // Valida y publica el resultado
  async function handleValidarYPublicar() {
    setErrorGuardar('');

    const errorSets = validarSets();
    if (errorSets) {
      setErrorGuardar(errorSets);
      setShakeKeyGuardar(prev => prev + 1);
      return;
    }

    const correction_reason = await pedirMotivoCorreccion();
    if (correction_reason === null) {
      setErrorGuardar('Debes indicar el motivo de la corrección para modificar un resultado finalizado.');
      setShakeKeyGuardar(prev => prev + 1);
      return;
    }

    setGuardando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      // 1. Guarda sets
      const bodySets = { sets: setsResultado };
      if (correction_reason) bodySets.correction_reason = correction_reason;

      const resSets = await fetch(`${backendUrl}/api/matches/${matchId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify(bodySets)
      });
      if (!resSets.ok) throw new Error((await resSets.json()).error);

      // 2. Finaliza (valida checklist)
      const resFin = await fetch(`${backendUrl}/api/matches/${matchId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' }
      });
      if (!resFin.ok) throw new Error((await resFin.json()).error);

      // 3. Navega de vuelta al listado de resultados del entorno actual.
      navigate(`${basePath}/resultados`);
    } catch (err) {
      setErrorGuardar(err.message);
      setShakeKeyGuardar(prev => prev + 1);
    } finally {
      setGuardando(false);
    }
  }

  // Registra un resultado especial y recarga el partido
  async function handleRegistrarResultadoEspecial(e) {
    e.preventDefault();
    setErrorResultadoEspecial('');
    if (!formResultadoEspecial.result_type) {
      setErrorResultadoEspecial('Debes seleccionar un tipo de resultado especial.');
      setShakeKeyResultadoEspecial(prev => prev + 1);
      return;
    }
    if (!formResultadoEspecial.resolution_notes.trim()) {
      setErrorResultadoEspecial('Debes indicar la resolución o motivo del resultado especial.');
      setShakeKeyResultadoEspecial(prev => prev + 1);
      return;
    }
    setProcesandoEspecial(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/${matchId}/special-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify(formResultadoEspecial)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al registrar el resultado especial.');
      setModalResultadoEspecial(false);
      setFormResultadoEspecial({ result_type: 'NO_PRESENTADO_LOCAL', resolution_notes: '' });
      await cargarTodo();
    } catch (err) {
      setErrorResultadoEspecial(err.message);
      setShakeKeyResultadoEspecial(prev => prev + 1);
    } finally {
      setProcesandoEspecial(false);
    }
  }

  // Revierte el resultado especial y deja el partido como programado
  async function handleRevertirResultadoEspecial() {
    setErrorRevertirEspecial('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/matches/${matchId}/special-result`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Error al revertir el resultado especial.');
      setModalRevertirEspecial(false);
      await cargarTodo();
    } catch (err) {
      setErrorRevertirEspecial(err.message);
      setShakeKeyRevertirEspecial(prev => prev + 1);
    }
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando partido...</div>;
  if (error || !partido) return <div style={{ padding: '40px', textAlign: 'center' }}>{error || 'Partido no encontrado.'}</div>;

  // Encuentra el árbitro principal
  const arbitroPrincipal = (partido.arbitraje || []).find(a => a.puesto?.code === 'PRI' && a.status !== 'ANULADA');
  const nombreArbitro = arbitroPrincipal ? `${arbitroPrincipal.arbitro?.first_name} ${arbitroPrincipal.arbitro?.last_name}` : 'Sin designar';

  // Nombre visible de la sede
  const nombreSede = partido?.sede?.value || 'Por definir';

  // Calcula los sets ganados hasta ahora
  let homeWins = 0, awayWins = 0;
  setsResultado.forEach(s => {
    if (s.home_points > s.away_points) homeWins++;
    else if (s.away_points > s.home_points) awayWins++;
  });

  const esFinalizado = partido.status === 'FINALIZADO';
  const alcanzoMaxSets = setsResultado.length >= MAX_SETS;
  const esEspecial = partido.result_type && partido.result_type !== 'NORMAL';

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>

      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
        <span style={{ fontSize: '0.8rem', color: 'var(--rojo)', fontWeight: 700, cursor: 'pointer' }} onClick={() => navigate(`${basePath}/resultados`)}>
          ← Volver a resultados
        </span>
          <h1 style={{ marginTop: '8px' }}>Registrar resultado</h1>
          <p className="admin-page-header__subtitle">
            {competencia?.name} · Jornada {partido.matchday} · Partido #{partido.match_number}
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => navigate(`${basePath}/resultados`)}>Volver al calendario</button>
        </div>
      </div>

      {esFinalizado && !esEspecial && (
        <div className="admin-banner" style={{ marginBottom: '16px', background: '#fff7ed', borderColor: '#f97316', color: '#9a3412' }}>
          Este partido ya está <strong>FINALIZADO</strong>. Cualquier cambio al marcador te pedirá un motivo de corrección y quedará registrado en la bitácora.
        </div>
      )}

      {esEspecial && (
        <div className="admin-banner" style={{ marginBottom: '16px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
          <strong>Resultado especial activo: {RESULTADOS_ESPECIALES[partido.result_type]?.label || partido.result_type}</strong>
          <div style={{ marginTop: '6px', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {partido.resolution_notes || 'Sin notas registradas.'}
          </div>
          <div style={{ marginTop: '10px' }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              style={{ padding: '4px 12px', fontSize: '0.78rem' }}
              onClick={() => { setErrorRevertirEspecial(''); setModalRevertirEspecial(true); }}
            >
              Revertir a resultado normal
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
        <div>
          {/* Encabezado del partido */}
          <div className="admin-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: 'var(--avatar)', borderRadius: '50%', margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--texto)' }}>{partido.local?.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>Local</div>
              </div>
              <div style={{ textAlign: 'center', padding: '0 24px' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--azul)', fontFamily: 'var(--fuente-titulo)', lineHeight: 1 }}>
                  {homeWins} — {awayWins}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>Sets ganados</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: 'var(--avatar)', borderRadius: '50%', margin: '0 auto 12px' }} />
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--texto)' }}>{partido.visitante?.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>Visitante</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', borderTop: '1px solid var(--linea)', paddingTop: '16px', marginTop: '16px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Fecha</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--texto)', fontWeight: 600, marginTop: '2px' }}>{formatearFecha(partido.scheduled_date)} · {partido.scheduled_time}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Sede</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--texto)', fontWeight: 600, marginTop: '2px' }}>{nombreSede}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Árbitro principal</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--texto)', fontWeight: 600, marginTop: '2px' }}>{nombreArbitro}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Estado del acta</div>
                <div style={{ marginTop: '2px' }}>
                  <span className={`badge-status ${partido.acta_status === 'VALIDADA' ? 'badge-status--activa' : partido.acta_status === 'ENVIADA' ? 'badge-status--inactivo' : 'badge-status--suspendida'}`}>
                    {partido.acta_status || 'BORRADOR'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Marcador por set */}
          <div className="admin-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem', margin: 0, fontFamily: 'var(--fuente-titulo)' }}>Marcador por set</h3>
              <span className={`badge-status ${alcanzoMaxSets ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                {setsResultado.length} / {MAX_SETS} sets
              </span>
            </div>
            {esEspecial && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: '6px', fontSize: '0.85rem' }}>
                El marcador por set no aplica porque hay un resultado especial activo. Reviértelo desde el banner superior para volver a registrar sets.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 100px', gap: '12px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-mudo)', fontWeight: 700, paddingBottom: '8px', borderBottom: '1px solid var(--linea)' }}>
              <div>Set</div>
              <div style={{ textAlign: 'center' }}>{partido.local?.name}</div>
              <div style={{ textAlign: 'center' }}>{partido.visitante?.name}</div>
              <div style={{ textAlign: 'right' }}>Resultado</div>
            </div>
            {setsResultado.map((set, idx) => {
              const ganaLocal = set.home_points > set.away_points;
              const ganaVisita = set.away_points > set.home_points;
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 100px', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--linea)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--texto)' }}>{set.set_number}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input type="number" min="0" disabled={esEspecial} className="campo__input" style={{ width: '70px', textAlign: 'center', fontWeight: 700, fontSize: '1rem' }} value={set.home_points} onChange={e => {
                      const nuevos = [...setsResultado]; nuevos[idx].home_points = parseInt(e.target.value) || 0; setSetsResultado(nuevos);
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <input type="number" min="0" disabled={esEspecial} className="campo__input" style={{ width: '70px', textAlign: 'center', fontWeight: 700, fontSize: '1rem' }} value={set.away_points} onChange={e => {
                      const nuevos = [...setsResultado]; nuevos[idx].away_points = parseInt(e.target.value) || 0; setSetsResultado(nuevos);
                    }} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {ganaLocal && <span className="badge-status badge-status--activa">LOCAL</span>}
                    {ganaVisita && <span className="badge-status badge-status--inactivo">VISITANTE</span>}
                    {!ganaLocal && !ganaVisita && <span className="badge-status" style={{ background: 'var(--neutro-fondo)', color: 'var(--neutro)' }}>—</span>}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={agregarSet}
                style={{ fontSize: '0.82rem' }}
                disabled={alcanzoMaxSets || esEspecial}
                title={alcanzoMaxSets ? `Un partido solo admite ${MAX_SETS} sets` : 'Agrega un set más'}
              >
                + Agregar Set
              </button>
              {setsResultado.length > 1 && (
                <button type="button" disabled={esEspecial} className="admin-btn admin-btn--secondary" onClick={() => removerSet(setsResultado.length - 1)} style={{ fontSize: '0.82rem' }}>− Quitar último set</button>
              )}
              {alcanzoMaxSets && (
                <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', marginLeft: 'auto' }}>
                  Ya alcanzaste el máximo de {MAX_SETS} sets.
                </span>
              )}
            </div>
          </div>

          {/* Evidencias */}
          <div className="admin-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', fontFamily: 'var(--fuente-titulo)' }}>Hoja de anotación y evidencias</h3>
            <form onSubmit={handleAgregarEvidencia} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {errorEvidencia && <div key={shakeKeyEvidencia} className="error-alerta-shake">{errorEvidencia}</div>}

              <div className="campo" style={{ marginBottom: 0 }}>
                <label className="campo__etiqueta">Archivo (PDF, JPG o PNG, máx. 10 MB) *</label>
                <input
                  id="evidencia-file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  capture="environment"
                  className="campo__input"
                  onChange={e => setArchivoEvidencia(e.target.files?.[0] || null)}
                />
                {archivoEvidencia && (
                  <small style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>
                    {archivoEvidencia.name} · {(archivoEvidencia.size / 1024 / 1024).toFixed(2)} MB
                  </small>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                <select className="admin-select" value={tipoEvidencia} onChange={e => setTipoEvidencia(e.target.value)}>
                  <option value="HOJA_ANOTACION">Hoja de anotación</option>
                  <option value="FOTO_EQUIPO">Foto de equipo</option>
                  <option value="OTRO">Otro</option>
                </select>
                <input
                  type="text"
                  className="campo__input"
                  placeholder="Descripción (opcional)"
                  value={descripcionEvidencia}
                  onChange={e => setDescripcionEvidencia(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="admin-btn admin-btn--primary" style={{ fontSize: '0.82rem' }} disabled={subiendoEvidencia || !archivoEvidencia}>
                  {subiendoEvidencia ? 'Subiendo archivo…' : 'Subir evidencia'}
                </button>
              </div>
            </form>

            {evidencias.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {evidencias.map(ev => {
                  const urlVisible = ev.signed_url || ev.file_url;
                  return (
                    <li key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fff', border: '1px solid var(--linea)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span className={`badge-status ${ev.file_type === 'HOJA_ANOTACION' ? 'badge-status--activa' : 'badge-status--inactivo'}`} style={{ fontSize: '0.7rem', flexShrink: 0 }}>{ev.file_type.replace('_', ' ')}</span>
                        {urlVisible ? (
                          <a href={urlVisible} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--azul)', textDecoration: 'underline', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.file_name || 'Ver archivo'}
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>{ev.file_name || 'Archivo no disponible'}</span>
                        )}
                        {ev.description && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)', fontStyle: 'italic' }}>· {ev.description}</span>
                        )}
                      </div>
                      <button type="button" onClick={() => abrirModalEliminarEvidencia(ev)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }} title="Eliminar">&times;</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {evidencias.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)', background: 'var(--campo)', borderRadius: '6px', fontSize: '0.85rem' }}>
                No hay evidencias adjuntas al partido.
              </div>
            )}
          </div>
        </div>

        <aside>
          <div className="admin-card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', fontFamily: 'var(--fuente-titulo)' }}>Validaciones</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checklist.map(item => (
                <li key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem' }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>
                    {item.passed ? '✅' : (item.warning ? '⚠️' : '❌')}
                  </span>
                  <span style={{ color: item.passed ? 'var(--texto)' : (item.warning ? 'var(--aviso)' : 'var(--rojo)') }}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-card" style={{ padding: '16px' }}>
            {errorGuardar && <div key={shakeKeyGuardar} className="error-alerta-shake" style={{ marginBottom: '12px' }}>{errorGuardar}</div>}
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              style={{ width: '100%', marginBottom: '8px' }}
              onClick={handleValidarYPublicar}
              disabled={guardando || esEspecial}
            >
              {guardando ? 'Procesando...' : 'Validar y publicar'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              style={{ width: '100%' }}
              onClick={handleGuardarBorrador}
              disabled={guardando || esEspecial}
            >
              Guardar borrador
            </button>
          </div>

          {partido.result_type === 'NORMAL' && (
            <div className="admin-card" style={{ padding: '16px', marginTop: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontFamily: 'var(--fuente-titulo)' }}>Resultado especial</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, lineHeight: 1.5, marginBottom: '12px' }}>
                No presentación, victoria por defecto o suspensión definitiva.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={() => { setErrorResultadoEspecial(''); setFormResultadoEspecial({ result_type: 'NO_PRESENTADO_LOCAL', resolution_notes: '' }); setModalResultadoEspecial(true); }}
              >
                Registrar resultado especial
              </button>
            </div>
          )}

          <div className="admin-card" style={{ padding: '20px', marginTop: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '12px', fontFamily: 'var(--fuente-titulo)' }}>Incidentes del partido</h3>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--linea)' }}>
              <div style={{ width: '8px', height: '40px', background: '#c8102e', borderRadius: '4px' }}></div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--texto)' }}>Módulo en construcción</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
                  Los incidentes del partido serán gestionados por el módulo de Incidentes y Sanciones.
                </div>
              </div>
            </div>
            {/* TODO: Integrar con módulo de Incidentes y Sanciones (Estudiante 4). */}
          </div>
        </aside>
      </div>

      {/* MODAL: Motivo de corrección */}
      {modalMotivo && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Motivo de la corrección</h3>
              <button type="button" className="admin-modal__close" onClick={() => modalMotivo.onCancelar()}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <p style={{ marginTop: 0, color: 'var(--texto-suave)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Este partido ya está finalizado. Indica el motivo de la corrección. Quedará registrado en la bitácora.
              </p>
              <div className="campo">
                <label className="campo__etiqueta">Motivo *</label>
                <textarea
                  rows="3"
                  className="campo__input"
                  placeholder="Ej. Corrección de un error de digitación en el set 2"
                  value={modalMotivo.valor}
                  onChange={(e) => setModalMotivo({ ...modalMotivo, valor: e.target.value })}
                  autoFocus
                />
              </div>
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => modalMotivo.onCancelar()}>
                Cancelar
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => {
                  const motivo = modalMotivo.valor.trim();
                  if (!motivo) return;
                  modalMotivo.onConfirmar(motivo);
                }}
                disabled={!modalMotivo.valor.trim()}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar resultado especial */}
      {modalResultadoEspecial && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '540px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Registrar resultado especial</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalResultadoEspecial(false)}>&times;</button>
            </div>
            <form onSubmit={handleRegistrarResultadoEspecial}>
              <div className="admin-modal__body">
                <p style={{ marginTop: 0, color: 'var(--texto-mudo)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  Al registrar un resultado especial, se descartan los sets del partido y el resultado previo. En "no presentación" y "victoria por defecto" el marcador se fija en 3-0. En "suspendido definitivo" el partido queda fuera de la tabla hasta que FECOVOL dicte la resolución.
                </p>
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Tipo de resultado *</label>
                  <select
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={formResultadoEspecial.result_type}
                    onChange={e => setFormResultadoEspecial({ ...formResultadoEspecial, result_type: e.target.value })}
                  >
                    <option value="NO_PRESENTADO_LOCAL">No presentación del local</option>
                    <option value="NO_PRESENTADO_VISITANTE">No presentación del visitante</option>
                    <option value="GANADO_POR_DEFECTO_LOCAL">Victoria por defecto del local</option>
                    <option value="GANADO_POR_DEFECTO_VISITANTE">Victoria por defecto del visitante</option>
                    <option value="SUSPENDIDO_DEFINITIVO">Suspendido definitivamente</option>
                  </select>
                </div>
                <div className="campo">
                  <label className="campo__etiqueta">Resolución o motivo *</label>
                  <textarea
                    required
                    rows="3"
                    className="campo__input"
                    placeholder="Describe la resolución administrativa..."
                    value={formResultadoEspecial.resolution_notes}
                    onChange={e => setFormResultadoEspecial({ ...formResultadoEspecial, resolution_notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
                {errorResultadoEspecial && <div key={shakeKeyResultadoEspecial} className="error-alerta-shake">{errorResultadoEspecial}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalResultadoEspecial(false)} disabled={procesandoEspecial}>Cancelar</button>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={procesandoEspecial}>{procesandoEspecial ? 'Registrando...' : 'Registrar resultado especial'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Revertir resultado especial */}
      {modalRevertirEspecial && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Revertir resultado especial</h3>
              <button type="button" className="admin-modal__close" onClick={() => setModalRevertirEspecial(false)}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                El resultado especial se eliminará y el partido volverá a estado <strong>PROGRAMADO</strong> con acta en <strong>BORRADOR</strong>. Podrás registrar sets normalmente. Esta acción queda en la bitácora.
              </p>
            </div>
            <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
              {errorRevertirEspecial && <div key={shakeKeyRevertirEspecial} className="error-alerta-shake">{errorRevertirEspecial}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalRevertirEspecial(false)}>Cancelar</button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={handleRevertirResultadoEspecial}>Sí, revertir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar eliminación de evidencia */}
      {evidenciaAEliminar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Eliminar evidencia</h3>
              <button type="button" className="admin-modal__close" onClick={() => setEvidenciaAEliminar(null)} disabled={eliminandoEvidencia}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '1.3rem'
                }}>⚠️</div>
                <div>
                  <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: 'var(--texto)', fontSize: '0.95rem' }}>
                    ¿Eliminar esta evidencia?
                  </p>
                  <p style={{ margin: 0, color: 'var(--texto-mudo)', fontSize: '0.85rem', lineHeight: 1.45 }}>
                    El archivo <strong>{evidenciaAEliminar.file_name || 'sin nombre'}</strong> se borrará del almacenamiento y de la base de datos. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
            </div>
            <div className="admin-modal__footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
              {errorEliminarEvidencia && <div key={shakeKeyEliminarEvidencia} className="error-alerta-shake">{errorEliminarEvidencia}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setEvidenciaAEliminar(null)} disabled={eliminandoEvidencia}>Cancelar</button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={handleEliminarEvidenciaConfirmada} disabled={eliminandoEvidencia}>
                  {eliminandoEvidencia ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}