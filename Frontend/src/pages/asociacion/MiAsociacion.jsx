// Mi asociación (Figma 04 · Mi asociación): datos de contacto, junta directiva y documentos de la
// asociación. El nombre legal y la cédula jurídica solo los cambia FECOVOL.
import { useState } from 'react';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Confirmar, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  actualizarAsociacion, agregarCargo, correoValido, editarCargo, listarDocumentos, obtenerAsociacion, terminarCargo, valoresCatalogo, PROVINCIAS
} from '../../services/representante.js';
import { fechaCorta } from '../../utils/formato.js';
import SubirDocumento from './SubirDocumento.jsx';
import TablaDocumentos from './TablaDocumentos.jsx';
import { useAsociacion } from './contexto.js';

const ESTADO_ASOCIACION = {
  AFILIADA: { texto: 'Afiliada', tono: 'ok' },
  PROVISIONAL: { texto: 'Afiliación provisional', tono: 'aviso' },
  SUSPENDIDA: { texto: 'Suspendida', tono: 'error' },
  DESAFILIADA: { texto: 'Desafiliada', tono: 'neutro' }
};

const CAMPOS = ['short_name', 'province', 'canton', 'email', 'phone', 'website', 'home_venue', 'address'];
const datosDe = (a) => Object.fromEntries(CAMPOS.map((c) => [c, a[c] || '']));

function CargoModal({ cargo, onCerrar, onGuardar }) {
  const [f, setF] = useState({ position: cargo?.position || '', full_name: cargo?.full_name || '', email: cargo?.email || '', phone: cargo?.phone || '' });
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function guardar() {
    const e = {};
    if (!f.position.trim()) e.position = 'Indique el cargo.';
    if (!f.full_name.trim()) e.full_name = 'Escriba el nombre.';
    if (!correoValido(f.email.trim())) e.email = 'El correo no es válido.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEstado({ guardando: true, error: null });
    try {
      await onGuardar({ position: f.position.trim(), full_name: f.full_name.trim(), email: f.email.trim(), phone: f.phone.trim() });
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo={cargo ? 'Editar cargo' : 'Agregar cargo'}
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
        <Campo etiqueta="Cargo" obligatorio error={errores.position}>
          {(a) => <input {...a} className="g-control" value={f.position} onChange={cambiar('position')} maxLength={80} list="cargos" data-autofoco />}
        </Campo>
        <datalist id="cargos">
          {['Presidencia', 'Vicepresidencia', 'Secretaría', 'Tesorería', 'Fiscalía', 'Vocalía'].map((c) => <option key={c} value={c} />)}
        </datalist>
        <Campo etiqueta="Nombre completo" obligatorio error={errores.full_name}>
          {(a) => <input {...a} className="g-control" value={f.full_name} onChange={cambiar('full_name')} maxLength={150} />}
        </Campo>
        <Campo etiqueta="Correo" error={errores.email}>
          {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} />}
        </Campo>
        <Campo etiqueta="Teléfono">
          {(a) => <input {...a} type="tel" className="g-control" value={f.phone} onChange={cambiar('phone')} maxLength={30} />}
        </Campo>
      </div>
    </Modal>
  );
}

