// Detalle de un curso: datos, inscripciones y notas. Quien aprueba queda listo para acreditarse.
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Confirmar, Encabezado, Estado, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import useDatosVigentes from '../../../hooks/useDatosVigentes.js';
import {
  calificarInscripcion, cambiarEstadoCurso, ESTADOS_CURSO, FORMATOS_CURSO, inscribirEnCurso, obtenerCurso, RESULTADOS_CURSO, TIPOS_CURSO
} from '../../../services/arbitraje.js';
import { esId, nombrePersona } from '../../../services/representante.js';
import { fechaCorta, rangoFechas } from '../../../utils/formato.js';
import BuscarPersona from './BuscarPersona.jsx';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

function FilaNota({ cursoId, inscripcion, editable, onGuardado }) {
  const [nota, setNota] = useState(inscripcion.grade === null || inscripcion.grade === undefined ? '' : String(Number(inscripcion.grade)));
  const [estado, setEstado] = useState({ ocupado: false, error: null });
  const r = RESULTADOS_CURSO[inscripcion.result] || RESULTADOS_CURSO.INSCRITO;
  const p = inscripcion.persona;

  async function guardar(resultado) {
    if (!resultado.ausente) {
      const n = Number(nota);
      if (nota === '' || !Number.isFinite(n) || n < 0 || n > 100) {
        setEstado({ ocupado: false, error: 'Nota entre 0 y 100.' });
        return;
      }
      resultado = { grade: n };
    }
    setEstado({ ocupado: true, error: null });
    try {
      await calificarInscripcion(cursoId, inscripcion.id, resultado);
      setEstado({ ocupado: false, error: null });
      onGuardado(resultado.ausente ? `${nombrePersona(p)}: ausente.` : `Nota de ${nombrePersona(p)} guardada.`);
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
    }
  }

  return (
    <tr>
      <th scope="row">{nombrePersona(p)}<span className="g-tabla__sub">{p?.document_number}</span></th>
      <td>
        {editable ? (
          <div className="arb-nota-editor">
            <label className="visualmente-oculto" htmlFor={`nota-${inscripcion.id}`}>Nota de {nombrePersona(p)}</label>
            <input
              id={`nota-${inscripcion.id}`}
              className="g-control arb-nota-editor__control"
              inputMode="decimal"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={5}
              aria-invalid={estado.error ? 'true' : undefined}
            />
            <button type="button" className="g-boton g-boton--chico" onClick={() => guardar({})} disabled={estado.ocupado}>Guardar</button>
            <button type="button" className="g-enlace" onClick={() => guardar({ ausente: true })} disabled={estado.ocupado}>Ausente</button>
          </div>
        ) : (
          inscripcion.grade === null || inscripcion.grade === undefined ? '—' : Number(inscripcion.grade)
        )}
        {estado.error && <span className="g-campo__error" role="alert">{estado.error}</span>}
      </td>
      <td><Estado tono={r.tono}>{r.texto}</Estado></td>
      <td className="g-tabla__accion">
        {inscripcion.result === 'APROBADO' && p && (
          <Link to={RUTA.acreditar(p.id)} className="g-boton g-boton--chico">Acreditar<span className="visualmente-oculto"> a {nombrePersona(p)}</span></Link>
        )}
      </td>
    </tr>
  );
}

