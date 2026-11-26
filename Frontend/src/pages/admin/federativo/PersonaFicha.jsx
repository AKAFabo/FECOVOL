// Ficha de persona para FECOVOL (Figma 02 · Ficha de persona): datos, verificación de identidad,
// corrección oficial con motivo, documentos con revisión, roles, equipos e historial.
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import { Campo, Confirmar, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { cambiarRolPersona, corregirPersona, historialPersona, verificarPersona } from '../../../services/administracion.js';
import { correoValido, esId, listarDocumentos, nombrePersona, obtenerPersona, valoresCatalogo, PROVINCIAS, ROLES_PERSONA } from '../../../services/representante.js';
import { fechaCorta, fechaHora } from '../../../utils/formato.js';
import SubirDocumento from '../../asociacion/SubirDocumento.jsx';
import TablaDocumentos from '../../asociacion/TablaDocumentos.jsx';
import { RUTA_ADMIN as RUTA } from '../../asociacion/contexto.js';
import RevisarDocumento from './RevisarDocumento.jsx';
import { errorFechaNacimiento, fechaNacimientoMaxima, FECHA_NACIMIENTO_MINIMA } from '../../../utils/fechaNacimiento.js';

const SEXO = { F: 'Femenino', M: 'Masculino', OTRO: 'Otro' };
const CAMPOS_CORRECCION = [
  { valor: 'first_name', texto: 'Nombre' },
  { valor: 'last_name', texto: 'Apellidos' },
  { valor: 'birth_date', texto: 'Fecha de nacimiento' },
  { valor: 'sex', texto: 'Sexo' }
];

function mostrarValor(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (campo === 'birth_date') return fechaCorta(valor);
  if (campo === 'sex') return SEXO[valor] || valor;
  return String(valor);
}

function CorreccionOficial({ persona, onCerrar, onGuardado }) {
  const [campo, setCampo] = useState('first_name');
  const [valor, setValor] = useState(persona.first_name || '');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });

  function elegirCampo(c) {
    setCampo(c);
    setValor(persona[c] || '');
    setErrores({});
  }

  async function guardar() {
    const e = {};
    const nuevo = typeof valor === 'string' ? valor.trim() : valor;
    if (!nuevo) e.valor = 'Escriba el valor correcto.';
    else if (String(nuevo) === String(persona[campo] || '')) e.valor = 'El valor correcto es igual al actual.';
    if (campo === 'birth_date' && nuevo && errorFechaNacimiento(nuevo)) e.valor = errorFechaNacimiento(nuevo);
    if (motivo.trim().length < 10) e.motivo = 'Explique el motivo (al menos 10 caracteres).';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEstado({ guardando: true, error: null });
    try {
      await corregirPersona(persona.id, { [campo]: nuevo, motivo: motivo.trim() });
      onGuardado();
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo="Corrección oficial de datos"
      bajada="Los datos de identidad solo se corrigen con un motivo. El valor anterior queda en el historial de la persona."
      onCerrar={onCerrar}
      ocupado={estado.guardando}
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.guardando}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={guardar} disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar corrección'}</button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
      <div className="g-formulario g-formulario--una">
        <Campo etiqueta="Dato a corregir">
          {(a) => (
            <select {...a} className="g-control" value={campo} onChange={(e) => elegirCampo(e.target.value)} data-autofoco>
              {CAMPOS_CORRECCION.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Valor actual">
          {(a) => <input {...a} className="g-control" value={mostrarValor(campo, persona[campo])} readOnly />}
        </Campo>
        <Campo etiqueta="Valor correcto" obligatorio error={errores.valor}>
          {(a) => {
            if (campo === 'birth_date') return <input {...a} type="date" className="g-control" value={valor} max={fechaNacimientoMaxima()} min={FECHA_NACIMIENTO_MINIMA} onChange={(e) => setValor(e.target.value)} />;
            if (campo === 'sex') {
              return (
                <select {...a} className="g-control" value={valor} onChange={(e) => setValor(e.target.value)}>
                  <option value="">Elija…</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="OTRO">Otro</option>
                </select>
              );
            }
            return <input {...a} className="g-control" value={valor} onChange={(e) => setValor(e.target.value)} maxLength={100} />;
          }}
        </Campo>
        <Campo etiqueta="Motivo" obligatorio error={errores.motivo}>
          {(a) => <textarea {...a} className="g-control" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: error de digitación en el registro original." />}
        </Campo>
      </div>
    </Modal>
  );
}

function EditarContacto({ persona, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    email: persona.email || '', phone: persona.phone || '', province: persona.province || '',
    emergency_contact: persona.emergency_contact || '', status: persona.status || 'ACTIVA'
  });
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (c) => (e) => setF((x) => ({ ...x, [c]: e.target.value }));

  async function guardar() {
    if (!correoValido(f.email.trim())) { setError('El correo no es válido.'); return; }
    setError(null);
    setEstado({ guardando: true, error: null });
    try {
      await corregirPersona(persona.id, { email: f.email.trim(), phone: f.phone.trim(), province: f.province, emergency_contact: f.emergency_contact.trim(), status: f.status });
      onGuardado();
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo="Editar datos de contacto"
      onCerrar={onCerrar}
      ocupado={estado.guardando}
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.guardando}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={guardar} disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
      <div className="g-formulario">
        <Campo etiqueta="Correo" error={error}>
          {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} data-autofoco />}
        </Campo>
        <Campo etiqueta="Teléfono">
          {(a) => <input {...a} type="tel" className="g-control" value={f.phone} onChange={cambiar('phone')} maxLength={20} />}
        </Campo>
        <Campo etiqueta="Provincia">
          {(a) => (
            <select {...a} className="g-control" value={f.province} onChange={cambiar('province')}>
              <option value="">Sin indicar</option>
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Estado en el padrón">
          {(a) => (
            <select {...a} className="g-control" value={f.status} onChange={cambiar('status')}>
              <option value="ACTIVA">Activa</option>
              <option value="INACTIVA">Inactiva</option>
            </select>
          )}
        </Campo>
        <Campo etiqueta="Contacto de emergencia" ancho>
          {(a) => <input {...a} className="g-control" value={f.emergency_contact} onChange={cambiar('emergency_contact')} maxLength={150} />}
        </Campo>
      </div>
    </Modal>
  );
}

function Roles({ persona, onCambio }) {
  const activos = new Set((persona.person_roles || []).filter((r) => r.is_active).map((r) => r.role_type));
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState(null);

  async function cambiar(rol, activo) {
    setOcupado(rol);
    setError(null);
    try {
      await cambiarRolPersona(persona.id, rol, activo);
      onCambio(`${ROLES_PERSONA[rol]}: ${activo ? 'habilitado' : 'deshabilitado'}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Tarjeta titulo="Participa como">
      <div className="g-tarjeta__cuerpo" style={{ display: 'grid', gap: 10 }}>
        {error && <p className="g-aviso g-aviso--error" role="alert">{error}</p>}
        {Object.entries(ROLES_PERSONA).map(([rol, texto]) => (
          <label key={rol} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={activos.has(rol)} disabled={ocupado !== null} onChange={(e) => cambiar(rol, e.target.checked)} />
            {texto}{ocupado === rol && ' …'}
          </label>
        ))}
      </div>
    </Tarjeta>
  );
}

function Ficha({ datos, recargar, mostrar }) {
  const { persona: p, documentos, tipos, historial } = datos;
  const [modal, setModal] = useState(null);
  const roles = (p.person_roles || []).filter((r) => r.is_active).map((r) => ROLES_PERSONA[r.role_type] || r.role_type);
  const equipos = (p.equipos || []).filter((m) => m.status === 'ACTIVO');
  const enRevision = documentos.filter((d) => d.status === 'EN_REVISION');

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={nombrePersona(p)}
        acciones={(
          <>
            <button type="button" className="g-boton" onClick={() => setModal({ tipo: 'contacto' })}>Editar datos</button>
            {!p.is_verified && <button type="button" className="g-boton" onClick={() => setModal({ tipo: 'verificar' })}>Verificar identidad</button>}
            <button type="button" className="g-boton g-boton--primario" onClick={() => setModal({ tipo: 'corregir' })}>Corrección oficial</button>
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono="neutro">{p.tipo_documento?.value || 'Identificación'} {p.document_number}</Estado>
          {roles.map((r) => <Estado key={r} tono="info">{r}</Estado>)}
          {p.asociacion && <Estado tono="neutro">{p.asociacion.short_name || p.asociacion.name}</Estado>}
          {p.is_verified ? <Estado tono="ok">Identidad verificada</Estado> : <Estado tono="aviso">Identidad por verificar</Estado>}
          {p.status === 'INACTIVA' && <Estado tono="error">Inactiva</Estado>}
        </div>
      </Encabezado>

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Datos personales">
            <dl className="g-datos">
              {[
                ['Nombre completo', nombrePersona(p)],
                ['Identificación', `${p.tipo_documento?.value || ''} ${p.document_number}`.trim()],
                ['Fecha de nacimiento', p.birth_date ? fechaCorta(p.birth_date) : '—'],
                ['Sexo', SEXO[p.sex] || '—'],
                ['Asociación', p.asociacion?.name || 'Sin asociación'],
                ['Provincia', p.province || '—'],
                ['Correo', p.email || '—'],
                ['Teléfono', p.phone || '—'],
                ['Contacto de emergencia', p.emergency_contact || '—']
              ].map(([k, v]) => <div key={k} className="g-datos__fila"><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </Tarjeta>

          <Tarjeta
            titulo="Documentos"
            nota={enRevision.length ? `${enRevision.length} por revisar` : null}
            accion={<button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'subir' })}>Subir documento</button>}
          >
            <TablaDocumentos
              documentos={[...enRevision, ...documentos.filter((d) => d.status !== 'EN_REVISION')]}
              conTitular={false}
              vacio="La persona todavía no tiene documentos."
              onRevisar={(d) => setModal({ tipo: 'revisar', documento: d })}
            />
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Equipos y nóminas">
            {equipos.length === 0 ? <p className="g-tarjeta__vacio">No está en la nómina de ningún equipo.</p> : (
              <ul className="g-lista">
                {equipos.map((m) => (
                  <li key={m.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo"><Link className="g-enlace" to={RUTA.equipo(m.equipo.id)}>{m.equipo.name}</Link></p>
                      <p className="g-lista__detalle">{m.member_type === 'JUGADOR' ? `Atleta${m.jersey_number ? ` · N.º ${m.jersey_number}` : ''}` : 'Cuerpo técnico'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Roles persona={p} onCambio={(m) => { mostrar(m); recargar(); }} />

          <Tarjeta titulo="Historial">
            {historial.length === 0 ? <p className="g-tarjeta__vacio">Sin movimientos registrados.</p> : (
              <ul className="g-lista">
                {historial.map((h, i) => (
                  <li key={`${h.fecha}-${i}`} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo">{h.texto}</p>
                      <p className="g-lista__detalle">
                        {[
                          h.antes && Object.keys(h.antes).map((c) => `Antes: ${mostrarValor(c, h.antes[c])}`).join(' · '),
                          h.motivo,
                          h.usuario,
                          fechaHora(h.fecha)
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      {modal?.tipo === 'corregir' && <CorreccionOficial persona={p} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); mostrar('Corrección guardada.'); recargar(); }} />}
      {modal?.tipo === 'contacto' && <EditarContacto persona={p} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); mostrar('Datos guardados.'); recargar(); }} />}
      {modal?.tipo === 'verificar' && (
        <Confirmar
          titulo="Verificar identidad"
          texto={`Confirme que revisó el documento de identidad de ${nombrePersona(p)} y que el nombre, la identificación y la fecha de nacimiento coinciden. Después, solo FECOVOL podrá corregir esos datos.`}
          textoAccion="Verificar"
          onCerrar={() => setModal(null)}
          onConfirmar={async () => { await verificarPersona(p.id); setModal(null); mostrar('Identidad verificada.'); recargar(); }}
        />
      )}
      {modal?.tipo === 'revisar' && (
        <RevisarDocumento
          documento={modal.documento}
          onCerrar={() => setModal(null)}
          onRevisado={(d) => { setModal(null); mostrar(d === 'VIGENTE' ? 'Documento aprobado.' : 'Documento rechazado.'); recargar(); }}
        />
      )}
      {modal?.tipo === 'subir' && (
        <SubirDocumento
          tipos={tipos}
          titularFijo={{ texto: nombrePersona(p), titular: { person_id: p.id } }}
          onCerrar={() => setModal(null)}
          onSubido={() => { setModal(null); mostrar('Documento cargado.'); recargar(); }}
        />
      )}
    </div>
  );
}

export default function PersonaFicha() {
  const { id } = useParams();
  const location = useLocation();
  const [mensaje, mostrar] = useMensaje();
  const valido = esId(id);
  const carga = useCarga(
    (signal) => (valido
      ? Promise.all([
        obtenerPersona(id, { signal }),
        listarDocumentos({ person_id: id }, { signal }),
        valoresCatalogo('Tipos de documento', { signal }),
        historialPersona(id, { signal })
      ]).then(([persona, documentos, tipos, historial]) => ({ persona, documentos, tipos, historial }))
      : Promise.resolve(null)),
    [id, valido]
  );

  useEffect(() => {
    if (location.state?.mensaje) mostrar(location.state.mensaje);
  }, [location.state, mostrar]);

  if (!valido) return <SinResultados titulo="Persona no encontrada" texto="El enlace no es válido." />;
  if (carga.estado === 'cargando') return <><Cargando texto="Cargando ficha…" />{mensaje}</>;
  if (carga.estado === 'error') {
    if (carga.error.status === 404) {
      return <SinResultados titulo="Persona no encontrada" texto="La persona no existe."><Link to={RUTA.personas} className="g-boton">Ver personas</Link></SinResultados>;
    }
    return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  }
  return <><Ficha datos={carga.datos} recargar={carga.reintentar} mostrar={mostrar} />{mensaje}</>;
}