function Contenido({ datos, perfil, recargar, mostrar }) {
  const { asociacion: a, documentos, tipos, sedes } = datos;
  const [f, setF] = useState(() => datosDe(a));
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const [modal, setModal] = useState(null);
  const sucio = CAMPOS.some((c) => (f[c] || '') !== (a[c] || ''));
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const estadoAso = ESTADO_ASOCIACION[a.status] || { texto: a.status, tono: 'neutro' };

  async function guardar(e) {
    e.preventDefault();
    const encontrados = {};
    if (!correoValido(f.email.trim())) encontrados.email = 'El correo no es válido.';
    if (f.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(f.website.trim())) encontrados.website = 'Escriba una dirección web válida.';
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;
    setEstado({ guardando: true, error: null });
    try {
      await actualizarAsociacion(a.id, Object.fromEntries(CAMPOS.map((c) => [c, f[c].trim()])));
      setEstado({ guardando: false, error: null });
      mostrar('Datos de la asociación guardados.');
      recargar();
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  const junta = a.association_board_members || [];

  // Las ventanas van fuera del formulario: Enter dentro de ellas no debe guardar los datos generales.
  return (
    <>
    <form className="g-pagina" onSubmit={guardar} noValidate>
      <Encabezado
        titulo={a.name}
        bajada={[a.affiliation_date ? `Afiliada desde ${fechaCorta(a.affiliation_date)}` : null, a.tax_id ? `Cédula jurídica ${a.tax_id}` : null].filter(Boolean).join(' · ')}
        acciones={(
          <>
            <button type="button" className="g-boton" onClick={() => { setF(datosDe(a)); setErrores({}); }} disabled={!sucio || estado.guardando}>Descartar cambios</button>
            <button type="submit" className="g-boton g-boton--primario" disabled={!sucio || estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar cambios'}</button>
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono={estadoAso.tono}>{estadoAso.texto}</Estado>
          <Estado tono="neutro">{a.total_equipos} equipos · {a.total_personas} personas</Estado>
        </div>
      </Encabezado>

      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Datos generales" nota="Los cambios se guardan con el botón Guardar cambios.">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Nombre de la asociación" ayuda="Solo FECOVOL puede cambiar el nombre legal.">
                {(a2) => <input {...a2} className="g-control" value={a.name} readOnly />}
              </Campo>
              <Campo etiqueta="Nombre corto">
                {(a2) => <input {...a2} className="g-control" value={f.short_name} onChange={cambiar('short_name')} maxLength={40} />}
              </Campo>
              <Campo etiqueta="Provincia">
                {(a2) => (
                  <select {...a2} className="g-control" value={f.province} onChange={cambiar('province')}>
                    <option value="">Sin indicar</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Cantón">
                {(a2) => <input {...a2} className="g-control" value={f.canton} onChange={cambiar('canton')} maxLength={80} />}
              </Campo>
              <Campo etiqueta="Correo institucional" error={errores.email}>
                {(a2) => <input {...a2} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} />}
              </Campo>
              <Campo etiqueta="Teléfono">
                {(a2) => <input {...a2} type="tel" className="g-control" value={f.phone} onChange={cambiar('phone')} maxLength={30} />}
              </Campo>
              <Campo etiqueta="Sitio web o red social" error={errores.website}>
                {(a2) => <input {...a2} className="g-control" value={f.website} onChange={cambiar('website')} maxLength={200} />}
              </Campo>
              <Campo etiqueta="Gimnasio sede">
                {(a2) => (
                  <>
                    <input {...a2} className="g-control" value={f.home_venue} onChange={cambiar('home_venue')} maxLength={120} list="sedes-aso" />
                    <datalist id="sedes-aso">{sedes.map((s) => <option key={s.code} value={s.value} />)}</datalist>
                  </>
                )}
              </Campo>
              <Campo etiqueta="Dirección" ancho>
                {(a2) => <input {...a2} className="g-control" value={f.address} onChange={cambiar('address')} maxLength={250} />}
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta
            titulo="Junta directiva"
            pie={<><span>{junta.length} {junta.length === 1 ? 'cargo vigente' : 'cargos vigentes'}</span><button type="button" className="g-boton g-boton--chico" onClick={() => setModal({ tipo: 'cargo' })}>Agregar cargo</button></>}
          >
            {junta.length === 0 ? <p className="g-tarjeta__vacio">Todavía no hay cargos registrados.</p> : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Junta directiva</caption>
                  <thead>
                    <tr><th scope="col">Cargo</th><th scope="col">Nombre</th><th scope="col">Contacto</th><th scope="col"><span className="visualmente-oculto">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {junta.map((m) => (
                      <tr key={m.id}>
                        <td>{m.position}</td>
                        <th scope="row">{m.full_name}</th>
                        <td>{[m.email, m.phone].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="g-tabla__accion">
                          <span style={{ display: 'inline-flex', gap: 14 }}>
                            <button type="button" className="g-enlace" onClick={() => setModal({ tipo: 'cargo', cargo: m })}>Editar<span className="visualmente-oculto"> {m.position}</span></button>
                            <button type="button" className="g-enlace g-enlace--peligro" onClick={() => setModal({ tipo: 'terminar', cargo: m })}>Terminar<span className="visualmente-oculto"> {m.position}</span></button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Documentos de la asociación"
            accion={<button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => setModal({ tipo: 'subir' })}>Subir documento</button>}
          >
            <TablaDocumentos
              documentos={documentos}
              conTitular={false}
              vacio="Todavía no hay documentos. Por ejemplo: personería jurídica, estatutos o póliza de riesgos del trabajo."
              onReemplazar={(d) => setModal({ tipo: 'subir', tipoDoc: d.tipo?.code })}
            />
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Representante">
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Nombre</dt><dd>{perfil.full_name || '—'}</dd></div>
              <div className="g-datos__fila"><dt>Correo</dt><dd>{perfil.email}</dd></div>
              <div className="g-datos__fila"><dt>Rol</dt><dd>Representante de asociación</dd></div>
            </dl>
          </Tarjeta>
          <p className="g-aviso g-aviso--ok">
            <span className="g-aviso__titulo">Sin trámites</span>
            La asociación actualiza aquí sus datos, equipos, personas y documentos. No hace falta enviar archivos a FECOVOL por otro medio.
          </p>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Qué revisa FECOVOL</span>
            Solo el nombre legal y la cédula jurídica los cambia la Federación. Los documentos nuevos quedan en revisión.
          </p>
        </div>
      </div>

    </form>
      {modal?.tipo === 'cargo' && (
        <CargoModal
          cargo={modal.cargo}
          onCerrar={() => setModal(null)}
          onGuardar={async (cargo) => {
            if (modal.cargo) await editarCargo(modal.cargo.id, cargo);
            else await agregarCargo(a.id, cargo);
            setModal(null);
            mostrar(modal.cargo ? 'Cargo actualizado.' : 'Cargo agregado.');
            recargar();
          }}
        />
      )}
      {modal?.tipo === 'terminar' && (
        <Confirmar
          titulo="Terminar cargo"
          texto={`${modal.cargo.full_name} dejará de figurar en ${modal.cargo.position}. El registro se conserva en el historial de la asociación.`}
          textoAccion="Terminar cargo"
          peligro
          onCerrar={() => setModal(null)}
          onConfirmar={async () => { await terminarCargo(modal.cargo.id); setModal(null); mostrar('Cargo terminado.'); recargar(); }}
        />
      )}
      {modal?.tipo === 'subir' && (
        <SubirDocumento
          tipos={tipos}
          titularFijo={{ texto: a.name, titular: { association_id: a.id } }}
          tipoInicial={modal.tipoDoc || ''}
          onCerrar={() => setModal(null)}
          onSubido={() => { setModal(null); mostrar('Documento cargado. Queda en revisión de FECOVOL.'); recargar(); }}
        />
      )}
    </>
  );
}

export default function MiAsociacion() {
  const { asociacionId, perfil } = useAsociacion([{ texto: 'Mi asociación' }]);
  const [mensaje, mostrar] = useMensaje();
  const carga = useCarga(
    (signal) => Promise.all([
      obtenerAsociacion(asociacionId, { signal }),
      listarDocumentos({ association_id: asociacionId }, { signal }),
      valoresCatalogo('Tipos de documento', { signal }),
      valoresCatalogo('Sedes', { signal })
    ]).then(([asociacion, documentos, tipos, sedes]) => ({
      asociacion,
      // Solo los documentos de la asociación misma (los de equipos y personas están en Documentos).
      documentos: documentos.filter((d) => d.titular === 'ASOCIACION'),
      tipos,
      sedes
    })),
    [asociacionId]
  );

  if (carga.estado === 'cargando') return <><Cargando texto="Cargando su asociación…" />{mensaje}</>;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  return <><Contenido key={carga.datos.asociacion.updated_at || 'a'} datos={carga.datos} perfil={perfil} recargar={carga.reintentar} mostrar={mostrar} />{mensaje}</>;
}
