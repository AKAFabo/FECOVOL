// Ficha de una persona: datos, equipos y documentos. El representante puede corregir el contacto;
// identificación, nombre y fecha de nacimiento solo mientras FECOVOL no los haya verificado.
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, Estado, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  actualizarPersona, correoValido, esId, listarDocumentos, nombrePersona, obtenerPersona, valoresCatalogo, PROVINCIAS, ROLES_PERSONA
} from '../../services/representante.js';
import { fechaCorta } from '../../utils/formato.js';
import SubirDocumento from './SubirDocumento.jsx';
import TablaDocumentos from './TablaDocumentos.jsx';
import { RUTA, useAsociacion } from './contexto.js';
import { errorFechaNacimiento, fechaNacimientoMaxima, FECHA_NACIMIENTO_MINIMA } from '../../utils/fechaNacimiento.js';
import EntradaTelefono from '../../components/EntradaTelefono.jsx';
import { normalizarTelefono } from '../../utils/telefono.js';

const SEXO = { F: 'Femenino', M: 'Masculino', OTRO: 'Otro' };

function datosEditables(p) {
  return {
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    birth_date: p.birth_date || '',
    email: p.email || '',
    phone: p.phone || '',
    province: p.province || '',
    emergency_contact: p.emergency_contact || ''
  };
}

