// Acreditar árbitro (Figma 02 · Acreditar árbitro). Sirve también para renovar: con ?persona=ID
// llega con la persona elegida y los datos de su acreditación actual.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Campo, Encabezado, Estado, OpcionesCatalogo, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { acreditarArbitro, fichaArbitral, hoyCR, MODALIDADES_ARBITRAJE } from '../../../services/arbitraje.js';
import { estadoDocumento, esId, listarDocumentos, nombrePersona, valoresCatalogo } from '../../../services/representante.js';
import { fechaCorta } from '../../../utils/formato.js';
import SubirDocumento from '../../asociacion/SubirDocumento.jsx';
import BuscarPersona from './BuscarPersona.jsx';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

const finDelAnioSiguiente = () => `${Number(hoyCR().slice(0, 4)) + 1}-12-31`;
const RESULTADOS = { APROBADA: 'Aprobada', PENDIENTE: 'Pendiente', REPROBADA: 'Reprobada' };

function formularioInicial(acreditacion) {
  return {
    function_code: acreditacion?.funcion?.code || '',
    level_code: acreditacion?.nivel?.code || '',
    modality: acreditacion?.modality || 'SALA',
    category_code: acreditacion?.categoria?.code || '',
    valid_from: hoyCR(),
    valid_until: finDelAnioSiguiente(),
    course_enrollment_id: '',
    practical_evaluation: 'PENDIENTE',
    physical_test: 'PENDIENTE',
    certificate_document_id: '',
    medical_document_id: '',
    notes: ''
  };
}

// Documentos de la persona que sirven de respaldo: del tipo pedido, sin rechazar ni vencer.
const documentosUtiles = (docs, tipo) => (docs || []).filter((d) => d.tipo?.code === tipo && ['vigente', 'revision', 'por-vencer'].includes(estadoDocumento(d).clave));

function Documento({ titulo, tipo, docs, valor, onCambiar, onCargar }) {
  const opciones = documentosUtiles(docs, tipo);
  const elegido = opciones.find((d) => d.id === valor);
  return (
    <div className="arb-req">
      <div className="arb-req__texto">
        <label className="arb-req__titulo" htmlFor={`doc-${tipo}`}>{titulo}</label>
        {opciones.length > 0 ? (
          <select id={`doc-${tipo}`} className="g-control" value={valor} onChange={(e) => onCambiar(e.target.value)}>
            <option value="">Sin adjuntar</option>
            {opciones.map((d) => <option key={d.id} value={d.id}>{d.file_name || d.tipo.value} · {fechaCorta(d.created_at?.slice(0, 10))}</option>)}
          </select>
        ) : (
          <p className="g-campo__ayuda" id={`doc-${tipo}`}>La persona no tiene este documento cargado.</p>
        )}
      </div>
      <div className="arb-req__acciones">
        {elegido && <Estado tono={estadoDocumento(elegido).tono}>{estadoDocumento(elegido).texto}</Estado>}
        <button type="button" className="g-boton g-boton--chico" onClick={onCargar}>{opciones.length ? 'Cargar otro' : 'Cargar'}</button>
      </div>
    </div>
  );
}

