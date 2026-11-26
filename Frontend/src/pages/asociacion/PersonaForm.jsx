// Agregar persona (Figma 04 · Agregar persona): registra a un atleta o integrante del cuerpo
// técnico en el padrón y, si se elige, lo agrega de una vez a la nómina de un equipo.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, OpcionesCatalogo, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  agregarIntegrante, correoValido, crearPersona, listarEquipos, normalizarIdentificacion, revisarIdentificacion, valoresCatalogo,
  PROVINCIAS, TIPOS_IDENTIFICACION
} from '../../services/representante.js';
import { listarAsociaciones } from '../../services/administracion.js';
import { useAsociacion, useEsFecovol, useRutas } from './contexto.js';
import { errorFechaNacimiento, fechaNacimientoMaxima, FECHA_NACIMIENTO_MINIMA } from '../../utils/fechaNacimiento.js';
import EntradaTelefono from '../../components/EntradaTelefono.jsx';
import { normalizarTelefono } from '../../utils/telefono.js';
import { motivoNoElegible } from '../../utils/elegibilidadSeleccion.js';


const VACIO = {
  document_type_code: 'CED', document_number: '', first_name: '', last_name: '', birth_date: '', sex: '',
  email: '', phone: '', province: '', rol: 'JUGADOR', equipo: '', position_code: '', jersey_number: '', technical_role: '',
  asociacion: ''
};

function validar(f, fecovol) {
  const e = {};
  const id = revisarIdentificacion(f.document_type_code, f.document_number);
  if (id) e.document_number = id;
  if (!f.first_name.trim()) e.first_name = 'Escriba el nombre.';
  if (!f.last_name.trim()) e.last_name = 'Escriba los apellidos.';
  if (!f.birth_date) e.birth_date = 'Indique la fecha de nacimiento.';
  else if (errorFechaNacimiento(f.birth_date)) e.birth_date = errorFechaNacimiento(f.birth_date);
  if (f.rol === 'JUGADOR' && !f.sex) e.sex = 'Indique el sexo: define en qué rama puede competir.';
  if (!correoValido(f.email.trim())) e.email = 'El correo no es válido.';
  if (normalizarTelefono(f.phone).error) e.phone = normalizarTelefono(f.phone).error;
  if (f.equipo && f.rol === 'JUGADOR' && f.jersey_number !== '') {
    const n = Number(f.jersey_number);
    if (!Number.isInteger(n) || n < 1 || n > 99) e.jersey_number = 'El número va de 1 a 99.';
  }
  if (f.equipo && f.rol === 'TECNICO' && !f.technical_role.trim()) e.technical_role = 'Indique la función (por ejemplo, Entrenador).';
  // En FECOVOL se elige la asociación; los árbitros pueden no pertenecer a ninguna.
  if (fecovol && f.rol !== 'ARBITRO' && !f.asociacion) e.asociacion = 'Elija la asociación.';
  return e;
}

