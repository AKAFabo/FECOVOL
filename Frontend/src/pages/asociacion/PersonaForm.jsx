// Agregar persona (Figma 04 · Agregar persona): registra a un atleta o integrante del cuerpo
// técnico en el padrón y, si se elige, lo agrega de una vez a la nómina de un equipo.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, OpcionesCatalogo, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  agregarIntegrante, correoValido, crearPersona, listarEquipos, normalizarIdentificacion, revisarIdentificacion, valoresCatalogo,
  PROVINCIAS, TIPOS_IDENTIFICACION
} from '../../services/representante.js';
import { RUTA, useAsociacion } from './contexto.js';

const HOY = () => new Date().toISOString().slice(0, 10);

const VACIO = {
  document_type_code: 'CED', document_number: '', first_name: '', last_name: '', birth_date: '', sex: '',
  email: '', phone: '', province: '', rol: 'JUGADOR', equipo: '', position_code: '', jersey_number: '', technical_role: ''
};

function validar(f) {
  const e = {};
  const id = revisarIdentificacion(f.document_type_code, f.document_number);
  if (id) e.document_number = id;
  if (!f.first_name.trim()) e.first_name = 'Escriba el nombre.';
  if (!f.last_name.trim()) e.last_name = 'Escriba los apellidos.';
  if (!f.birth_date) e.birth_date = 'Indique la fecha de nacimiento.';
  else if (f.birth_date > HOY() || f.birth_date < '1920-01-01') e.birth_date = 'La fecha de nacimiento no es válida.';
  if (!correoValido(f.email.trim())) e.email = 'El correo no es válido.';
  if (f.phone && !/^[0-9 +()-]{8,20}$/.test(f.phone.trim())) e.phone = 'El teléfono no es válido.';
  if (f.equipo && f.rol === 'JUGADOR' && f.jersey_number !== '') {
    const n = Number(f.jersey_number);
    if (!Number.isInteger(n) || n < 1 || n > 99) e.jersey_number = 'El número va de 1 a 99.';
  }
  if (f.equipo && f.rol === 'TECNICO' && !f.technical_role.trim()) e.technical_role = 'Indique la función (por ejemplo, Entrenador).';
  return e;
}

function Formulario({ asociacion, equipos, tipos, posiciones }) {
  const navigate = useNavigate();
  const [f, setF] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const tiposId = tipos.filter((t) => TIPOS_IDENTIFICACION.includes(t.code));

  async function guardar(e) {
    e.preventDefault();
    const encontrados = validar(f);
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
        phone: f.phone.trim() || null,
        province: f.province || null,
        roles: [f.rol]
      });
    } catch (err) {
      setEstado({ guardando: false, error: err.status === 409 ? 'Ya hay una persona registrada con esa identificación.' : err.message });
      return;
    }

    // La persona ya quedó registrada; si falla la nómina, se avisa en su ficha.
    let mensaje = 'Persona registrada.';
    if (f.equipo) {
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
        titulo="Agregar persona"
        bajada={`Registra a un atleta o integrante del cuerpo técnico de ${asociacion.name} en el padrón federativo.`}
        acciones={(
          <>
            <Link to={RUTA.personas} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar persona'}</button>
          </>
        )}
      />
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-columna g-formulario-pagina">
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
                {(a) => <input {...a} type="date" className="g-control" value={f.birth_date} max={HOY()} min="1920-01-01" onChange={cambiar('birth_date')} />}
              </Campo>
              <Campo etiqueta="Sexo">
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
                {(a) => <input {...a} type="tel" className="g-control" value={f.phone} onChange={cambiar('phone')} maxLength={20} autoComplete="off" />}
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
              <Campo etiqueta="Participa como" obligatorio>
                {(a) => (
                  <select {...a} className="g-control" value={f.rol} onChange={cambiar('rol')}>
                    <option value="JUGADOR">Atleta</option>
                    <option value="TECNICO">Cuerpo técnico</option>
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Equipo" ayuda="Opcional: también puede agregarla después desde el equipo.">
                {(a) => (
                  <select {...a} className="g-control" value={f.equipo} onChange={cambiar('equipo')}>
                    <option value="">Sin equipo por ahora</option>
                    {equipos.filter((e) => e.status === 'ACTIVO').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                )}
              </Campo>
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
  const { asociacion } = useAsociacion([{ texto: 'Personas', to: RUTA.personas }, { texto: 'Agregar persona' }]);
  const carga = useCarga(
    (signal) => Promise.all([listarEquipos({ signal }), valoresCatalogo('Tipos de documento', { signal }), valoresCatalogo('Posiciones', { signal })])
      .then(([equipos, tipos, posiciones]) => ({ equipos, tipos, posiciones })),
    []
  );
  if (carga.estado === 'cargando') return <Cargando texto="Cargando…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  return <Formulario asociacion={asociacion} {...carga.datos} />;
}