export default function AcreditarArbitro() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const personaId = esId(params.get('persona')) ? params.get('persona') : null;

  const catalogos = useCarga(
    () => Promise.all(['Tipos de oficial', 'Niveles arbitrales', 'Categorías', 'Tipos de documento'].map((c) => valoresCatalogo(c)))
      .then(([funciones, niveles, categorias, tiposDocumento]) => ({ funciones, niveles, categorias, tiposDocumento })),
    []
  );
  const persona = useCarga((signal) => (personaId ? fichaArbitral(personaId, { signal }) : Promise.resolve(null)), [personaId]);
  // Los documentos se recargan solos después de subir uno, sin tocar lo ya escrito en el formulario.
  const documentos = useCarga((signal) => (personaId ? listarDocumentos({ person_id: personaId }, { signal }) : Promise.resolve([])), [personaId]);

  const [f, setF] = useState(formularioInicial(null));
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ enviando: false, error: null });
  const [subir, setSubir] = useState(null); // 'CUR' | 'MED'

  const ficha = persona.datos;
  // Al elegir otra persona, el formulario parte de su acreditación actual (renovación).
  useEffect(() => {
    if (ficha) setF(formularioInicial(ficha.acreditacion));
  }, [ficha]);

  const cursosAprobados = useMemo(() => (ficha?.cursos || []).filter((c) => c.result === 'APROBADO'), [ficha]);
  // Al corregir un campo se quita su error; los demás quedan hasta el próximo envío.
  const cambiar = (campo) => (e) => {
    setF((x) => ({ ...x, [campo]: e.target.value }));
    setErrores((x) => (x[campo] ? { ...x, [campo]: undefined } : x));
  };
  const elegirPersona = (p) => { setErrores({}); setEstado({ enviando: false, error: null }); setParams({ persona: p.id }); };

  function validar() {
    const e = {};
    if (!f.function_code) e.function_code = 'Seleccione la función.';
    if (!f.level_code) e.level_code = 'Seleccione el nivel.';
    if (!f.valid_from) e.valid_from = 'Indique desde cuándo rige.';
    if (!f.valid_until) e.valid_until = 'Indique el vencimiento.';
    else if (f.valid_from && f.valid_until <= f.valid_from) e.valid_until = 'Debe ser posterior a la fecha de inicio.';
    else if (f.valid_until < hoyCR()) e.valid_until = 'No puede estar vencida.';
    if (!f.course_enrollment_id) e.course_enrollment_id = 'Seleccione el curso aprobado.';
    if (f.practical_evaluation !== 'APROBADA') e.practical_evaluation = 'Debe estar aprobada para acreditar.';
    if (f.physical_test !== 'APROBADA') e.physical_test = 'Debe estar aprobada para acreditar.';
    return e;
  }

  async function enviar(evento) {
    evento.preventDefault();
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) {
      setEstado({ enviando: false, error: 'Revise los campos marcados.' });
      return;
    }
    setEstado({ enviando: true, error: null });
    try {
      const r = await acreditarArbitro({
        ...f,
        person_id: personaId,
        category_code: f.category_code || undefined,
        certificate_document_id: f.certificate_document_id || undefined,
        medical_document_id: f.medical_document_id || undefined,
        notes: f.notes.trim() || undefined
      });
      navigate(RUTA.ficha(personaId), { state: { acreditada: true, acceso: r.acceso } });
    } catch (err) {
      setEstado({ enviando: false, error: err.message });
    }
  }

  const p = ficha?.persona;
  const renovacion = Boolean(ficha?.acreditacion);
  const cats = catalogos.datos;

  return (
    <form className="g-pagina" onSubmit={enviar} noValidate>
      <Encabezado
        titulo={renovacion ? 'Renovar acreditación' : 'Acreditar árbitro'}
        bajada="La acreditación habilita a la persona para recibir designaciones durante su vigencia."
        acciones={(
          <>
            <Link to={personaId && renovacion ? RUTA.ficha(personaId) : RUTA.inicio} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={!p || estado.enviando}>
              {estado.enviando ? 'Acreditando…' : 'Acreditar'}
            </button>
          </>
        )}
      />

      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Persona">
            <div className="g-tarjeta__cuerpo">
              {!personaId && <BuscarPersona etiqueta="Buscar en el padrón" rol="ARBITRO" textoVacio="No hay árbitros activos en el padrón que coincidan. La persona necesita el rol de árbitro en Personas federadas." onElegir={elegirPersona} autoFocus />}
              {persona.estado === 'cargando' && personaId && <Cargando texto="Cargando la persona…" />}
              {persona.estado === 'error' && <ErrorCarga mensaje={persona.error.message} onReintentar={persona.reintentar} />}
              {p && (
                <>
                  <div className="arb-persona-elegida">
                    <div>
                      <p className="arb-persona-elegida__nombre">{nombrePersona(p)} · {p.document_number}</p>
                      <p className="arb-txt-ok">La persona está registrada en el padrón federativo.</p>
                    </div>
                    <button type="button" className="g-enlace" onClick={() => setParams({})}>Cambiar persona</button>
                  </div>
                  {p.status !== 'ACTIVA' && <p className="g-aviso g-aviso--error">La persona no está activa en el padrón: no se puede acreditar.</p>}
                  <dl className="g-datos arb-datos-planos">
                    <div className="g-datos__fila"><dt>Asociación de origen</dt><dd>{p.asociacion?.name || 'Sin asociación'}</dd></div>
                    <div className="g-datos__fila"><dt>Provincia</dt><dd>{p.province || '—'}</dd></div>
                    <div className="g-datos__fila"><dt>Correo</dt><dd>{p.email || 'Sin correo'}</dd></div>
                    {renovacion && (
                      <div className="g-datos__fila"><dt>Acreditación actual</dt><dd>{ficha.acreditacion.funcion?.value} · {ficha.acreditacion.nivel?.value}, vence {fechaCorta(ficha.acreditacion.valid_until)}</dd></div>
                    )}
                  </dl>
                </>
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Acreditación">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Función" obligatorio error={errores.function_code}>
                {(a) => (
                  <select {...a} className="g-control" value={f.function_code} onChange={cambiar('function_code')} disabled={!p}>
                    <OpcionesCatalogo valores={cats?.funciones} vacia="Seleccione…" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Nivel" obligatorio error={errores.level_code}>
                {(a) => (
                  <select {...a} className="g-control" value={f.level_code} onChange={cambiar('level_code')} disabled={!p}>
                    <OpcionesCatalogo valores={cats?.niveles} vacia="Seleccione…" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Modalidad" obligatorio>
                {(a) => (
                  <select {...a} className="g-control" value={f.modality} onChange={cambiar('modality')} disabled={!p}>
                    {Object.entries(MODALIDADES_ARBITRAJE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Categorías que puede dirigir">
                {(a) => (
                  <select {...a} className="g-control" value={f.category_code} onChange={cambiar('category_code')} disabled={!p}>
                    <OpcionesCatalogo valores={cats?.categorias} vacia="Todas" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Vigente desde" obligatorio error={errores.valid_from}>
                {(a) => <input {...a} type="date" className="g-control" value={f.valid_from} onChange={cambiar('valid_from')} disabled={!p} />}
              </Campo>
              <Campo etiqueta="Vence" obligatorio error={errores.valid_until}>
                {(a) => <input {...a} type="date" className="g-control" value={f.valid_until} min={f.valid_from || undefined} onChange={cambiar('valid_until')} disabled={!p} />}
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Requisitos">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo
                etiqueta="Curso aprobado"
                obligatorio
                ancho
                error={errores.course_enrollment_id}
                ayuda={p && cursosAprobados.length === 0 ? (
                  <>
                    La persona no tiene cursos aprobados. Inscríbala en un curso de formación, registre su nota
                    y vuelva aquí: <Link to={RUTA.cursos}>ir a Cursos</Link>.
                  </>
                ) : undefined}
              >
                {(a) => (
                  <select {...a} className="g-control" value={f.course_enrollment_id} onChange={cambiar('course_enrollment_id')} disabled={!p || !cursosAprobados.length}>
                    <option value="">Seleccione…</option>
                    {cursosAprobados.map((c) => (
                      <option key={c.id} value={c.id}>
                        {[c.curso?.name, fechaCorta(c.curso?.end_date), c.grade !== null && c.grade !== undefined ? `nota ${Number(c.grade)}` : null].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Evaluación práctica" error={errores.practical_evaluation}>
                {(a) => (
                  <select {...a} className="g-control" value={f.practical_evaluation} onChange={cambiar('practical_evaluation')} disabled={!p}>
                    {Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Prueba física" error={errores.physical_test}>
                {(a) => (
                  <select {...a} className="g-control" value={f.physical_test} onChange={cambiar('physical_test')} disabled={!p}>
                    {Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              {p && (
                <div className="g-campo--ancho arb-reqs">
                  <Documento titulo="Certificado del curso" tipo="CUR" docs={documentos.datos} valor={f.certificate_document_id} onCambiar={(v) => setF((x) => ({ ...x, certificate_document_id: v }))} onCargar={() => setSubir('CUR')} />
                  <Documento titulo="Constancia médica" tipo="MED" docs={documentos.datos} valor={f.medical_document_id} onCambiar={(v) => setF((x) => ({ ...x, medical_document_id: v }))} onCargar={() => setSubir('MED')} />
                </div>
              )}
              <Campo etiqueta="Observaciones" ancho>
                {(a) => <textarea {...a} className="g-control" rows={2} maxLength={500} value={f.notes} onChange={cambiar('notes')} disabled={!p} />}
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div className="g-columna">
          <p className="g-aviso">
            <span className="g-aviso__titulo">Después de acreditar</span>
            El Personal de competencias ya puede designarla en partidos, y la persona recibe acceso al entorno del cuerpo arbitral con el correo que tiene en el padrón.
          </p>
          <p className="g-aviso arb-aviso-naranja">
            <span className="g-aviso__titulo">Vencimiento</span>
            Faltando 30 días para el vencimiento, la acreditación aparece como «por vencer» en Arbitraje. Vencida, la persona no se puede designar.
          </p>
          {renovacion && (
            <p className="g-aviso">
              <span className="g-aviso__titulo">Renovación</span>
              La acreditación nueva reemplaza a la actual, que queda en el historial de la ficha.
            </p>
          )}
        </div>
      </div>

      {subir && p && cats && (
        <SubirDocumento
          tipos={cats.tiposDocumento}
          tipoInicial={subir}
          titularFijo={{ texto: nombrePersona(p), titular: { person_id: p.id } }}
          onCerrar={() => setSubir(null)}
          onSubido={(doc) => {
            const campo = subir === 'CUR' ? 'certificate_document_id' : 'medical_document_id';
            setSubir(null);
            documentos.reintentar();
            if (doc?.id) setF((x) => ({ ...x, [campo]: doc.id }));
          }}
        />
      )}
    </form>
  );
}