function Formulario({ asociacion, equipos, tipos, posiciones, asociaciones }) {
  const navigate = useNavigate();
  const RUTA = useRutas();
  const fecovol = useEsFecovol();
  const [params] = useSearchParams();
  const [f, setF] = useState(() => ({ ...VACIO, asociacion: fecovol ? (params.get('asociacion') || '') : '' }));
  // En FECOVOL se ven los equipos de la asociación elegida; el representante solo recibe los suyos.
  const equiposVisibles = (fecovol ? equipos.filter((e) => e.association_id === f.asociacion) : equipos).filter((e) => e.status === 'ACTIVO');
  // Un atleta solo se agrega a un equipo de su categoría (edad) y rama; mismas reglas que el backend.
  const hoyCR = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  const motivoEquipo = (equipo) => (f.rol === 'JUGADOR' && equipo && f.birth_date
    ? motivoNoElegible({ birth_date: f.birth_date, sex: f.sex }, { rama: equipo.rama, categoria: equipo.categoria, fechaReferencia: hoyCR })
    : null);
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const tiposId = tipos.filter((t) => TIPOS_IDENTIFICACION.includes(t.code));

  async function guardar(e) {
    e.preventDefault();
    const encontrados = validar(f, fecovol);
    const motivo = f.equipo ? motivoEquipo(equiposVisibles.find((x) => x.id === f.equipo)) : null;
    if (motivo) encontrados.equipo = motivo.replace('de esta selección', 'de este equipo');
    setErrores(encontrados);
    if (Object.keys(encontrados).length) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setEstado({ guardando: true, error: null });

    let persona;
    try {
      persona = await crearPersona({
        document_type_code: f.document_type_code,
        document_number: normalizarIdentificacion(f.document_type_code, f.document_number),
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        birth_date: f.birth_date,
        sex: f.sex || null,
        email: f.email.trim() || null,
        phone: normalizarTelefono(f.phone).valor,
        province: f.province || null,
        roles: [f.rol],
        ...(fecovol ? { association_id: f.asociacion || null } : {})
      });
    } catch (err) {
      setEstado({ guardando: false, error: err.status === 409 ? 'Ya hay una persona registrada con esa identificación.' : err.message });
      return;
    }

    // La persona ya quedó registrada; si falla la nómina, se avisa en su ficha.
    let mensaje = 'Persona registrada.';
    if (f.equipo && f.rol !== 'ARBITRO') {
      try {
        await agregarIntegrante(f.equipo, f.rol === 'JUGADOR'
          ? { person_id: persona.id, member_type: 'JUGADOR', position_code: f.position_code || null, jersey_number: f.jersey_number === '' ? null : Number(f.jersey_number) }
          : { person_id: persona.id, member_type: 'TECNICO', technical_role: f.technical_role.trim() });
        mensaje = 'Persona registrada y agregada a la nómina.';
      } catch (err) {
        mensaje = `Persona registrada, pero no se pudo agregar a la nómina: ${err.message}`;
      }
    }
    navigate(RUTA.persona(persona.id), { replace: true, state: { mensaje } });
  }

  return (
    <form className="g-pagina" onSubmit={guardar} noValidate>
      <Encabezado
        titulo={fecovol ? 'Registrar persona' : 'Agregar persona'}
        bajada={fecovol
          ? 'Toda persona que participe en competencias oficiales queda en el padrón federativo.'
          : `Registra a un atleta o integrante del cuerpo técnico de ${asociacion?.name} en el padrón federativo.`}
        acciones={(
          <>
            <Link to={RUTA.personas} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar persona'}</button>
          </>
        )}
      />
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-columna">
          <Tarjeta titulo="Identificación">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Tipo de identificación" obligatorio>
                {(a) => (
                  <select {...a} className="g-control" value={f.document_type_code} onChange={cambiar('document_type_code')}>
                    <OpcionesCatalogo valores={tiposId} />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Número" obligatorio error={errores.document_number} ayuda={f.document_type_code === 'CED' ? 'Con o sin guiones: 1-2345-6789 o 123456789.' : undefined}>
                {(a) => (
                  <input
                    {...a}
                    className="g-control"
                    value={f.document_number}
                    onChange={cambiar('document_number')}
                    onBlur={() => setF((x) => ({ ...x, document_number: normalizarIdentificacion(x.document_type_code, x.document_number) }))}
                    maxLength={20}
                    autoComplete="off"
                    inputMode={f.document_type_code === 'PAS' ? 'text' : 'numeric'}
                  />
                )}
              </Campo>
              <Campo etiqueta="Nombre" obligatorio error={errores.first_name}>
                {(a) => <input {...a} className="g-control" value={f.first_name} onChange={cambiar('first_name')} maxLength={80} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Apellidos" obligatorio error={errores.last_name}>
                {(a) => <input {...a} className="g-control" value={f.last_name} onChange={cambiar('last_name')} maxLength={100} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Fecha de nacimiento" obligatorio error={errores.birth_date}>
                {(a) => <input {...a} type="date" className="g-control" value={f.birth_date} max={fechaNacimientoMaxima()} min={FECHA_NACIMIENTO_MINIMA} onChange={cambiar('birth_date')} />}
              </Campo>
              <Campo etiqueta="Sexo" obligatorio={f.rol === 'JUGADOR'} error={errores.sex}>
                {(a) => (
                  <select {...a} className="g-control" value={f.sex} onChange={cambiar('sex')}>
                    <option value="">Sin indicar</option>
                    <option value="F">Femenino</option>
                    <option value="M">Masculino</option>
                    <option value="OTRO">Otro</option>
                  </select>
                )}
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Contacto">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Correo electrónico" error={errores.email}>
                {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Teléfono" error={errores.phone}>
                {(a) => <EntradaTelefono {...a} className="g-control" value={f.phone} onCambiar={(v) => setF((x) => ({ ...x, phone: v }))} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Provincia">
                {(a) => (
                  <select {...a} className="g-control" value={f.province} onChange={cambiar('province')}>
                    <option value="">Sin indicar</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Participación">
            <div className="g-tarjeta__cuerpo g-formulario">
              {fecovol && (
                <Campo etiqueta="Asociación" obligatorio={f.rol !== 'ARBITRO'} error={errores.asociacion} ayuda={f.rol === 'ARBITRO' ? 'Opcional para árbitros.' : undefined}>
                  {(a) => (
                    <select {...a} className="g-control" value={f.asociacion} onChange={(e) => setF((x) => ({ ...x, asociacion: e.target.value, equipo: '' }))}>
                      <option value="">{f.rol === 'ARBITRO' ? 'Sin asociación' : 'Elija…'}</option>
                      {asociaciones.map((as) => <option key={as.id} value={as.id}>{as.name}</option>)}
                    </select>
                  )}
                </Campo>
              )}
              <Campo etiqueta="Participa como" obligatorio>
                {(a) => (
                  <select {...a} className="g-control" value={f.rol} onChange={(e) => setF((x) => ({ ...x, rol: e.target.value, equipo: e.target.value === 'ARBITRO' ? '' : x.equipo }))}>
                    <option value="JUGADOR">Atleta</option>
                    <option value="TECNICO">Cuerpo técnico</option>
                    {fecovol && <option value="ARBITRO">Árbitro</option>}
                  </select>
                )}
              </Campo>
              {f.rol !== 'ARBITRO' && (
                <Campo etiqueta="Equipo" error={errores.equipo} ayuda="Opcional: también puede agregarla después desde el equipo. Para atletas solo se habilitan los equipos de su categoría y rama.">
                  {(a) => (
                    <select {...a} className="g-control" value={f.equipo} onChange={cambiar('equipo')} disabled={fecovol && !f.asociacion}>
                      <option value="">Sin equipo por ahora</option>
                      {equiposVisibles.map((e) => {
                        const motivo = motivoEquipo(e);
                        return <option key={e.id} value={e.id} disabled={Boolean(motivo)}>{e.name}{[e.categoria?.value, e.rama?.value].filter(Boolean).length ? ` · ${[e.categoria?.value, e.rama?.value].filter(Boolean).join(' ')}` : ''}{motivo ? ' (no corresponde)' : ''}</option>;
                      })}
                    </select>
                  )}
                </Campo>
              )}
              {f.equipo && f.rol === 'JUGADOR' && (
                <>
                  <Campo etiqueta="Posición de juego">
                    {(a) => (
                      <select {...a} className="g-control" value={f.position_code} onChange={cambiar('position_code')}>
                        <OpcionesCatalogo valores={posiciones} vacia="Sin indicar" />
                      </select>
                    )}
                  </Campo>
                  <Campo etiqueta="Número de camiseta" error={errores.jersey_number}>
                    {(a) => <input {...a} type="number" min={1} max={99} className="g-control" value={f.jersey_number} onChange={cambiar('jersey_number')} />}
                  </Campo>
                </>
              )}
              {f.equipo && f.rol === 'TECNICO' && (
                <Campo etiqueta="Función" obligatorio error={errores.technical_role}>
                  {(a) => <input {...a} className="g-control" value={f.technical_role} onChange={cambiar('technical_role')} maxLength={60} placeholder="Entrenador, asistente, fisioterapia…" />}
                </Campo>
              )}
            </div>
          </Tarjeta>
      </div>
    </form>
  );
}

export default function PersonaForm() {
  const RUTA = useRutas();
  const fecovol = useEsFecovol();
  const { asociacion } = useAsociacion([{ texto: 'Personas', to: RUTA.personas }, { texto: 'Agregar persona' }]);
  const carga = useCarga(
    (signal) => Promise.all([
      listarEquipos({ signal }),
      valoresCatalogo('Tipos de documento', { signal }),
      valoresCatalogo('Posiciones', { signal }),
      fecovol ? listarAsociaciones({}, { signal }) : Promise.resolve([])
    ]).then(([equipos, tipos, posiciones, asociaciones]) => ({ equipos, tipos, posiciones, asociaciones })),
    [fecovol]
  );
  if (carga.estado === 'cargando') return <Cargando texto="Cargando…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  return <Formulario asociacion={asociacion} {...carga.datos} />;
}
