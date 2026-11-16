import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../AdminCommon.css';
import './Arbitraje.css';
import { obtenerOpciones, programarCurso } from './arbitrajeDatos.js';

const TIPOS = [
  { codigo: 'FORMACION_INICIAL', nombre: 'Formación inicial', ayuda: 'Para personas que aún no son árbitros. Al aprobar pueden ser acreditadas.' },
  { codigo: 'ACTUALIZACION_ANUAL', nombre: 'Actualización anual', ayuda: 'Obligatoria para renovar la acreditación vigente.' },
  { codigo: 'ASCENSO_NIVEL', nombre: 'Ascenso de nivel', ayuda: 'Para pasar de nivel Nacional a FIVB.' }
];

const VACIO = {
  course_type: 'ACTUALIZACION_ANUAL',
  name: '',
  modality_code: 'SALA',
  format: 'PRESENCIAL',
  start_date: '',
  end_date: '',
  venue: '',
  capacity: '',
  instructor_person_id: '',
  passing_grade: '70',
  content: '',
  enrollment_opens: '',
  enrollment_closes: '',
  enrollment_open: true,
  only_current_accreditation: true
};

function Interruptor({ activo, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      className={`arb-interruptor ${activo ? 'arb-interruptor--activo' : ''}`}
      onClick={() => onCambiar(!activo)}
    >
      <span className="arb-interruptor__perilla" />
    </button>
  );
}

