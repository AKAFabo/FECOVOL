import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import '../pages/admin/AdminCommon.css';
import Icono from '../components/Icono.jsx';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

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

// Formatea una fecha ISO a texto corto dd-mmm
function formatFechaCorta(fechaISO) {
  if (!fechaISO) return '';
  const [, m, d] = fechaISO.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

// Formatea una fecha ISO a dd-mmm-yyyy
function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${d}-${MESES[m - 1]}-${y}`;
}

// Suma días a una fecha ISO y devuelve nueva fecha ISO
function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Genera un color estable para el avatar del equipo
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const paleta = ['#0e3b6b', '#1b6b31', '#a8501f', '#6b3080', '#0b5563', '#2f3d4c', '#8a3311'];
  return paleta[Math.abs(h) % paleta.length];
}

// Extrae iniciales del nombre del equipo para el avatar
function inicialesEquipo(nombre) {
  const partes = (nombre || '').trim().split(/\s+/);
  if (partes.length === 0) return '??';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// Genera enfrentamientos con el algoritmo round-robin (Berger).
// Recibe los equipos y devuelve un arreglo de jornadas. Si idaVuelta es true,
// agrega la segunda vuelta invirtiendo local y visitante.
function generarBerger(equipos, idaVuelta) {
  const lista = equipos.map(e => ({ ...e }));
  if (lista.length % 2 !== 0) lista.push({ id: null, nombre: 'DESCANSO', _descanso: true });

  const n = lista.length;
  const jornadas = [];
  const fijo = lista[0];
  let rotantes = lista.slice(1);

  for (let j = 0; j < n - 1; j++) {
    const partidos = [];
    const rival = rotantes[rotantes.length - 1];
    if (!fijo._descanso && !rival._descanso) {
      if (j % 2 === 0) partidos.push({ local: fijo, visitante: rival });
      else partidos.push({ local: rival, visitante: fijo });
    }
    for (let i = 0; i < (n - 2) / 2; i++) {
      const a = rotantes[i];
      const b = rotantes[rotantes.length - 2 - i];
      if (a._descanso || b._descanso) continue;
      if (i % 2 === 0) partidos.push({ local: a, visitante: b });
      else partidos.push({ local: b, visitante: a });
    }
    jornadas.push(partidos);
    rotantes = [rotantes[rotantes.length - 1], ...rotantes.slice(0, -1)];
  }

  if (!idaVuelta) return jornadas;
  const vueltas = jornadas.map(j => j.map(p => ({ local: p.visitante, visitante: p.local })));
  return [...jornadas, ...vueltas];
}

export default function GenerarCalendarioModal({ isOpen, onClose, competitionId, competitionName, hasExistingMatches, onSuccess }) {
  // Estado del flujo
  const [step, setStep] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  // Datos remotos
  const [equipos, setEquipos] = useState([]);
  const [sedesCatalogo, setSedesCatalogo] = useState([]);

  // Configuración
  const [fechaInicio, setFechaInicio] = useState('');
  const [diasEntre, setDiasEntre] = useState(7);
  const [horaDefault, setHoraDefault] = useState('19:00');
  const [sedeDefault, setSedeDefault] = useState('');
  const [sedesExtra, setSedesExtra] = useState([]);
  const [sedeParaAgregar, setSedeParaAgregar] = useState('');
  const [idaVuelta, setIdaVuelta] = useState(false);

  // Vista previa
  const [previewPartidos, setPreviewPartidos] = useState([]);

  // Modales internos
  const [partidoEditando, setPartidoEditando] = useState(null);
  const [jornadaEditando, setJornadaEditando] = useState(null);
  const [mostrarConfirmacionAplicar, setMostrarConfirmacionAplicar] = useState(false);

  // Carga equipos y sedes cuando se abre el modal
  useEffect(() => {
    if (!isOpen || !competitionId) return;
    setStep(1);
    setError('');
    setSedesExtra([]);
    setSedeDefault('');
    setIdaVuelta(false);
    setPreviewPartidos([]);
    setPartidoEditando(null);
    setJornadaEditando(null);
    setMostrarConfirmacionAplicar(false);
    cargarDatos();
  }, [isOpen, competitionId]);

  async function cargarDatos() {
    setCargando(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    try {
      const [resTeams, resSedes] = await Promise.all([
        fetch(`${backendUrl}/api/competitions/${competitionId}/teams`),
        fetch(`${backendUrl}/api/catalogs/Sedes/values`)
      ]);
      const jsonTeams = await resTeams.json();
      const jsonSedes = await resSedes.json();

      const inscritos = (jsonTeams.data || []).filter(t => t.status === 'INSCRITO');
      setEquipos(inscritos.map(t => ({ id: t.equipo.id, nombre: t.equipo.name })));
      setSedesCatalogo(jsonSedes.data || []);
    } catch (err) {
      setError('No se pudieron cargar los equipos o las sedes.');
    } finally {
      setCargando(false);
    }
  }

  // Lista combinada de sedes seleccionadas: la por defecto primero, luego las extra
  const sedesSeleccionadas = useMemo(() => {
    const lista = [];
    if (sedeDefault) lista.push(sedeDefault);
    sedesExtra.forEach(id => {
      if (!lista.includes(id)) lista.push(id);
    });
    return lista;
  }, [sedeDefault, sedesExtra]);

  const sedesDisponibles = useMemo(
    () => sedesCatalogo.map(s => ({ id: s.id, nombre: s.value })),
    [sedesCatalogo]
  );

  const sedesNoAgregadas = useMemo(
    () => sedesDisponibles.filter(s => !sedesSeleccionadas.includes(s.id)),
    [sedesDisponibles, sedesSeleccionadas]
  );

  // Nombre legible de una sede por id
  function nombreSede(sedeId) {
    const s = sedesCatalogo.find(x => x.id === sedeId);
    return s ? s.value : '—';
  }

  // Cuando se cambia la sede por defecto, la agrega como seleccionada
  function handleChangeSedeDefault(nuevoId) {
    setSedeDefault(nuevoId);
    if (nuevoId && !sedesExtra.includes(nuevoId)) {
      // No hace falta agregar a sedesExtra porque ya está como default
    }
  }

  function handleAgregarSede() {
    if (!sedeParaAgregar) {
      setError('Selecciona una sede para agregar.');
      setShakeKey(k => k + 1);
      return;
    }
    if (sedesSeleccionadas.includes(sedeParaAgregar)) {
      setError('Esa sede ya está en la lista.');
      setShakeKey(k => k + 1);
      return;
    }
    setSedesExtra(prev => [...prev, sedeParaAgregar]);
    setSedeParaAgregar('');
    setError('');
  }

  function handleQuitarSede(id) {
    if (id === sedeDefault) {
      setError('No puedes quitar la sede por defecto. Cambia la sede por defecto primero.');
      setShakeKey(k => k + 1);
      return;
    }
    setSedesExtra(prev => prev.filter(x => x !== id));
  }

  // Genera el preview a partir de la configuración
  function generarPreview() {
    if (equipos.length < 2) {
      setError('Necesitas al menos 2 equipos inscritos.');
      setShakeKey(k => k + 1);
      return;
    }
    if (!fechaInicio) {
      setError('Selecciona la fecha de inicio.');
      setShakeKey(k => k + 1);
      return;
    }
    if (!diasEntre || parseInt(diasEntre) < 1) {
      setError('Los días entre jornadas deben ser al menos 1.');
      setShakeKey(k => k + 1);
      return;
    }
    if (!sedeDefault) {
      setError('Debes seleccionar una sede por defecto antes de continuar.');
      setShakeKey(k => k + 1);
      return;
    }

    const jornadas = generarBerger(equipos, idaVuelta);
    const partidos = [];
    let num = 1;

    jornadas.forEach((jornada, idx) => {
      const fechaJ = sumarDias(fechaInicio, idx * parseInt(diasEntre));
      jornada.forEach(p => {
        partidos.push({
          id: 'preview-' + num,
          match_number: num++,
          jornada: idx + 1,
          fechaISO: fechaJ,
          hora: horaDefault,
          local: p.local.nombre,
          visitante: p.visitante.nombre,
          local_id: p.local.id,
          visitante_id: p.visitante.id,
          sede_id: sedeDefault,
          descanso: null
        });
      });
      // Registra el descanso en la primera fila de la jornada
      const idsEnJuego = new Set(jornada.flatMap(p => [p.local.id, p.visitante.id].filter(Boolean)));
      const ausente = equipos.find(e => !idsEnJuego.has(e.id));
      if (ausente && jornada[0]) {
        partidos[partidos.length - jornada.length].descanso = ausente.nombre;
      }
    });

    setPreviewPartidos(partidos);
    setError('');
    setStep(2);
  }

  // Aplica una nueva fecha a todos los partidos de una jornada en el preview
  function aplicarCambioJornada(jornada, nuevaFecha) {
    setPreviewPartidos(prev => prev.map(p =>
      p.jornada === jornada ? { ...p, fechaISO: nuevaFecha } : p
    ));
  }

  // Aplica cambio de hora y sede a un partido en el preview
  function aplicarCambioPartido(partidoId, hora, sedeId) {
    setPreviewPartidos(prev => prev.map(p =>
      p.id === partidoId ? { ...p, hora, sede_id: sedeId } : p
    ));
  }

  // Envía la generación al backend
  async function confirmarGeneracion() {
    setProcesando(true);
    setError('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const payload = {
        fecha_inicio: fechaInicio,
        dias_entre: parseInt(diasEntre),
        hora_default: horaDefault,
        sede_default_id: sedeDefault,
        ida_vuelta: idaVuelta,
        force: true
      };

      const res = await fetch(`${backendUrl}/api/competitions/${competitionId}/generate-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || 'Error al generar el calendario.');
      finalizarExito(json.data);
    } catch (err) {
      setError(err.message);
      setShakeKey(k => k + 1);
      setProcesando(false);
    }
  }

  function finalizarExito(data) {
    setProcesando(false);
    if (onSuccess) onSuccess(data);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <>
      <style>{ESTILOS_SHAKE}</style>
      <div className="admin-modal-overlay">
        <div className="admin-modal" style={{ maxWidth: '900px' }}>
          <div className="admin-modal__header">
            <div>
              <h3 className="admin-modal__title">Generar calendario automático</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
                {competitionName}
              </p>
            </div>
            <button type="button" className="admin-modal__close" onClick={onClose}>&times;</button>
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 24px', borderBottom: '1px solid var(--linea)' }}>
            {[
              { n: 1, label: 'Configurar' },
              { n: 2, label: 'Resumen' },
              { n: 3, label: 'Vista previa' }
            ].map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: step === s.n ? 'var(--azul)' : step > s.n ? 'var(--ok)' : 'var(--campo)',
                    color: step >= s.n ? '#fff' : 'var(--texto-mudo)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.78rem'
                  }}>{step > s.n ? <Icono nombre="check" tam={14} titulo="Completado" /> : s.n}</div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: step >= s.n ? 'var(--texto)' : 'var(--texto-mudo)' }}>
                    {s.label}
                  </span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: '2px', background: step > s.n ? 'var(--ok)' : 'var(--linea)', borderRadius: '2px' }} />}
              </div>
            ))}
          </div>

          <div className="admin-modal__body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {cargando && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando equipos y sedes...</div>}

            {!cargando && step === 1 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Fecha de la primera jornada *</label>
                    <input type="date" className="campo__input" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Días entre jornadas *</label>
                    <input type="number" min="1" className="campo__input" value={diasEntre} onChange={e => setDiasEntre(e.target.value)} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Hora por defecto *</label>
                    <input type="time" className="campo__input" value={horaDefault} onChange={e => setHoraDefault(e.target.value)} />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Sede por defecto *</label>
                    <select className="admin-select" value={sedeDefault} onChange={e => handleChangeSedeDefault(e.target.value)}>
                      <option value="">— Selecciona una sede —</option>
                      {sedesDisponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '16px', padding: '14px', background: '#f8fafc', border: '1px solid var(--linea)', borderRadius: '6px' }}>
                  <label className="campo__etiqueta" style={{ display: 'block', marginBottom: '6px' }}>
                    Sedes adicionales para esta generación
                  </label>
                  <p style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', margin: '0 0 10px' }}>
                    La sede por defecto se agrega automáticamente. Añade más sedes para asignarlas a partidos específicos en la vista previa.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <select className="admin-select" style={{ flex: 1 }} value={sedeParaAgregar} onChange={e => setSedeParaAgregar(e.target.value)}>
                      <option value="">— Selecciona una sede —</option>
                      {sedesNoAgregadas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={handleAgregarSede}>+ Agregar</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {sedesSeleccionadas.length === 0 && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--texto-tenue)', fontStyle: 'italic' }}>
                        Aún no hay sedes agregadas.
                      </span>
                    )}
                    {sedesSeleccionadas.map(id => {
                      const esDefault = id === sedeDefault;
                      return (
                        <span key={id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '4px 10px', borderRadius: '999px', fontSize: '0.8rem',
                          border: esDefault ? '1px solid #93c5fd' : '1px solid var(--borde)',
                          background: esDefault ? '#dbeafe' : '#fff',
                          color: esDefault ? '#1e40af' : 'var(--texto-suave)',
                          fontWeight: esDefault ? 600 : 400
                        }}>
                          {nombreSede(id)}
                          {esDefault && (
                            <span style={{ fontSize: '0.62rem', background: '#1e40af', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                              DEFECTO
                            </span>
                          )}
                          {!esDefault && (
                            <button type="button" onClick={() => handleQuitarSede(id)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}>
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={idaVuelta} onChange={e => setIdaVuelta(e.target.checked)} />
                  Ida y vuelta (duplica jornadas invirtiendo local/visitante)
                </label>
              </>
            )}

            {!cargando && step === 2 && (
              <ResumenGeneracion
                competencia={competitionName}
                equipos={equipos}
                partidos={previewPartidos}
                sedeDefault={nombreSede(sedeDefault)}
                fechaInicio={fechaInicio}
                diasEntre={diasEntre}
                idaVuelta={idaVuelta}
              />
            )}

            {!cargando && step === 3 && (
              <>
                <div style={{ marginBottom: '16px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: '6px' }}>
                  <strong><Icono nombre="alerta" tam={16} /> Aún no se ha aplicado el calendario.</strong>
                  <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                    Revisa los detalles y presiona "Aplicar calendario" para guardar los cambios en la base de datos.
                  </div>
                </div>
                <PreviewCalendario
                  partidos={previewPartidos}
                  sedes={sedesDisponibles.filter(s => sedesSeleccionadas.includes(s.id))}
                  onEditarJornada={(jornada) => setJornadaEditando(jornada)}
                  onEditarPartido={(partido) => setPartidoEditando(partido)}
                />
              </>
            )}

            {error && <div key={shakeKey} className="error-alerta-shake" style={{ marginTop: '12px' }}>{error}</div>}
          </div>

          <div className="admin-modal__footer" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose} disabled={procesando}>
              Cancelar
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              {step > 1 && (
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setStep(step - 1)} disabled={procesando}>
                  ← Atrás
                </button>
              )}
              {step === 1 && (
                <button type="button" className="admin-btn admin-btn--primary" onClick={generarPreview} disabled={cargando}>
                  Siguiente →
                </button>
              )}
              {step === 2 && (
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => setStep(3)}>
                  Continuar a vista previa →
                </button>
              )}
              {step === 3 && (
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => {
                  if (hasExistingMatches) setMostrarConfirmacionAplicar(true);
                  else confirmarGeneracion();
                }} disabled={procesando}>
                  {procesando ? 'Aplicando…' : 'Aplicar calendario'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal editar jornada (fecha) */}
      {jornadaEditando && (
        <EditarJornadaModal
          jornada={jornadaEditando}
          partidos={previewPartidos}
          onClose={() => setJornadaEditando(null)}
          onGuardar={(nuevaFecha) => {
            aplicarCambioJornada(jornadaEditando, nuevaFecha);
            setJornadaEditando(null);
          }}
        />
      )}

      {/* Modal editar partido (hora + sede) */}
      {partidoEditando && (
        <EditarPartidoModal
          partido={partidoEditando}
          sedes={sedesDisponibles.filter(s => sedesSeleccionadas.includes(s.id))}
          onClose={() => setPartidoEditando(null)}
          onGuardar={(hora, sedeId) => {
            aplicarCambioPartido(partidoEditando.id, hora, sedeId);
            setPartidoEditando(null);
          }}
        />
      )}

      {/* Modal confirmar aplicación con partidos existentes */}
      {mostrarConfirmacionAplicar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '480px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Confirmar regeneración</h3>
              <button type="button" className="admin-modal__close" onClick={() => setMostrarConfirmacionAplicar(false)}>&times;</button>
            </div>
            <div className="admin-modal__body">
              <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                Esta competencia ya tiene un calendario programado (ningún partido jugado aún). Si aplicas el nuevo, se borrarán todos los partidos actuales y se reemplazarán por los nuevos. ¿Deseas continuar?
              </p>
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setMostrarConfirmacionAplicar(false)}>Cancelar</button>
              <button type="button" className="admin-btn admin-btn--danger" onClick={() => { setMostrarConfirmacionAplicar(false); confirmarGeneracion(); }}>Sí, aplicar y reemplazar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- Sub-componentes ----------------

function PreviewCalendario({ partidos, sedes, onEditarJornada, onEditarPartido }) {
  const porJornada = {};
  partidos.forEach(p => {
    if (!porJornada[p.jornada]) porJornada[p.jornada] = [];
    porJornada[p.jornada].push(p);
  });
  const jornadas = Object.keys(porJornada).map(Number).sort((a, b) => a - b);

  return (
    <div>
      {jornadas.map(j => {
        const lista = porJornada[j];
        const fecha = lista[0].fechaISO;
        return (
          <div key={j} style={{ border: '1px solid var(--linea)', borderRadius: '6px', marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{
              background: '#f8fafc', padding: '10px 14px',
              borderBottom: '1px solid var(--linea)', borderLeft: '4px solid var(--azul)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>Jornada {j}</strong>
                <button type="button" className="admin-btn admin-btn--secondary"
                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                  onClick={() => onEditarJornada(j)}>
                  <Icono nombre="lapiz" tam={14} /> Editar fecha
                </button>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>{formatFechaCorta(fecha)}</span>
            </div>
            {lista.map(p => (
              <div key={p.id} style={{
                padding: '8px 14px', borderBottom: '1px solid var(--linea)',
                display: 'grid', gridTemplateColumns: '70px 1fr 50px 1fr auto 32px',
                alignItems: 'center', gap: '10px', fontSize: '0.85rem'
              }}>
                <span style={{ color: 'var(--texto-mudo)', fontSize: '0.78rem' }}>{p.hora}</span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                  <span style={{ fontWeight: 600 }}>{p.local}</span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: hashColor(p.local), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                    {inicialesEquipo(p.local)}
                  </span>
                </span>
                <span style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: '0.78rem', padding: '2px 8px', background: 'var(--campo)', borderRadius: '4px' }}>vs</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: hashColor(p.visitante), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                    {inicialesEquipo(p.visitante)}
                  </span>
                  <span style={{ fontWeight: 600 }}>{p.visitante}</span>
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sedes.find(s => s.id === p.sede_id)?.nombre || '—'}
                </span>
                <button type="button" className="admin-btn admin-btn--secondary"
                  style={{ padding: 0, width: '28px', height: '28px', fontSize: '0.85rem' }}
                  onClick={() => onEditarPartido(p)} title="Editar hora y sede" aria-label="Editar hora y sede">
                  <Icono nombre="lapiz" tam={14} />
                </button>
              </div>
            ))}
            {lista[0] && lista[0].descanso && (
              <div style={{ padding: '8px 14px', fontSize: '0.8rem', color: 'var(--aviso)', background: 'var(--aviso-fondo)', fontStyle: 'italic' }}>
                Descansa: <strong>{lista[0].descanso}</strong>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResumenGeneracion({ competencia, equipos, partidos, sedeDefault, fechaInicio, diasEntre, idaVuelta }) {
  const jornadas = new Set(partidos.map(p => p.jornada)).size;
  return (
    <table className="admin-table" style={{ border: '1px solid var(--borde)', fontSize: '0.85rem' }}>
      <tbody>
        <tr><td style={{ fontWeight: 600 }}>Competencia</td><td>{competencia}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Equipos</td><td>{equipos.length}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Jornadas</td><td>{jornadas}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Partidos totales</td><td>{partidos.length}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Modalidad</td><td>{idaVuelta ? 'Ida y vuelta' : 'Solo ida'}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Primera jornada</td><td>{formatearFecha(fechaInicio)}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Días entre jornadas</td><td>{diasEntre}</td></tr>
        <tr><td style={{ fontWeight: 600 }}>Sede por defecto</td><td>{sedeDefault}</td></tr>
      </tbody>
    </table>
  );
}

function EditarPartidoModal({ partido, sedes, onClose, onGuardar }) {
  const [hora, setHora] = useState(partido.hora);
  const [sedeId, setSedeId] = useState(partido.sede_id || '');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  function guardar() {
    if (!hora) { setError('Debes indicar la hora.'); setShakeKey(k => k + 1); return; }
    onGuardar(hora, sedeId || null);
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: '480px' }}>
        <div className="admin-modal__header">
          <h3 className="admin-modal__title">Editar partido</h3>
          <button type="button" className="admin-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal__body">
          <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--texto-suave)' }}>
            <strong>{partido.local}</strong> vs <strong>{partido.visitante}</strong>
            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
              Jornada {partido.jornada} · Partido #{partido.match_number}
            </span>
          </p>
          <div className="campo" style={{ marginBottom: '14px' }}>
            <label className="campo__etiqueta">Hora *</label>
            <input type="time" className="campo__input" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
          <div className="campo">
            <label className="campo__etiqueta">Sede</label>
            <select className="admin-select" value={sedeId} onChange={e => setSedeId(e.target.value)}>
              <option value="">— Sin sede / por definir —</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          {error && <div key={shakeKey} className="error-alerta-shake" style={{ marginTop: '12px' }}>{error}</div>}
        </div>
        <div className="admin-modal__footer">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function EditarJornadaModal({ jornada, partidos, onClose, onGuardar }) {
  const jornadas = [...new Set(partidos.map(p => p.jornada))].sort((a, b) => a - b);
  const fechasPorJornada = {};
  partidos.forEach(p => { if (!fechasPorJornada[p.jornada]) fechasPorJornada[p.jornada] = p.fechaISO; });

  const idx = jornadas.indexOf(jornada);
  const anterior = idx > 0 ? fechasPorJornada[jornadas[idx - 1]] : null;
  const siguiente = idx < jornadas.length - 1 ? fechasPorJornada[jornadas[idx + 1]] : null;

  const [nuevaFecha, setNuevaFecha] = useState(fechasPorJornada[jornada] || '');
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  function guardar() {
    if (!nuevaFecha) { setError('Debes indicar una fecha.'); setShakeKey(k => k + 1); return; }
    if (anterior && nuevaFecha <= anterior) {
      setError(`La fecha debe ser estrictamente posterior a la jornada ${jornadas[idx - 1]} (${formatearFecha(anterior)}).`);
      setShakeKey(k => k + 1);
      return;
    }
    if (siguiente && nuevaFecha >= siguiente) {
      setError(`La fecha debe ser estrictamente anterior a la jornada ${jornadas[idx + 1]} (${formatearFecha(siguiente)}).`);
      setShakeKey(k => k + 1);
      return;
    }
    onGuardar(nuevaFecha);
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: '480px' }}>
        <div className="admin-modal__header">
          <h3 className="admin-modal__title">Editar fecha de jornada {jornada}</h3>
          <button type="button" className="admin-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal__body">
          <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '6px', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '14px' }}>
            {!anterior && !siguiente && 'Única jornada del calendario.'}
            {anterior && siguiente && `Debe quedar estrictamente entre el ${formatearFecha(anterior)} (jornada ${jornadas[idx - 1]}) y el ${formatearFecha(siguiente)} (jornada ${jornadas[idx + 1]}).`}
            {!anterior && siguiente && `Debe ser estrictamente anterior al ${formatearFecha(siguiente)} (jornada ${jornadas[idx + 1]}).`}
            {anterior && !siguiente && `Debe ser estrictamente posterior al ${formatearFecha(anterior)} (jornada ${jornadas[idx - 1]}).`}
          </div>
          <div className="campo">
            <label className="campo__etiqueta">Nueva fecha *</label>
            <input
              type="date"
              className="campo__input"
              value={nuevaFecha}
              min={anterior ? sumarDias(anterior, 1) : undefined}
              max={siguiente ? sumarDias(siguiente, -1) : undefined}
              onChange={e => setNuevaFecha(e.target.value)}
            />
          </div>
          {error && <div key={shakeKey} className="error-alerta-shake" style={{ marginTop: '12px' }}>{error}</div>}
        </div>
        <div className="admin-modal__footer">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}