// Detalle de asociación para FECOVOL (Figma 02 · Detalle de asociación): equipos, documentos con
// revisión, junta directiva, datos y representante. Desde aquí se corrigen los datos oficiales y
// se suspende o reactiva la afiliación.
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import { Campo, Confirmar, Encabezado, Estado, Modal, OpcionesSede, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { actualizarAsociacionFecovol, listarEquiposDe, ESTADOS_ASOCIACION } from '../../../services/administracion.js';
import { correoValido, esId, listarDocumentos, obtenerAsociacion, valoresCatalogo, PROVINCIAS, ESTADOS_EQUIPO } from '../../../services/representante.js';
import { fechaCorta, plural } from '../../../utils/formato.js';
import SubirDocumento from '../../asociacion/SubirDocumento.jsx';
import TablaDocumentos from '../../asociacion/TablaDocumentos.jsx';
import { RUTA_ADMIN as RUTA } from '../../asociacion/contexto.js';
import { EstadoDocumentacion } from './Asociaciones.jsx';
import RevisarDocumento from './RevisarDocumento.jsx';

const CAMPOS = ['name', 'short_name', 'province', 'canton', 'email', 'phone', 'website', 'home_venue', 'address'];

function CorregirDatos({ asociacion: a, sedes, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => Object.fromEntries(CAMPOS.map((c) => [c, a[c] || ''])));
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function guardar() {
    const e = {};
    if (f.name.trim().length < 5) e.name = 'Escriba el nombre legal.';
    if (!correoValido(f.email.trim())) e.email = 'El correo no es válido.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEstado({ guardando: true, error: null });
    try {
      await actualizarAsociacionFecovol(a.id, Object.fromEntries(CAMPOS.map((c) => [c, f[c].trim()])));
      onGuardado();
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo="Corregir datos de la asociación"
      bajada="Los cambios quedan en la bitácora con el valor anterior."
      onCerrar={onCerrar}
      ocupado={estado.guardando}
      ancho="640px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.guardando}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={guardar} disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar corrección'}</button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
      <div className="g-formulario">
        <Campo etiqueta="Nombre legal" obligatorio error={errores.name} ancho>
          {(x) => <input {...x} className="g-control" value={f.name} onChange={cambiar('name')} maxLength={150} data-autofoco />}
        </Campo>
        <Campo etiqueta="Nombre corto">
          {(x) => <input {...x} className="g-control" value={f.short_name} onChange={cambiar('short_name')} maxLength={40} />}
        </Campo>
        <Campo etiqueta="Cédula jurídica" ayuda="No se cambia desde aquí: identifica a la asociación en el registro oficial.">
          {(x) => <input {...x} className="g-control" value={a.tax_id || ''} readOnly />}
        </Campo>
        <Campo etiqueta="Provincia">
          {(x) => (
            <select {...x} className="g-control" value={f.province} onChange={cambiar('province')}>
              <option value="">Sin indicar</option>
              {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Cantón">
          {(x) => <input {...x} className="g-control" value={f.canton} onChange={cambiar('canton')} maxLength={80} />}
        </Campo>
        <Campo etiqueta="Correo institucional" error={errores.email}>
          {(x) => <input {...x} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} />}
        </Campo>
        <Campo etiqueta="Teléfono">
          {(x) => <input {...x} type="tel" className="g-control" value={f.phone} onChange={cambiar('phone')} maxLength={30} />}
        </Campo>
        <Campo etiqueta="Sitio web o red social">
          {(x) => <input {...x} className="g-control" value={f.website} onChange={cambiar('website')} maxLength={200} />}
        </Campo>
        <Campo etiqueta="Gimnasio sede">
          {(x) => (
            <select {...x} className="g-control" value={f.home_venue} onChange={cambiar('home_venue')}>
              <OpcionesSede sedes={sedes} actual={a.home_venue} />
            </select>
          )}
        </Campo>
        <Campo etiqueta="Dirección" ancho>
          {(x) => <input {...x} className="g-control" value={f.address} onChange={cambiar('address')} maxLength={250} />}
        </Campo>
      </div>
    </Modal>
  );
}

function Detalle({ datos, recargar, mostrar }) {
  const { asociacion: a, equipos, documentos, tipos, sedes } = datos;
  const [modal, setModal] = useState(null);
  const estado = ESTADOS_ASOCIACION[a.status] || { texto: a.status, tono: 'neutro' };
  const rep = (a.representantes || [])[0];
  const suspendida = a.status === 'SUSPENDIDA' || a.status === 'DESAFILIADA';
  const enRevision = documentos.filter((d) => d.status === 'EN_REVISION');

  // Suspender pide confirmación; si tiene equipos o personas, el backend pide confirmar otra vez.
  async function cambiarEstado(nuevo, confirmado = false) {
    const r = await actualizarAsociacionFecovol(a.id, { status: nuevo, ...(confirmado ? { confirm_deactivation: true } : {}) })
      .catch((err) => {
        if (err.status === 409 && err.extra?.requires_confirmation) return { confirmar: err.extra.message };
        throw err;
      });
    if (r?.confirmar) {
      setModal({ tipo: 'estado', nuevo, texto: r.confirmar, confirmado: true });
      return;
    }
    setModal(null);
    mostrar(nuevo === 'SUSPENDIDA' ? 'Asociación suspendida.' : 'Asociación reactivada.');
    recargar();
  }

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={a.name}
        bajada={[a.province, a.affiliation_date ? `afiliada desde ${fechaCorta(a.affiliation_date)}` : null, rep ? `Representante: ${rep.full_name || rep.email}` : 'Sin representante'].filter(Boolean).join(' · ')}
        acciones={(
          <>
            <button
              type="button"
              className={`g-boton${suspendida ? '' : ' g-boton--peligro'}`}
              onClick={() => setModal(suspendida
                ? { tipo: 'estado', nuevo: 'AFILIADA', texto: `${a.name} volverá a estar afiliada y su representante podrá gestionar equipos y personas.` }
                : { tipo: 'estado', nuevo: 'SUSPENDIDA', texto: `${a.name} quedará suspendida. Sus datos se conservan y puede reactivarse después.` })}
            >
              {suspendida ? 'Reactivar' : 'Suspender'}
            </button>
            <button type="button" className="g-boton g-boton--primario" onClick={() => setModal({ tipo: 'corregir' })}>Corregir datos</button>
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono={estado.tono}>{estado.texto}</Estado>
          <Estado tono="neutro">{a.total_equipos} equipos · {a.total_personas} personas</Estado>
          <EstadoDocumentacion documentos={a.documentos} />
        </div>
      </Encabezado>

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta
            titulo="Equipos"
            nota={`${equipos.length} ${equipos.length === 1 ? 'equipo' : 'equipos'}`}
            accion={<Link to={`${RUTA.nuevoEquipo}?asociacion=${a.id}`} className="g-boton g-boton--chico">Registrar equipo</Link>}
          >
            {equipos.length === 0 ? <p className="g-tarjeta__vacio">La asociación todavía no tiene equipos.</p> : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Equipos</caption>
                  <thead>
                    <tr><th scope="col">Equipo</th><th scope="col">Categoría</th><th scope="col">Integrantes</th><th scope="col">Estado</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {equipos.map((e) => {
                      const est = ESTADOS_EQUIPO[e.status] || { texto: e.status, tono: 'neutro' };
                      return (
                        <tr key={e.id}>
                          <th scope="row">{e.name}<span className="g-tabla__sub">{e.modalidad?.value}</span></th>
                          <td>{[e.categoria?.value, e.rama?.value].filter(Boolean).join(' · ')}</td>
                          <td>{plural(e.jugadores ?? 0, 'jugador', 'jugadores')} · {plural(e.tecnicos ?? 0, 'técnico', 'técnicos')}</td>
                          <td><Estado tono={est.tono}>{est.texto}</Estado></td>
                          <td className="g-tabla__accion"><Link to={RUTA.equipo(e.id)} className="g-enlace">Ver nómina<span className="visualmente-oculto"> de {e.name}</span></Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Documentos"
            nota={enRevision.length ? `${enRevision.length} por revisar · incluye los de sus equipos y personas` : 'Incluye los de sus equipos y personas'}
            accion={<button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'subir' })}>Subir documento</button>}
          >
            <TablaDocumentos
              documentos={[...enRevision, ...documentos.filter((d) => d.status !== 'EN_REVISION')]}
              vacio="La asociación todavía no tiene documentos."
              onRevisar={(d) => setModal({ tipo: 'revisar', documento: d })}
            />
          </Tarjeta>

          <Tarjeta titulo="Junta directiva">
            {(a.association_board_members || []).length === 0 ? <p className="g-tarjeta__vacio">Sin cargos registrados.</p> : (
              <dl className="g-datos">
                {a.association_board_members.map((m) => (
                  <div key={m.id} className="g-datos__fila"><dt>{m.position}</dt><dd>{m.full_name}{m.email ? ` · ${m.email}` : ''}</dd></div>
                ))}
              </dl>
            )}
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Datos">
            <dl className="g-datos">
              {[
                ['Cédula jurídica', a.tax_id],
                ['Provincia', [a.province, a.canton].filter(Boolean).join(', ')],
                ['Gimnasio sede', a.home_venue],
                ['Correo', a.email],
                ['Teléfono', a.phone],
                ['Sitio web', a.website],
                ['Fundación', a.founded_date ? fechaCorta(a.founded_date) : null]
              ].map(([k, v]) => <div key={k} className="g-datos__fila"><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Representante">
            {rep ? (
              <dl className="g-datos">
                <div className="g-datos__fila"><dt>Nombre</dt><dd>{rep.full_name || '—'}</dd></div>
                <div className="g-datos__fila"><dt>Correo</dt><dd>{rep.email}</dd></div>
                <div className="g-datos__fila"><dt>Cuenta</dt><dd>{rep.status === 'ACTIVA' ? 'Activa' : rep.status === 'PENDIENTE_CONTRASENA' ? 'Invitación pendiente' : rep.status}</dd></div>
              </dl>
            ) : (
              <p className="g-tarjeta__vacio">Sin representante. Invítelo desde Usuarios y permisos con el rol Representante y esta asociación.</p>
            )}
          </Tarjeta>
        </div>
      </div>

      {modal?.tipo === 'corregir' && (
        <CorregirDatos asociacion={a} sedes={sedes} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); mostrar('Datos corregidos.'); recargar(); }} />
      )}
      {modal?.tipo === 'estado' && (
        <Confirmar
          key={modal.confirmado ? 'confirmado' : 'inicial'}
          titulo={modal.nuevo === 'SUSPENDIDA' ? 'Suspender asociación' : 'Reactivar asociación'}
          texto={modal.texto}
          textoAccion={modal.nuevo === 'SUSPENDIDA' ? 'Suspender' : 'Reactivar'}
          peligro={modal.nuevo === 'SUSPENDIDA'}
          onCerrar={() => setModal(null)}
          onConfirmar={() => cambiarEstado(modal.nuevo, modal.confirmado)}
        />
      )}
      {modal?.tipo === 'revisar' && (
        <RevisarDocumento
          documento={modal.documento}
          onCerrar={() => setModal(null)}
          onRevisado={(d) => { setModal(null); mostrar(d === 'VIGENTE' ? 'Documento aprobado.' : 'Documento rechazado; la asociación verá el motivo.'); recargar(); }}
        />
      )}
      {modal?.tipo === 'subir' && (
        <SubirDocumento
          tipos={tipos}
          titularFijo={{ texto: a.name, titular: { association_id: a.id } }}
          onCerrar={() => setModal(null)}
          onSubido={() => { setModal(null); mostrar('Documento cargado.'); recargar(); }}
        />
      )}
    </div>
  );
}

export default function AsociacionDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const [mensaje, mostrar] = useMensaje();
  const valido = esId(id);
  const carga = useCarga(
    (signal) => (valido
      ? Promise.all([
        obtenerAsociacion(id, { signal }),
        listarEquiposDe(id, { signal }),
        listarDocumentos({ association_id: id }, { signal }),
        valoresCatalogo('Tipos de documento', { signal }),
        valoresCatalogo('Sedes', { signal })
      ]).then(([asociacion, equipos, documentos, tipos, sedes]) => ({ asociacion, equipos, documentos, tipos, sedes }))
      : Promise.resolve(null)),
    [id, valido]
  );

  useEffect(() => {
    if (location.state?.mensaje) mostrar(location.state.mensaje);
  }, [location.state, mostrar]);

  if (!valido) return <SinResultados titulo="Asociación no encontrada" texto="El enlace no es válido." />;
  if (carga.estado === 'cargando') return <><Cargando texto="Cargando asociación…" />{mensaje}</>;
  if (carga.estado === 'error') {
    if (carga.error.status === 404) {
      return <SinResultados titulo="Asociación no encontrada" texto="La asociación no existe."><Link to={RUTA.asociaciones} className="g-boton">Ver asociaciones</Link></SinResultados>;
    }
    return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  }
  return <><Detalle datos={carga.datos} recargar={carga.reintentar} mostrar={mostrar} />{mensaje}</>;
}