function Ficha({ persona, documentos, tipos, recargar, mostrar }) {
  const location = useLocation();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(() => datosEditables(persona));
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const [subir, setSubir] = useState(null);
  const verificada = persona.is_verified;

  useEffect(() => {
    if (location.state?.mensaje) mostrar(location.state.mensaje);
  }, [location.state, mostrar]);

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    const encontrados = {};
    if (!verificada && !f.first_name.trim()) encontrados.first_name = 'Escriba el nombre.';
    if (!verificada && !f.last_name.trim()) encontrados.last_name = 'Escriba los apellidos.';
    if (!correoValido(f.email.trim())) encontrados.email = 'El correo no es válido.';
    if (normalizarTelefono(f.phone).error) encontrados.phone = normalizarTelefono(f.phone).error;
    if (!verificada && f.birth_date && errorFechaNacimiento(f.birth_date)) encontrados.birth_date = errorFechaNacimiento(f.birth_date);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    setEstado({ guardando: true, error: null });
    const cambios = {
      email: f.email.trim(),
      phone: normalizarTelefono(f.phone).valor || '',
      province: f.province,
      emergency_contact: f.emergency_contact.trim()
    };
    if (!verificada) Object.assign(cambios, { first_name: f.first_name.trim(), last_name: f.last_name.trim(), birth_date: f.birth_date || null });
    try {
      await actualizarPersona(persona.id, cambios);
      setEstado({ guardando: false, error: null });
      setEditando(false);
      mostrar('Cambios guardados.');
      recargar();
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  const roles = (persona.person_roles || []).filter((r) => r.is_active).map((r) => ROLES_PERSONA[r.role_type] || r.role_type);
  const equipos = (persona.equipos || []).filter((m) => m.status === 'ACTIVO');

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={nombrePersona(persona)}
        bajada={`${persona.tipo_documento?.value || 'Identificación'} ${persona.document_number}`}
        acciones={!editando && <button type="button" className="g-boton" onClick={() => setEditando(true)}>Editar datos</button>}
      >
        <div className="g-encabezado__pastillas">
          {roles.map((r) => <Estado key={r} tono="info">{r}</Estado>)}
          {verificada ? <Estado tono="ok">Identidad verificada</Estado> : <Estado tono="neutro">Identidad por verificar</Estado>}
        </div>
      </Encabezado>

      <div className="g-rejilla">
        <div className="g-columna">
          {editando ? (
            <form onSubmit={guardar} noValidate>
              <Tarjeta
                titulo="Editar datos"
                nota={verificada ? 'FECOVOL ya verificó la identidad: el nombre y la fecha de nacimiento solo los cambia FECOVOL.' : null}
                pie={(
                  <>
                    <span />
                    <span style={{ display: 'flex', gap: 10 }}>
                      <button type="button" className="g-boton" onClick={() => { setEditando(false); setF(datosEditables(persona)); setErrores({}); }} disabled={estado.guardando}>Cancelar</button>
                      <button type="submit" className="g-boton g-boton--primario" disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar cambios'}</button>
                    </span>
                  </>
                )}
              >
                <div className="g-tarjeta__cuerpo g-formulario">
                  {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
                  <Campo etiqueta="Nombre" error={errores.first_name}>
                    {(a) => <input {...a} className="g-control" value={f.first_name} onChange={cambiar('first_name')} readOnly={verificada} maxLength={80} />}
                  </Campo>
                  <Campo etiqueta="Apellidos" error={errores.last_name}>
                    {(a) => <input {...a} className="g-control" value={f.last_name} onChange={cambiar('last_name')} readOnly={verificada} maxLength={100} />}
                  </Campo>
                  <Campo etiqueta="Fecha de nacimiento" error={errores.birth_date}>
                    {(a) => <input {...a} type="date" className="g-control" value={f.birth_date} max={fechaNacimientoMaxima()} min={FECHA_NACIMIENTO_MINIMA} onChange={cambiar('birth_date')} readOnly={verificada} />}
                  </Campo>
                  <Campo etiqueta="Provincia">
                    {(a) => (
                      <select {...a} className="g-control" value={f.province} onChange={cambiar('province')}>
                        <option value="">Sin indicar</option>
                        {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </Campo>
                  <Campo etiqueta="Correo electrónico" error={errores.email}>
                    {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} />}
                  </Campo>
                  <Campo etiqueta="Teléfono" error={errores.phone}>
                    {(a) => <EntradaTelefono {...a} className="g-control" value={f.phone} onCambiar={(v) => setF((x) => ({ ...x, phone: v }))} />}
                  </Campo>
                  <Campo etiqueta="Contacto de emergencia" ancho ayuda="Nombre, parentesco y teléfono.">
                    {(a) => <input {...a} className="g-control" value={f.emergency_contact} onChange={cambiar('emergency_contact')} maxLength={150} />}
                  </Campo>
                </div>
              </Tarjeta>
            </form>
          ) : (
            <Tarjeta titulo="Datos personales">
              <dl className="g-datos">
                {[
                  ['Fecha de nacimiento', persona.birth_date ? fechaCorta(persona.birth_date) : '—'],
                  ['Sexo', SEXO[persona.sex] || '—'],
                  ['Provincia', persona.province || '—'],
                  ['Correo', persona.email || '—'],
                  ['Teléfono', persona.phone || '—'],
                  ['Contacto de emergencia', persona.emergency_contact || '—']
                ].map(([k, v]) => (
                  <div key={k} className="g-datos__fila"><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </Tarjeta>
          )}

          <Tarjeta
            titulo="Documentos"
            accion={<button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => setSubir({})}>Subir documento</button>}
          >
            <TablaDocumentos
              documentos={documentos}
              conTitular={false}
              vacio="Todavía no tiene documentos. Empiece por la copia de la identificación."
              onReemplazar={(d) => setSubir({ tipo: d.tipo?.code })}
            />
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Equipos">
            {equipos.length === 0 ? (
              <p className="g-tarjeta__vacio">No está en la nómina de ningún equipo.</p>
            ) : (
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
        </div>
      </div>

      {subir && (
        <SubirDocumento
          tipos={tipos}
          titularFijo={{ texto: nombrePersona(persona), titular: { person_id: persona.id } }}
          tipoInicial={subir.tipo || ''}
          onCerrar={() => setSubir(null)}
          onSubido={() => { setSubir(null); mostrar('Documento cargado. Queda en revisión de FECOVOL.'); recargar(); }}
        />
      )}
    </div>
  );
}

export default function PersonaFicha() {
  const { id } = useParams();
  useAsociacion([{ texto: 'Personas', to: RUTA.personas }, { texto: 'Ficha' }]);
  // El mensaje vive aquí y no en la ficha: al recargar los datos la ficha se vuelve a montar.
  const [mensaje, mostrar] = useMensaje();
  const valido = esId(id);
  const carga = useCarga(
    (signal) => (valido
      ? Promise.all([obtenerPersona(id, { signal }), listarDocumentos({ person_id: id }, { signal }), valoresCatalogo('Tipos de documento', { signal })])
        .then(([persona, documentos, tipos]) => ({ persona, documentos, tipos }))
      : Promise.resolve(null)),
    [id, valido]
  );

  if (!valido) return <SinResultados titulo="Persona no encontrada" texto="El enlace no es válido." />;
  if (carga.estado === 'cargando') return <><Cargando texto="Cargando ficha…" />{mensaje}</>;
  if (carga.estado === 'error') {
    if (carga.error.status === 404 || carga.error.status === 403) {
      return (
        <SinResultados titulo="Persona no encontrada" texto="La persona no existe o no pertenece a su asociación.">
          <Link to={RUTA.personas} className="g-boton">Ver personas</Link>
        </SinResultados>
      );
    }
    return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  }
  return <><Ficha key={carga.datos.persona.id} {...carga.datos} recargar={carga.reintentar} mostrar={mostrar} />{mensaje}</>;
}
