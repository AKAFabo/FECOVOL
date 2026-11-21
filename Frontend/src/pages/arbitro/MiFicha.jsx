// Mi ficha (Figma 05 · Mi ficha): datos oficiales (los corrige FECOVOL) y de contacto (los edita la
// persona), acreditaciones y cursos, la temporada y los cursos abiertos para inscribirse.
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Campo, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import {
  actualizarMiContacto, categoriaArbitral, fechaNumerica, FORMATOS_CURSO, hoyCR, inscribirmeEnCurso, RESULTADOS_CURSO, TIPOS_CURSO
} from '../../services/arbitraje.js';
import { correoValido, nombrePersona } from '../../services/representante.js';
import { rangoFechas } from '../../utils/formato.js';
import '../../styles/arbitraje.css';

const iniciales = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase();

function Dato({ etiqueta, tipo, children }) {
  return (
    <div className="arb-dato">
      <dt>{etiqueta} <span className={`arb-dato__tipo arb-dato__tipo--${tipo}`}>{tipo === 'oficial' ? 'Oficial' : 'Editable'}</span></dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

function EditarContacto({ persona, onCerrar, onGuardado }) {
  const [f, setF] = useState({ email: persona.email || '', phone: persona.phone || '' });
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ ocupado: false, error: null });

  async function guardar() {
    const e = {};
    if (!f.email.trim() || !correoValido(f.email.trim())) e.email = 'Escriba un correo válido.';
    if (!/^[0-9 +()-]{7,20}$/.test(f.phone.trim())) e.phone = 'Escriba un teléfono válido (por ejemplo, 8888-0000).';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEstado({ ocupado: true, error: null });
    try {
      await actualizarMiContacto({ email: f.email.trim(), phone: f.phone.trim() });
      onGuardado();
    } catch (err) {
      setEstado({ ocupado: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo="Mis datos de contacto"
      bajada="FECOVOL los usa para avisarle de sus designaciones."
      onCerrar={onCerrar}
      ocupado={estado.ocupado}
      ancho="480px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.ocupado}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={guardar} disabled={estado.ocupado}>{estado.ocupado ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
      <div className="g-formulario g-formulario--una">
        <Campo etiqueta="Correo" obligatorio error={errores.email} ayuda="Es su correo de contacto; el de ingreso al sistema no cambia.">
          {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} maxLength={254} autoComplete="email" data-autofoco />}
        </Campo>
        <Campo etiqueta="Teléfono" obligatorio error={errores.phone}>
          {(a) => <input {...a} type="tel" className="g-control" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} maxLength={20} autoComplete="tel" />}
        </Campo>
      </div>
    </Modal>
  );
}

export default function MiFicha() {
  const { ficha, recargarFicha } = useOutletContext();
  const [mensaje, avisar] = useMensaje();
  const [editar, setEditar] = useState(false);
  const [inscribiendo, setInscribiendo] = useState({ id: null, error: null });

  const { persona: p, acreditacion: a, acreditaciones, cursos, cursos_abiertos: abiertos, temporada } = ficha;
  const hoy = hoyCR();
  const vigente = a && a.valid_until >= hoy;
  const puestos = temporada?.por_puesto || {};

  async function inscribirme(curso) {
    setInscribiendo({ id: curso.id, error: null });
    try {
      await inscribirmeEnCurso(curso.id);
      setInscribiendo({ id: null, error: null });
      avisar(`Inscripción registrada en «${curso.name}».`);
      recargarFicha();
    } catch (e) {
      setInscribiendo({ id: null, error: e.message });
    }
  }

  // Acreditaciones y cursos en una sola tabla, del más reciente al más antiguo.
  const historial = [
    ...acreditaciones.map((x) => ({
      clave: `a-${x.id}`,
      titulo: `Acreditación ${categoriaArbitral(x)}`,
      fecha: x.valid_from,
      vence: x.valid_until,
      estado: x.status === 'ACTIVA' ? (x.valid_until >= hoy ? { texto: 'Vigente', tono: 'ok' } : { texto: 'Vencida', tono: 'error' }) : { texto: 'Superada', tono: 'neutro' }
    })),
    ...cursos.map((c) => ({
      clave: `c-${c.id}`,
      titulo: c.curso?.name,
      fecha: c.curso?.start_date,
      vence: null,
      estado: RESULTADOS_CURSO[c.result] || RESULTADOS_CURSO.INSCRITO,
      nota: c.grade
    }))
  ].sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));

  return (
    <div className="g-pagina">
      {mensaje}
      <header className="arb-ficha-cabecera">
        <span className="arb-avatar arb-avatar--grande" aria-hidden="true">{iniciales(p)}</span>
        <div className="arb-ficha-cabecera__texto">
          <Encabezado titulo={nombrePersona(p)}>
            <div className="g-encabezado__pastillas">
              <Estado tono="neutro">Cédula {p.document_number}</Estado>
              {a && <Estado tono="neutro">{categoriaArbitral(a)}</Estado>}
              <Estado tono={vigente ? 'ok' : 'error'}>{a ? (vigente ? 'Acreditación al día' : 'Acreditación vencida') : 'Sin acreditación'}</Estado>
            </div>
          </Encabezado>
        </div>
        <button type="button" className="g-boton" onClick={() => setEditar(true)}>Editar mis datos de contacto</button>
      </header>

      <p className="g-aviso">
        <span className="g-aviso__titulo">Qué puede cambiar usted</span>
        Su correo y su teléfono los edita directamente. El nombre, la cédula y la categoría arbitral son datos oficiales: los corrige la Administración de FECOVOL y queda registrado.
      </p>

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Datos de la ficha arbitral">
            <dl className="arb-datos">
              <Dato etiqueta="Nombre completo" tipo="oficial">{nombrePersona(p)}</Dato>
              <Dato etiqueta="Cédula" tipo="oficial">{p.document_number}</Dato>
              <Dato etiqueta="Categoría arbitral" tipo="oficial">{a ? categoriaArbitral(a) : 'Sin acreditación'}</Dato>
              <Dato etiqueta="Asociación" tipo="oficial">{p.asociacion?.name || 'Sin asociación'}</Dato>
              <Dato etiqueta="Correo" tipo="editable">{p.email}</Dato>
              <Dato etiqueta="Teléfono" tipo="editable">{p.phone}</Dato>
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Acreditaciones y cursos">
            {historial.length === 0 ? (
              <p className="g-tarjeta__vacio">Todavía no tiene acreditaciones ni cursos registrados.</p>
            ) : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Acreditaciones y cursos</caption>
                  <thead><tr><th scope="col">Curso o acreditación</th><th scope="col">Fecha</th><th scope="col">Vence</th><th scope="col">Estado</th></tr></thead>
                  <tbody>
                    {historial.map((h) => (
                      <tr key={h.clave}>
                        <th scope="row">{h.titulo}</th>
                        <td className="g-tabla__fecha">{fechaNumerica(h.fecha)}</td>
                        <td className="g-tabla__fecha">{h.vence ? fechaNumerica(h.vence) : '—'}</td>
                        <td><Estado tono={h.estado.tono}>{h.estado.texto}</Estado>{h.nota !== null && h.nota !== undefined && <span className="arb-nota"> · {Number(h.nota)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Su temporada" nota={`Temporada ${temporada?.anio}`}>
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Como principal</dt><dd>{puestos.PRI || 0}</dd></div>
              <div className="g-datos__fila"><dt>Como segundo árbitro</dt><dd>{puestos.SEG || 0}</dd></div>
              <div className="g-datos__fila"><dt>Como anotador</dt><dd>{puestos.ANO || 0}</dd></div>
              <div className="g-datos__fila"><dt>Como juez de línea</dt><dd>{puestos.LIN || 0}</dd></div>
              <div className="g-datos__fila"><dt>Actas validadas</dt><dd className="arb-cifra-ok">{temporada?.actas_validadas || 0} de {temporada?.partidos || 0}</dd></div>
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Cursos abiertos" nota="Para formarse o renovar su acreditación">
            {inscribiendo.error && <p className="g-aviso g-aviso--error arb-margen" role="alert">{inscribiendo.error}</p>}
            {abiertos.length === 0 ? (
              <p className="g-tarjeta__vacio">No hay cursos con inscripción abierta para usted.</p>
            ) : (
              <ul className="g-lista">
                {abiertos.map((c) => (
                  <li key={c.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo">{c.name}</p>
                      <p className="g-lista__detalle">{[TIPOS_CURSO[c.course_type]?.texto, rangoFechas(c.start_date, c.end_date), FORMATOS_CURSO[c.format], c.format === 'VIRTUAL' ? null : c.venue].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => inscribirme(c)} disabled={Boolean(inscribiendo.id)}>
                      {inscribiendo.id === c.id ? 'Inscribiendo…' : 'Inscribirme'}<span className="visualmente-oculto"> en {c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      {editar && (
        <EditarContacto
          persona={p}
          onCerrar={() => setEditar(false)}
          onGuardado={() => {
            setEditar(false);
            avisar('Datos de contacto actualizados.');
            recargarFicha();
          }}
        />
      )}
    </div>
  );
}
