// Programar curso (Figma 02 · Programar curso): formación, actualización o ascenso.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Campo, Encabezado, OpcionesCatalogo, OpcionesSede, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { crearCurso, FORMATOS_CURSO, hoyCR, TIPOS_CURSO } from '../../../services/arbitraje.js';
import { nombrePersona, valoresCatalogo } from '../../../services/representante.js';
import BuscarPersona from './BuscarPersona.jsx';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

const INICIAL = {
  course_type: 'ACTUALIZACION_ANUAL',
  name: '',
  modality_code: 'SALA',
  format: 'PRESENCIAL',
  start_date: '',
  end_date: '',
  venue: '',
  capacity: '',
  passing_grade: '70',
  content: '',
  enrollment_opens: hoyCR(),
  enrollment_closes: '',
  enrollment_open: true,
  only_current_accreditation: true
};

function Interruptor({ id, etiqueta, ayuda, activo, onCambiar }) {
  return (
    <div className="arb-interruptor">
      <div>
        <label htmlFor={id} className="arb-interruptor__etiqueta">{etiqueta}</label>
        {ayuda && <p className="g-campo__ayuda">{ayuda}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={activo} className="arb-interruptor__control" onClick={() => onCambiar(!activo)}>
        <span className="visualmente-oculto">{activo ? 'Sí' : 'No'}</span>
      </button>
    </div>
  );
}

export default function ProgramarCurso() {
  const navigate = useNavigate();
  const catalogos = useCarga(() => Promise.all([valoresCatalogo('Modalidades'), valoresCatalogo('Sedes')]).then(([modalidades, sedes]) => ({ modalidades, sedes })), []);
  const [f, setF] = useState(INICIAL);
  const [instructor, setInstructor] = useState(null);
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ enviando: false, error: null });

  // Al corregir un campo se quita su error; los demás quedan hasta el próximo envío.
  const cambiar = (campo) => (e) => {
    setF((x) => ({ ...x, [campo]: e.target.value }));
    setErrores((x) => (x[campo] ? { ...x, [campo]: undefined } : x));
  };
  const poner = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));

  function validar() {
    const e = {};
    if (f.name.trim().length < 5) e.name = 'Escriba el nombre del curso.';
    if (!f.start_date) e.start_date = 'Indique la fecha de inicio.';
    if (!f.end_date) e.end_date = 'Indique la fecha de cierre.';
    else if (f.start_date && f.end_date < f.start_date) e.end_date = 'No puede ser anterior al inicio.';
    if (f.capacity && (!/^\d+$/.test(f.capacity) || Number(f.capacity) < 1)) e.capacity = 'Indique un número de personas.';
    const nota = Number(f.passing_grade);
    if (f.passing_grade === '' || !Number.isFinite(nota) || nota < 0 || nota > 100) e.passing_grade = 'Entre 0 y 100.';
    if (f.enrollment_opens && f.enrollment_closes && f.enrollment_closes < f.enrollment_opens) e.enrollment_closes = 'No puede cerrar antes de abrir.';
    if (f.enrollment_closes && f.end_date && f.enrollment_closes > f.end_date) e.enrollment_closes = 'Debe cerrar a más tardar el último día del curso.';
    return e;
  }

  async function publicar(evento) {
    evento.preventDefault();
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) {
      setEstado({ enviando: false, error: 'Revise los campos marcados.' });
      return;
    }
    setEstado({ enviando: true, error: null });
    try {
      const curso = await crearCurso({
        ...f,
        name: f.name.trim(),
        capacity: f.capacity ? Number(f.capacity) : null,
        passing_grade: Number(f.passing_grade),
        venue: f.format === 'VIRTUAL' ? 'Virtual' : f.venue || null,
        instructor_person_id: instructor?.id || null,
        content: f.content.trim() || null,
        enrollment_opens: f.enrollment_opens || null,
        enrollment_closes: f.enrollment_closes || null
      });
      navigate(RUTA.curso(curso.id), { state: { creado: true } });
    } catch (err) {
      setEstado({ enviando: false, error: err.message });
    }
  }

  return (
    <form className="g-pagina" onSubmit={publicar} noValidate>
      <Encabezado
        titulo="Programar curso"
        bajada="Cursos de formación, actualización o ascenso que habilitan o renuevan una acreditación."
        acciones={(
          <>
            <Link to={RUTA.cursos} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={estado.enviando}>{estado.enviando ? 'Publicando…' : 'Publicar curso'}</button>
          </>
        )}
      />
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Tipo de curso">
            <fieldset className="g-tarjeta__cuerpo arb-opciones">
              <legend className="visualmente-oculto">Tipo de curso</legend>
              {Object.entries(TIPOS_CURSO).map(([k, t]) => (
                <label key={k} className={`arb-opcion${f.course_type === k ? ' arb-opcion--elegida' : ''}`}>
                  <input type="radio" name="tipo-curso" value={k} checked={f.course_type === k} onChange={() => setF((x) => ({ ...x, course_type: k, only_current_accreditation: k !== 'FORMACION_INICIAL' }))} />
                  <span>
                    <span className="arb-opcion__titulo">{t.texto}</span>
                    <span className="arb-opcion__detalle">{t.detalle}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </Tarjeta>

          <Tarjeta titulo="Datos del curso">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Nombre del curso" obligatorio ancho error={errores.name}>
                {(a) => <input {...a} className="g-control" value={f.name} onChange={cambiar('name')} maxLength={150} placeholder="Por ejemplo: Actualización arbitral 2027" />}
              </Campo>
              <Campo etiqueta="Modalidad">
                {(a) => (
                  <select {...a} className="g-control" value={f.modality_code} onChange={cambiar('modality_code')}>
                    <OpcionesCatalogo valores={catalogos.datos?.modalidades} vacia="Sala y playa" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Formato">
                {(a) => (
                  <select {...a} className="g-control" value={f.format} onChange={cambiar('format')}>
                    {Object.entries(FORMATOS_CURSO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Fecha de inicio" obligatorio error={errores.start_date}>
                {(a) => <input {...a} type="date" className="g-control" value={f.start_date} onChange={cambiar('start_date')} />}
              </Campo>
              <Campo etiqueta="Fecha de cierre" obligatorio error={errores.end_date}>
                {(a) => <input {...a} type="date" className="g-control" value={f.end_date} min={f.start_date || undefined} onChange={cambiar('end_date')} />}
              </Campo>
              <Campo etiqueta="Sede">
                {(a) => (
                  <select {...a} className="g-control" value={f.format === 'VIRTUAL' ? '' : f.venue} onChange={cambiar('venue')} disabled={f.format === 'VIRTUAL'}>
                    <OpcionesSede sedes={catalogos.datos?.sedes} actual={f.venue} />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Cupo" error={errores.capacity} ayuda="Vacío: sin límite.">
                {(a) => <input {...a} className="g-control" inputMode="numeric" value={f.capacity} onChange={cambiar('capacity')} maxLength={4} placeholder="Personas" />}
              </Campo>
              <div className="g-campo">
                {instructor ? (
                  <>
                    <span className="g-campo__etiqueta">Instructor</span>
                    <div className="arb-persona-elegida arb-persona-elegida--chica">
                      <span>{nombrePersona(instructor)}</span>
                      <button type="button" className="g-enlace" onClick={() => setInstructor(null)}>Cambiar</button>
                    </div>
                  </>
                ) : (
                  <BuscarPersona etiqueta="Instructor" onElegir={setInstructor} />
                )}
              </div>
              <Campo etiqueta="Nota mínima para aprobar" error={errores.passing_grade}>
                {(a) => <input {...a} className="g-control" inputMode="decimal" value={f.passing_grade} onChange={cambiar('passing_grade')} maxLength={5} />}
              </Campo>
              <Campo etiqueta="Contenido" ancho>
                {(a) => <textarea {...a} className="g-control" rows={3} maxLength={2000} value={f.content} onChange={cambiar('content')} />}
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Inscripción">
            <div className="g-tarjeta__cuerpo g-formulario g-formulario--una">
              <Campo etiqueta="Abre">
                {(a) => <input {...a} type="date" className="g-control" value={f.enrollment_opens} onChange={cambiar('enrollment_opens')} />}
              </Campo>
              <Campo etiqueta="Cierra" error={errores.enrollment_closes}>
                {(a) => <input {...a} type="date" className="g-control" value={f.enrollment_closes} min={f.enrollment_opens || undefined} onChange={cambiar('enrollment_closes')} />}
              </Campo>
              <Interruptor id="curso-abierta" etiqueta="Inscripción abierta" ayuda="Los árbitros se inscriben desde Mi ficha." activo={f.enrollment_open} onCambiar={(v) => poner('enrollment_open', v)} />
              <Interruptor id="curso-vigente" etiqueta="Solo árbitros con acreditación vigente" activo={f.only_current_accreditation} onCambiar={(v) => poner('only_current_accreditation', v)} />
            </div>
          </Tarjeta>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Para qué sirve</span>
            Al cerrar el curso, las notas se registran en su detalle y quienes aprueban quedan listos para acreditarse o renovar su acreditación.
          </p>
        </div>
      </div>
    </form>
  );
}
