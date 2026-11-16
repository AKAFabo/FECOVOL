import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../AdminCommon.css';
import './Arbitraje.css';
import BuscadorPadron from './BuscadorPadron.jsx';
import {
  MODALIDADES,
  acreditar,
  editarAcreditacion,
  fechaCorta,
  hoyIso,
  mesAnio,
  obtenerOpciones,
  obtenerPersona,
  subirArchivo
} from './arbitrajeDatos.js';

const EVALUACIONES = [
  { codigo: 'APROBADA', nombre: 'Aprobada' },
  { codigo: 'REPROBADA', nombre: 'Reprobada' },
  { codigo: 'PENDIENTE', nombre: 'Pendiente' }
];
const TIPOS_ARCHIVO = 'application/pdf,image/jpeg,image/png';
const TAMANO_MAX = 10 * 1024 * 1024;

// Por defecto la acreditación vence el 31 de diciembre del año siguiente.
const vencePorDefecto = () => `${Number(hoyIso().slice(0, 4)) + 1}-12-31`;

const FORM_VACIO = {
  function_code: 'PRI',
  level_code: 'NAC',
  modality: 'SALA',
  category_code: '',
  valid_from: hoyIso(),
  valid_until: vencePorDefecto(),
  course_enrollment_id: '',
  practical_evaluation: 'PENDIENTE',
  physical_test: 'PENDIENTE',
  notes: ''
};

// Fila de un requisito con archivo: muestra el estado y permite cargar o reemplazar.
function Requisito({ titulo, archivo, actual, onCargar, subiendo }) {
  const entrada = useRef(null);
  const nombre = archivo?.name || actual?.nombre;
  return (
    <div className="arb-requisito">
      <div className="arb-requisito__texto">
        <span className="arb-requisito__nombre">{titulo}</span>
        <span className="arb-requisito__archivo">{subiendo ? 'Subiendo…' : nombre || 'PDF, JPG o PNG de hasta 10 MB'}</span>
      </div>
      <span className={`badge-status ${nombre ? 'badge-status--activa' : 'badge-status--pendiente'}`}>
        {nombre ? 'Cargado' : 'Pendiente'}
      </span>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={subiendo} onClick={() => entrada.current?.click()}>
        {nombre ? 'Reemplazar' : 'Cargar'}
      </button>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ARCHIVO}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onCargar(file);
        }}
      />
    </div>
  );
}

