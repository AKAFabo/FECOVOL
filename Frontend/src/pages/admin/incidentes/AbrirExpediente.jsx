import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../AdminCommon.css';
import '../arbitraje/Arbitraje.css';
import './Incidentes.css';
import {
  ROLES,
  abrirExpediente,
  ahoraLocal,
  buscarPersonas,
  fechaLarga,
  listarPartidos,
  obtenerOpciones,
  subirArchivo
} from './incidentesDatos.js';

const TIPOS_ARCHIVO = 'application/pdf,image/jpeg,image/png';
const TAMANO_MAX = 10 * 1024 * 1024;
const PLAZOS = [
  { dias: 3, texto: '3 días hábiles' },
  { dias: 5, texto: '5 días hábiles' },
  { dias: 10, texto: '10 días hábiles' },
  { dias: 0, texto: 'Sin plazo de descargo' }
];
const TIPO_INVOLUCRADO = { PERSONA: 'Persona', EQUIPO: 'Equipo', SEDE: 'Sede' };
const NUEVO_INVOLUCRADO = { party_type: 'EQUIPO', team_id: '', persona: null, venue_name: '', role_in_case: 'DENUNCIADO', participation: '' };

// Búsqueda de una persona del padrón.
function BuscarPersona({ onElegir }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) {
      setResultados(null);
      return undefined;
    }
    let cancelado = false;
    const espera = setTimeout(() => {
      buscarPersonas(q).then((r) => !cancelado && setResultados(r)).catch(() => !cancelado && setResultados([]));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto]);

  return (
    <div className="arb-buscador">
      <input
        type="search"
        className="arb-campo__input"
        placeholder="Nombre o cédula…"
        value={texto}
        autoComplete="off"
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && resultados && (
        <ul className="arb-buscador__resultados">
          {resultados.length === 0 && <li className="arb-buscador__mensaje">No hay personas con ese nombre o cédula.</li>}
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="arb-buscador__opcion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTexto(`${p.nombre} · ${p.cedula}`);
                  setAbierto(false);
                  onElegir(p);
                }}
              >
                <span className="arb-buscador__nombre">{p.nombre}</span>
                <span className="arb-buscador__detalle">{p.cedula}{p.equipos.length ? ` · ${p.equipos.map((e) => e.nombre).join(', ')}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AbrirExpediente() {
  const navigate = useNavigate();
  const entradaArchivos = useRef(null);
  const [opciones, setOpciones] = useState({ tipos: [], competencias: [], responsables: [], siguienteNumero: '' });
  const [partidos, setPartidos] = useState([]);
  const [form, setForm] = useState({
    competition_id: '',
    match_id: '',
    incident_type_code: '',
    occurred_at: ahoraLocal(),
    title: '',
    facts: '',
    moment_detail: '',
    reported_by: '',
    responsible_user_id: '',
    defense_days: 5,
    notify_involved: true
  });
  const [involucrados, setInvolucrados] = useState([]);
  const [nuevo, setNuevo] = useState(NUEVO_INVOLUCRADO);
  const [reinicioPersona, setReinicioPersona] = useState(0);
  const [pruebas, setPruebas] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerOpciones()
      .then((o) => {
        setOpciones(o);
        setForm((f) => ({ ...f, responsible_user_id: f.responsible_user_id || o.usuarioId || '' }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setPartidos([]);
    if (!form.competition_id) return;
    listarPartidos(form.competition_id).then(setPartidos).catch((e) => setError(e.message));
  }, [form.competition_id]);

  const poner = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const partido = partidos.find((m) => m.id === form.match_id);
  const equiposPartido = partido ? [partido.local, partido.visita].filter(Boolean) : [];
  const equiposPersona = nuevo.persona
    ? [...equiposPartido, ...nuevo.persona.equipos.filter((e) => !equiposPartido.some((x) => x.id === e.id))]
    : equiposPartido;
  const nombreEquipo = (teamId) => [...equiposPartido, ...involucrados.flatMap((i) => i.persona?.equipos || [])].find((e) => e.id === teamId)?.nombre;

  const agregarInvolucrado = () => {
    setError('');
    const i = nuevo;
    if (i.party_type === 'EQUIPO' && !i.team_id) return setError('Seleccione el equipo involucrado.');
    if (i.party_type === 'PERSONA' && !i.persona) return setError('Busque y seleccione a la persona involucrada.');
    if (i.party_type === 'SEDE' && !i.venue_name.trim()) return setError('Escriba el nombre de la sede.');
    setInvolucrados((lista) => [...lista, { ...i, clave: crypto.randomUUID() }]);
    setNuevo({ ...NUEVO_INVOLUCRADO, party_type: i.party_type });
    setReinicioPersona((n) => n + 1);
  };

  const cargarPruebas = async (archivos) => {
    setError('');
    const lista = [...archivos];
    const malo = lista.find((f) => !TIPOS_ARCHIVO.split(',').includes(f.type) || f.size > TAMANO_MAX);
    if (malo) return setError(`"${malo.name}" no es un PDF, JPG o PNG de hasta 10 MB.`);
    setSubiendo(true);
    try {
      const subidos = [];
      for (const archivo of lista) subidos.push(await subirArchivo(archivo));
      setPruebas((p) => [...p, ...subidos].slice(0, 10));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const etiquetaInvolucrado = (i) => {
    if (i.party_type === 'PERSONA') return i.persona.nombre;
    if (i.party_type === 'EQUIPO') return nombreEquipo(i.team_id) || 'Equipo';
    return i.venue_name;
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const faltan = [];
    if (!form.competition_id) faltan.push('competencia');
    if (!form.match_id) faltan.push('partido');
    if (!form.incident_type_code) faltan.push('tipo de incidente');
    if (!form.occurred_at) faltan.push('fecha y hora del hecho');
    if (!form.title.trim()) faltan.push('título');
    if (!form.facts.trim()) faltan.push('hechos');
    if (faltan.length) return setError(`Complete: ${faltan.join(', ')}.`);
    if (!involucrados.length) return setError('Agregue al menos un involucrado.');

    setGuardando(true);
    try {
      const { id } = await abrirExpediente({
        ...form,
        // Costa Rica no cambia de horario: siempre UTC-6.
        occurred_at: `${form.occurred_at}:00-06:00`,
        parties: involucrados.map((i) => ({
          party_type: i.party_type,
          person_id: i.persona?.id || null,
          team_id: i.team_id || null,
          venue_name: i.venue_name || null,
          role_in_case: i.role_in_case,
          participation: i.participation || null
        })),
        documents: pruebas.map((p) => ({ title: p.name.replace(/\.[^.]+$/, ''), file: p }))
      });
      navigate(`/admin/incidentes/${id}`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} noValidate>
      <p className="arb-migas"><Link to="/admin/incidentes">Incidentes y sanciones</Link> › Abrir expediente</p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Abrir expediente</h1>
          <p className="admin-page-header__subtitle">
            Se crea con número, fecha y hora automáticos{opciones.siguienteNumero ? `: ${opciones.siguienteNumero}` : ''}.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/admin/incidentes" className="admin-btn admin-btn--secondary">Cancelar</Link>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando || subiendo}>
            {guardando ? 'Abriendo…' : 'Abrir expediente'}
          </button>
        </div>
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-form-layout">
        <div className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Origen</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos">
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Competencia *</span>
                  <select className="arb-campo__input" value={form.competition_id} onChange={(e) => setForm((f) => ({ ...f, competition_id: e.target.value, match_id: '' }))}>
                    <option value="">Seleccione la competencia</option>
                    {opciones.competencias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Partido *</span>
                  <select className="arb-campo__input" value={form.match_id} onChange={poner('match_id')} disabled={!form.competition_id}>
                    <option value="">{form.competition_id ? 'Seleccione el partido' : 'Elija primero la competencia'}</option>
                    {partidos.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.numero} · {m.local?.nombre} vs {m.visita?.nombre} · {fechaLarga(m.fecha)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Tipo de incidente *</span>
                  <select className="arb-campo__input" value={form.incident_type_code} onChange={poner('incident_type_code')}>
                    <option value="">Seleccione el tipo</option>
                    {opciones.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Fecha y hora del hecho *</span>
                  <input type="datetime-local" className="arb-campo__input" max={ahoraLocal()} value={form.occurred_at} onChange={poner('occurred_at')} />
                </label>
              </div>
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Involucrados</h2></div>
            <div className="arb-card__cuerpo">
              {involucrados.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Persona o equipo</th>
                      <th>Tipo</th>
                      <th>Rol en el hecho</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {involucrados.map((i) => (
                      <tr key={i.clave}>
                        <td>
                          <div className="admin-table__user-cell">
                            <span className="admin-table__user-name">{etiquetaInvolucrado(i)}</span>
                            {(i.participation || (i.party_type === 'PERSONA' && i.team_id)) && (
                              <span className="admin-table__user-email">
                                {[i.participation, i.party_type === 'PERSONA' ? nombreEquipo(i.team_id) : null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{TIPO_INVOLUCRADO[i.party_type]}</td>
                        <td>{ROLES[i.role_in_case]}</td>
                        <td className="arb-tabla__accion">
                          <button
                            type="button"
                            className="admin-btn admin-btn--quitar arb-boton-chico"
                            onClick={() => setInvolucrados((l) => l.filter((x) => x.clave !== i.clave))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="inc-agregar">
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Tipo</span>
                  <select
                    className="arb-campo__input"
                    value={nuevo.party_type}
                    onChange={(e) => setNuevo({ ...NUEVO_INVOLUCRADO, party_type: e.target.value, role_in_case: nuevo.role_in_case })}
                  >
                    {Object.entries(TIPO_INVOLUCRADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>

                {nuevo.party_type === 'EQUIPO' && (
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Equipo</span>
                    <select className="arb-campo__input" value={nuevo.team_id} onChange={(e) => setNuevo((n) => ({ ...n, team_id: e.target.value }))} disabled={!partido}>
                      <option value="">{partido ? 'Seleccione el equipo' : 'Elija primero el partido'}</option>
                      {equiposPartido.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </label>
                )}
                {nuevo.party_type === 'PERSONA' && (
                  <div className="arb-campo">
                    <span className="arb-campo__etiqueta">Persona</span>
                    <BuscarPersona key={reinicioPersona} onElegir={(p) => setNuevo((n) => ({ ...n, persona: p, team_id: '' }))} />
                  </div>
                )}
                {nuevo.party_type === 'SEDE' && (
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Sede</span>
                    <input className="arb-campo__input" maxLength={255} placeholder="Gimnasio Municipal de Puntarenas" value={nuevo.venue_name} onChange={(e) => setNuevo((n) => ({ ...n, venue_name: e.target.value }))} />
                  </label>
                )}

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Rol en el hecho</span>
                  <select className="arb-campo__input" value={nuevo.role_in_case} onChange={(e) => setNuevo((n) => ({ ...n, role_in_case: e.target.value }))}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <button type="button" className="admin-btn admin-btn--secondary" onClick={agregarInvolucrado}>Agregar involucrado</button>

                {nuevo.party_type === 'PERSONA' && nuevo.persona && (
                  <>
                    <label className="arb-campo">
                      <span className="arb-campo__etiqueta">Equipo de la persona</span>
                      <select className="arb-campo__input" value={nuevo.team_id} onChange={(e) => setNuevo((n) => ({ ...n, team_id: e.target.value }))}>
                        <option value="">Sin equipo</option>
                        {equiposPersona.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </label>
                    <label className="arb-campo" style={{ gridColumn: 'span 2' }}>
                      <span className="arb-campo__etiqueta">Participa como</span>
                      <input className="arb-campo__input" maxLength={120} placeholder="Entrenador principal" value={nuevo.participation} onChange={(e) => setNuevo((n) => ({ ...n, participation: e.target.value }))} />
                    </label>
                  </>
                )}
              </div>
              {nuevo.party_type === 'PERSONA' && (
                <p className="arb-campo__ayuda" style={{ marginTop: 8 }}>
                  El equipo de la persona sirve para calcular en qué partidos se cumple una suspensión.
                </p>
              )}
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Descripción</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos">
                <label className="arb-campo arb-campo--ancho">
                  <span className="arb-campo__etiqueta">Título del incidente *</span>
                  <input className="arb-campo__input" maxLength={255} placeholder="Reclamo por nómina no habilitada" value={form.title} onChange={poner('title')} />
                </label>
                <label className="arb-campo arb-campo--ancho">
                  <span className="arb-campo__etiqueta">Hechos *</span>
                  <textarea className="arb-campo__input" style={{ minHeight: 110 }} maxLength={5000} value={form.facts} onChange={poner('facts')} />
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Momento</span>
                  <input className="arb-campo__input" maxLength={255} placeholder="Set 3, marcador 14-16" value={form.moment_detail} onChange={poner('moment_detail')} />
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Reportado por</span>
                  <input className="arb-campo__input" maxLength={255} placeholder="Árbitro principal en el acta" value={form.reported_by} onChange={poner('reported_by')} />
                </label>
              </div>

              <div className="arb-requisito" style={{ marginTop: 16 }}>
                <div className="arb-requisito__texto">
                  <span className="arb-requisito__nombre">Pruebas iniciales</span>
                  <span className="arb-requisito__archivo">
                    {subiendo
                      ? 'Subiendo…'
                      : pruebas.length
                        ? `${pruebas[0].name}${pruebas.length > 1 ? ` · ${pruebas.length} archivos` : ''}`
                        : 'PDF, JPG o PNG de hasta 10 MB (opcional)'}
                  </span>
                </div>
                <span className={`badge-status ${pruebas.length ? 'badge-status--activa' : 'badge-status--pendiente'}`}>
                  {pruebas.length ? 'Cargado' : 'Opcional'}
                </span>
                {pruebas.length > 0 && (
                  <button type="button" className="admin-btn admin-btn--quitar" onClick={() => setPruebas([])}>Quitar</button>
                )}
                <button type="button" className="admin-btn admin-btn--secondary" disabled={subiendo} onClick={() => entradaArchivos.current?.click()}>
                  {pruebas.length ? 'Agregar más' : 'Cargar'}
                </button>
                <input
                  ref={entradaArchivos}
                  type="file"
                  multiple
                  accept={TIPOS_ARCHIVO}
                  hidden
                  onChange={(e) => {
                    const archivos = e.target.files;
                    if (archivos?.length) cargarPruebas(archivos);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Seguimiento</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos" style={{ gridTemplateColumns: '1fr' }}>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Responsable</span>
                  <select className="arb-campo__input" value={form.responsible_user_id} onChange={poner('responsible_user_id')}>
                    {opciones.responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Plazo para descargo</span>
                  <select className="arb-campo__input" value={form.defense_days} onChange={(e) => setForm((f) => ({ ...f, defense_days: Number(e.target.value) }))}>
                    {PLAZOS.map((p) => <option key={p.dias} value={p.dias}>{p.texto}</option>)}
                  </select>
                </label>
                <div className="arb-interruptor-fila">
                  <span>
                    <span className="arb-interruptor-fila__titulo">Notificar a los involucrados</span>
                    <span className="arb-interruptor-fila__ayuda">Queda marcado en el expediente; el envío de correos aún no está disponible</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.notify_involved}
                    aria-label="Notificar a los involucrados"
                    className={`arb-interruptor ${form.notify_involved ? 'arb-interruptor--activo' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, notify_involved: !f.notify_involved }))}
                  >
                    <span className="arb-interruptor__perilla" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="arb-aviso">
            <span className="arb-aviso__titulo">Registro</span>
            <p>El expediente no se puede eliminar. Si no procede, se archiva con su justificación.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}