export default function CursoDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const valido = esId(id);
  const curso = useCarga((signal) => (valido ? obtenerCurso(id, { signal }) : Promise.reject(new Error('El enlace no es válido.'))), [id]);
  const [mensaje, avisar] = useMensaje();
  const [confirmar, setConfirmar] = useState(null); // 'CERRADO' | 'CANCELADO' | 'PUBLICADO'
  const [inscribiendo, setInscribiendo] = useState({ ocupado: false, error: null });
  const c = useDatosVigentes(curso, id);

  if (curso.estado === 'error') return <ErrorCarga mensaje={curso.error.message} onReintentar={valido ? curso.reintentar : undefined} />;
  if (!c) return <Cargando texto="Cargando el curso…" />;

  const e = ESTADOS_CURSO[c.status] || ESTADOS_CURSO.PUBLICADO;
  const inscritos = c.inscripciones || [];
  const lleno = c.capacity && inscritos.length >= c.capacity;
  const editable = c.status !== 'CANCELADO';

  async function inscribir(persona) {
    setInscribiendo({ ocupado: true, error: null });
    try {
      await inscribirEnCurso(c.id, persona.id);
      setInscribiendo({ ocupado: false, error: null });
      avisar(`Se inscribió a ${nombrePersona(persona)}.`);
      curso.reintentar();
    } catch (err) {
      setInscribiendo({ ocupado: false, error: err.message });
    }
  }

  const textosConfirmar = {
    CERRADO: { titulo: '¿Cerrar el curso?', texto: 'Se cierra la inscripción. Las notas se pueden seguir registrando.', accion: 'Cerrar curso' },
    CANCELADO: { titulo: '¿Cancelar el curso?', texto: 'El curso queda cancelado y ya no se pueden registrar notas.', accion: 'Cancelar curso', peligro: true },
    PUBLICADO: { titulo: '¿Reabrir el curso?', texto: 'El curso vuelve a estar publicado. Active la inscripción en línea si la necesita.', accion: 'Reabrir' }
  };

  return (
    <div className="g-pagina">
      {mensaje}
      <Encabezado
        titulo={c.name}
        bajada={`${TIPOS_CURSO[c.course_type]?.texto} · ${rangoFechas(c.start_date, c.end_date)}`}
        acciones={(
          <>
            <Link to={RUTA.cursos} className="g-boton">Volver a cursos</Link>
            {c.status === 'PUBLICADO' && <button type="button" className="g-boton" onClick={() => setConfirmar('CERRADO')}>Cerrar curso</button>}
            {c.status === 'CERRADO' && <button type="button" className="g-boton" onClick={() => setConfirmar('PUBLICADO')}>Reabrir</button>}
            {c.status !== 'CANCELADO' && <button type="button" className="g-boton g-boton--peligro" onClick={() => setConfirmar('CANCELADO')}>Cancelar curso</button>}
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono={e.tono}>{e.texto}</Estado>
          <Estado tono="neutro">{c.capacity ? `${inscritos.length} de ${c.capacity} inscritos` : `${inscritos.length} inscritos`}</Estado>
          {c.status === 'PUBLICADO' && c.enrollment_open && <Estado tono="info">Inscripción en línea abierta</Estado>}
        </div>
      </Encabezado>

      {location.state?.creado && <p className="g-aviso g-aviso--ok" role="status">Curso publicado.</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Inscripciones y notas" nota={`Nota mínima para aprobar: ${Number(c.passing_grade)}`}>
            {inscritos.length === 0 ? (
              <p className="g-tarjeta__vacio">Todavía no hay personas inscritas.</p>
            ) : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Inscripciones</caption>
                  <thead><tr><th scope="col">Persona</th><th scope="col">Nota</th><th scope="col">Resultado</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr></thead>
                  <tbody>
                    {inscritos.map((i) => (
                      <FilaNota key={`${i.id}-${i.grade}-${i.result}`} cursoId={c.id} inscripcion={i} editable={editable} onGuardado={(t) => { avisar(t); curso.reintentar(); }} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {c.status === 'PUBLICADO' && (
              <div className="g-tarjeta__cuerpo arb-borde-arriba">
                {lleno ? (
                  <p className="g-campo__ayuda">El curso completó su cupo.</p>
                ) : (
                  <BuscarPersona
                    etiqueta="Inscribir a una persona"
                    textoBoton={inscribiendo.ocupado ? 'Inscribiendo…' : 'Inscribir'}
                    rol="ARBITRO"
                    textoVacio="No hay árbitros activos en el padrón que coincidan. La persona necesita el rol de árbitro en Personas federadas."
                    excluir={inscritos.map((i) => i.persona?.id)}
                    onElegir={inscribir}
                  />
                )}
                {inscribiendo.error && <p className="g-aviso g-aviso--error" role="alert">{inscribiendo.error}</p>}
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Datos del curso">
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Formato</dt><dd>{FORMATOS_CURSO[c.format]}</dd></div>
              <div className="g-datos__fila"><dt>Modalidad</dt><dd>{c.modalidad?.value || 'Sala y playa'}</dd></div>
              <div className="g-datos__fila"><dt>Sede</dt><dd>{c.venue || '—'}</dd></div>
              <div className="g-datos__fila"><dt>Instructor</dt><dd>{c.instructor ? nombrePersona(c.instructor) : '—'}</dd></div>
              <div className="g-datos__fila"><dt>Inscripción</dt><dd>{c.enrollment_opens || c.enrollment_closes ? `${c.enrollment_opens ? fechaCorta(c.enrollment_opens) : '—'} al ${c.enrollment_closes ? fechaCorta(c.enrollment_closes) : '—'}` : 'Sin fechas'}</dd></div>
              <div className="g-datos__fila"><dt>Quién se inscribe</dt><dd>{c.only_current_accreditation ? 'Solo con acreditación vigente' : 'Cualquier persona del padrón'}</dd></div>
            </dl>
          </Tarjeta>
          {c.content && (
            <Tarjeta titulo="Contenido">
              <p className="g-tarjeta__cuerpo arb-texto-largo">{c.content}</p>
            </Tarjeta>
          )}
        </div>
      </div>

      {confirmar && (
        <Confirmar
          titulo={textosConfirmar[confirmar].titulo}
          texto={textosConfirmar[confirmar].texto}
          textoAccion={textosConfirmar[confirmar].accion}
          peligro={textosConfirmar[confirmar].peligro}
          onCerrar={() => setConfirmar(null)}
          onConfirmar={async () => {
            await cambiarEstadoCurso(c.id, confirmar);
            setConfirmar(null);
            curso.reintentar();
          }}
        />
      )}
    </div>
  );
}