export default function AcreditarArbitro({ modo = 'nuevo' }) {
  const navigate = useNavigate();
  const { id: personaRuta } = useParams();
  const [params] = useSearchParams();
  const editando = modo === 'editar';
  const personaInicial = editando ? personaRuta : params.get('persona');
  const renovando = !editando && Boolean(personaInicial);

  const [opciones, setOpciones] = useState({ funciones: [], niveles: [], categorias: [] });
  const [persona, setPersona] = useState(null); // { persona, acreditacion, cursosAprobados }
  const [form, setForm] = useState(FORM_VACIO);
  const [archivos, setArchivos] = useState({ certificate: null, medical: null });
  const [subiendo, setSubiendo] = useState(null);
  const [cargandoPersona, setCargandoPersona] = useState(Boolean(personaInicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerOpciones().then(setOpciones).catch((e) => setError(e.message));
  }, []);

  const elegirPersona = async (id) => {
    setError('');
    setCargandoPersona(true);
    try {
      const datos = await obtenerPersona(id);
      setPersona(datos);
      const a = datos.acreditacion;
      if (editando && !a) throw new Error('La persona no tiene una acreditación activa para editar.');
      if (a) {
        // Se parte de la acreditación actual (para editar o renovar).
        setForm((f) => ({
          ...f,
          function_code: a.funcion?.code || f.function_code,
          level_code: a.nivel?.code || f.level_code,
          modality: a.modalidad,
          category_code: a.categoria?.code || '',
          valid_from: editando ? a.vigenteDesde : hoyIso(),
          valid_until: editando ? a.vence : vencePorDefecto(),
          notes: editando ? a.notas || '' : ''
        }));
      }
      if (!editando) {
        setForm((f) => ({ ...f, course_enrollment_id: datos.cursosAprobados[0]?.id || '' }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargandoPersona(false);
    }
  };

  useEffect(() => {
    if (personaInicial) elegirPersona(personaInicial);
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaInicial]);

  const alCambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const cargarArchivo = (campo) => async (file) => {
    setError('');
    if (!TIPOS_ARCHIVO.split(',').includes(file.type)) {
      setError('El archivo debe ser PDF, JPG o PNG.');
      return;
    }
    if (file.size > TAMANO_MAX) {
      setError('El archivo supera los 10 MB.');
      return;
    }
    setSubiendo(campo);
    try {
      const subido = await subirArchivo(file);
      setArchivos((a) => ({ ...a, [campo]: subido }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(null);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!persona) return setError('Busque y seleccione a la persona en el padrón.');
    if (!form.valid_from || !form.valid_until) return setError('Indique las fechas de vigencia.');
    if (form.valid_until <= form.valid_from) return setError('La fecha de vencimiento debe ser posterior a “Vigente desde”.');

    const comunes = {
      function_code: form.function_code,
      level_code: form.level_code,
      modality: form.modality,
      category_code: form.category_code || null,
      valid_from: form.valid_from,
      valid_until: form.valid_until,
      notes: form.notes
    };

    if (!editando) {
      if (!form.course_enrollment_id) return setError('Seleccione el curso aprobado.');
      if (form.practical_evaluation !== 'APROBADA' || form.physical_test !== 'APROBADA') {
        return setError('La evaluación práctica y la prueba física deben estar aprobadas para acreditar.');
      }
      if (!archivos.certificate || !archivos.medical) return setError('Cargue el certificado del curso y la constancia médica.');
    }

    setGuardando(true);
    try {
      const personaId = persona.persona.id;
      if (editando) {
        await editarAcreditacion(persona.acreditacion.id, {
          ...comunes,
          ...(archivos.certificate ? { certificate: archivos.certificate } : {}),
          ...(archivos.medical ? { medical: archivos.medical } : {})
        });
      } else {
        await acreditar({
          ...comunes,
          person_id: personaId,
          course_enrollment_id: form.course_enrollment_id,
          practical_evaluation: form.practical_evaluation,
          physical_test: form.physical_test,
          certificate: archivos.certificate,
          medical: archivos.medical
        });
      }
      navigate(`/admin/arbitraje/${personaId}`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const titulo = editando ? 'Editar acreditación' : renovando ? 'Renovar acreditación' : 'Acreditar árbitro';
  const p = persona?.persona;
  const actual = persona?.acreditacion;
  const etiquetaPersona = p ? `${p.nombre} · ${p.cedula}` : '';

  return (
    <form onSubmit={guardar} noValidate>
      <p className="arb-migas">
        <Link to="/admin/arbitraje">Arbitraje</Link>
        {p && (editando || renovando) && <> › <Link to={`/admin/arbitraje/${p.id}`}>{p.nombre}</Link></>}
        {' '}› {titulo}
      </p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>{titulo}</h1>
          <p className="admin-page-header__subtitle">
            La acreditación habilita a la persona para recibir designaciones durante su vigencia.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to={p && (editando || renovando) ? `/admin/arbitraje/${p.id}` : '/admin/arbitraje'} className="admin-btn admin-btn--secondary">
            Cancelar
          </Link>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando || Boolean(subiendo) || cargandoPersona}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : renovando ? 'Renovar' : 'Acreditar'}
          </button>
        </div>
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-form-layout">
        <div className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Persona</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campo">
                <label className="arb-campo__etiqueta" htmlFor="buscar-padron">Buscar en el padrón</label>
                <BuscadorPadron
                  id="buscar-padron"
                  valorInicial={etiquetaPersona}
                  deshabilitado={editando || renovando}
                  onSeleccionar={(sel) => elegirPersona(sel.id)}
                />
                {cargandoPersona && <span className="arb-campo__ayuda">Cargando datos de la persona…</span>}
                {p && !cargandoPersona && (
                  <span className="arb-campo__ayuda arb-campo__ayuda--ok">La persona ya está registrada en el padrón federativo.</span>
                )}
                {p && actual && !editando && !renovando && (
                  <span className="arb-campo__ayuda arb-campo__ayuda--aviso">
                    Ya tiene una acreditación activa que vence el {fechaCorta(actual.vence)}. Al acreditar se reemplaza por la nueva.
                  </span>
                )}
              </div>

              {p && (
                <ul className="arb-datos" style={{ marginTop: 12 }}>
                  <li>Asociación de origen <strong>{p.asociacion || '—'}</strong></li>
                  <li>Provincia <strong>{p.provincia || '—'}</strong></li>
                  <li>Correo <strong>{p.correo || '—'}</strong></li>
                </ul>
              )}
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Acreditación</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos">
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Función *</span>
                  <select className="arb-campo__input" value={form.function_code} onChange={alCambiar('function_code')}>
                    {opciones.funciones.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Nivel *</span>
                  <select className="arb-campo__input" value={form.level_code} onChange={alCambiar('level_code')}>
                    {opciones.niveles.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Modalidad *</span>
                  <select className="arb-campo__input" value={form.modality} onChange={alCambiar('modality')}>
                    {MODALIDADES.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Categorías que puede dirigir</span>
                  <select className="arb-campo__input" value={form.category_code} onChange={alCambiar('category_code')}>
                    <option value="">Todas</option>
                    {opciones.categorias.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                  </select>
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Vigente desde *</span>
                  <input type="date" className="arb-campo__input" value={form.valid_from} onChange={alCambiar('valid_from')} />
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Vence *</span>
                  <input type="date" className="arb-campo__input" min={form.valid_from || undefined} value={form.valid_until} onChange={alCambiar('valid_until')} />
                </label>
                <label className="arb-campo arb-campo--ancho">
                  <span className="arb-campo__etiqueta">Notas</span>
                  <textarea className="arb-campo__input" maxLength={2000} value={form.notes} onChange={alCambiar('notes')} />
                </label>
              </div>
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Requisitos</h2></div>
            <div className="arb-card__cuerpo">
              {editando ? (
                <ul className="arb-datos">
                  <li>Evaluación práctica <strong>{actual?.evaluacionPractica === 'APROBADA' ? 'Aprobada' : actual?.evaluacionPractica || '—'}</strong></li>
                  <li>Prueba física <strong>{actual?.pruebaFisica === 'APROBADA' ? 'Aprobada' : actual?.pruebaFisica || '—'}</strong></li>
                </ul>
              ) : (
                <div className="arb-campos">
                  <label className="arb-campo arb-campo--ancho">
                    <span className="arb-campo__etiqueta">Curso aprobado *</span>
                    <select
                      className="arb-campo__input"
                      value={form.course_enrollment_id}
                      onChange={alCambiar('course_enrollment_id')}
                      disabled={!persona || !persona.cursosAprobados.length}
                    >
                      {!persona && <option value="">Seleccione primero a la persona</option>}
                      {persona && !persona.cursosAprobados.length && <option value="">Sin cursos aprobados</option>}
                      {persona?.cursosAprobados.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.curso} · {mesAnio(c.fin)}{c.nota !== null ? ` · nota ${Number(c.nota)}` : ''}
                        </option>
                      ))}
                    </select>
                    {persona && !persona.cursosAprobados.length && (
                      <span className="arb-campo__ayuda arb-campo__ayuda--aviso">
                        La persona no tiene cursos aprobados. Inscríbala en un curso y cargue su nota desde “Cursos y acreditaciones”.
                      </span>
                    )}
                  </label>
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Evaluación práctica</span>
                    <select className="arb-campo__input" value={form.practical_evaluation} onChange={alCambiar('practical_evaluation')}>
                      {EVALUACIONES.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                    </select>
                  </label>
                  <label className="arb-campo">
                    <span className="arb-campo__etiqueta">Prueba física</span>
                    <select className="arb-campo__input" value={form.physical_test} onChange={alCambiar('physical_test')}>
                      {EVALUACIONES.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                    </select>
                  </label>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <Requisito
                  titulo="Certificado del curso"
                  archivo={archivos.certificate}
                  actual={editando ? actual?.certificado : null}
                  subiendo={subiendo === 'certificate'}
                  onCargar={cargarArchivo('certificate')}
                />
                <Requisito
                  titulo="Constancia médica"
                  archivo={archivos.medical}
                  actual={editando ? actual?.constancia : null}
                  subiendo={subiendo === 'medical'}
                  onCargar={cargarArchivo('medical')}
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="arb-columna">
          <div className="arb-aviso">
            <span className="arb-aviso__titulo">Después de acreditar</span>
            <p>La persona queda registrada como árbitro, ya se le puede designar en partidos y, si tiene cuenta en el sistema, recibe el rol de Cuerpo arbitral.</p>
          </div>
          <div className="arb-aviso arb-aviso--naranja">
            <span className="arb-aviso__titulo">Vencimiento</span>
            <p>30 días antes del vencimiento la acreditación aparece como “Por vencer” en el listado de Arbitraje para programar la renovación.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}