export default function ProgramarCurso() {
  const navigate = useNavigate();
  const [form, setForm] = useState(VACIO);
  const [opciones, setOpciones] = useState({ modalidades: [], instructores: [] });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerOpciones().then(setOpciones).catch((e) => setError(e.message));
  }, []);

  const poner = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const alCambiar = (campo) => (e) => poner(campo, e.target.value);

  // Al elegir el tipo se propone un valor para el último interruptor.
  const elegirTipo = (codigo) =>
    setForm((f) => ({ ...f, course_type: codigo, only_current_accreditation: codigo !== 'FORMACION_INICIAL' }));

  const publicar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setError('Complete el nombre del curso y las fechas de inicio y cierre.');
      return;
    }
    setGuardando(true);
    try {
      await programarCurso({
        ...form,
        capacity: form.capacity === '' ? null : Number(form.capacity),
        passing_grade: form.passing_grade === '' ? undefined : Number(form.passing_grade),
        instructor_person_id: form.instructor_person_id || null,
        modality_code: form.modality_code || null
      });
      navigate('/admin/arbitraje');
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={publicar} noValidate>
      <p className="arb-migas"><Link to="/admin/arbitraje">Arbitraje</Link> › Programar curso</p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Programar curso</h1>
          <p className="admin-page-header__subtitle">
            Cursos de formación, actualización o ascenso que habilitan o renuevan una acreditación.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link to="/admin/arbitraje" className="admin-btn admin-btn--secondary">Cancelar</Link>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando}>
            {guardando ? 'Publicando…' : 'Publicar curso'}
          </button>
        </div>
      </div>

      {error && <p className="arb-error" role="alert">{error}</p>}

      <div className="arb-form-layout">
        <div className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Tipo de curso</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-tipos" role="radiogroup" aria-label="Tipo de curso">
                {TIPOS.map((t) => (
                  <label key={t.codigo} className={`arb-tipo ${form.course_type === t.codigo ? 'arb-tipo--activo' : ''}`}>
                    <input
                      type="radio"
                      name="tipo-curso"
                      value={t.codigo}
                      checked={form.course_type === t.codigo}
                      onChange={() => elegirTipo(t.codigo)}
                    />
                    <span>
                      <span className="arb-tipo__nombre">{t.nombre}</span>
                      <span className="arb-tipo__ayuda">{t.ayuda}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Datos del curso</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos">
                <label className="arb-campo arb-campo--ancho">
                  <span className="arb-campo__etiqueta">Nombre del curso *</span>
                  <input className="arb-campo__input" maxLength={255} value={form.name} onChange={alCambiar('name')} required />
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Modalidad</span>
                  <select className="arb-campo__input" value={form.modality_code} onChange={alCambiar('modality_code')}>
                    <option value="">Sin modalidad específica</option>
                    {opciones.modalidades.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                  </select>
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Formato</span>
                  <select className="arb-campo__input" value={form.format} onChange={alCambiar('format')}>
                    <option value="PRESENCIAL">Presencial</option>
                    <option value="VIRTUAL">Virtual</option>
                    <option value="MIXTO">Mixto</option>
                  </select>
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Fecha de inicio *</span>
                  <input type="date" className="arb-campo__input" value={form.start_date} onChange={alCambiar('start_date')} required />
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Fecha de cierre *</span>
                  <input
                    type="date"
                    className="arb-campo__input"
                    min={form.start_date || undefined}
                    value={form.end_date}
                    onChange={alCambiar('end_date')}
                    required
                  />
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Sede</span>
                  <input
                    className="arb-campo__input"
                    maxLength={255}
                    placeholder={form.format === 'VIRTUAL' ? 'Plataforma o enlace' : 'Gimnasio Nacional, La Sabana'}
                    value={form.venue}
                    onChange={alCambiar('venue')}
                  />
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Cupo (personas)</span>
                  <input type="number" min="1" max="1000" className="arb-campo__input" value={form.capacity} onChange={alCambiar('capacity')} placeholder="Sin límite" />
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Instructor</span>
                  <select className="arb-campo__input" value={form.instructor_person_id} onChange={alCambiar('instructor_person_id')}>
                    <option value="">Sin asignar</option>
                    {opciones.instructores.map((i) => (
                      <option key={i.id} value={i.id}>{i.nombre}{i.nivel ? ` (${i.nivel})` : ''}</option>
                    ))}
                  </select>
                </label>

                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Nota mínima para aprobar</span>
                  <input type="number" min="0" max="100" className="arb-campo__input" value={form.passing_grade} onChange={alCambiar('passing_grade')} />
                </label>

                <label className="arb-campo arb-campo--ancho">
                  <span className="arb-campo__etiqueta">Contenido</span>
                  <textarea className="arb-campo__input" maxLength={5000} value={form.content} onChange={alCambiar('content')} />
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Inscripción</h2></div>
            <div className="arb-card__cuerpo">
              <div className="arb-campos" style={{ gridTemplateColumns: '1fr' }}>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Abre</span>
                  <input type="date" className="arb-campo__input" value={form.enrollment_opens} onChange={alCambiar('enrollment_opens')} />
                </label>
                <label className="arb-campo">
                  <span className="arb-campo__etiqueta">Cierra</span>
                  <input
                    type="date"
                    className="arb-campo__input"
                    min={form.enrollment_opens || undefined}
                    max={form.end_date || undefined}
                    value={form.enrollment_closes}
                    onChange={alCambiar('enrollment_closes')}
                  />
                </label>
                <div className="arb-interruptor-fila">
                  <span>
                    <span className="arb-interruptor-fila__titulo">Inscripción abierta</span>
                    <span className="arb-interruptor-fila__ayuda">Se puede inscribir personas desde el panel de Arbitraje</span>
                  </span>
                  <Interruptor etiqueta="Inscripción abierta" activo={form.enrollment_open} onCambiar={(v) => poner('enrollment_open', v)} />
                </div>
                <div className="arb-interruptor-fila">
                  <span className="arb-interruptor-fila__titulo">Solo árbitros con acreditación vigente</span>
                  <Interruptor
                    etiqueta="Solo árbitros con acreditación vigente"
                    activo={form.only_current_accreditation}
                    onCambiar={(v) => poner('only_current_accreditation', v)}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="arb-aviso">
            <span className="arb-aviso__titulo">Para qué sirve</span>
            <p>Al cerrar el curso, las notas se cargan desde “Cursos y acreditaciones” y quienes aprueban quedan listos para acreditarse o renovar su acreditación.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}
