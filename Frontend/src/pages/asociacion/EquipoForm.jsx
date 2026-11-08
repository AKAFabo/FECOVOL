// Registrar o editar un equipo (Figma 04 · Editar equipo). Categoría, rama y modalidad se eligen
// al registrar: después no cambian, porque definen en qué competencias puede jugar el equipo.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, OpcionesCatalogo, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { actualizarEquipo, crearEquipo, esId, obtenerEquipo, valoresCatalogo } from '../../services/representante.js';
import { RUTA, useAsociacion } from './contexto.js';

const COLOR = /^#[0-9a-f]{6}$/i;

function inicial(equipo) {
  return {
    name: equipo?.name || '',
    short_name: equipo?.short_name || '',
    category_code: equipo?.categoria?.code || '',
    branch_code: equipo?.rama?.code || '',
    modality_code: equipo?.modalidad?.code || '',
    home_venue: equipo?.home_venue || '',
    primary_color: COLOR.test(equipo?.primary_color || '') ? equipo.primary_color : '#0e3b6b',
    secondary_color: COLOR.test(equipo?.secondary_color || '') ? equipo.secondary_color : '#ffffff',
    status: equipo?.status || 'ACTIVO'
  };
}

function validar(f, nuevo) {
  const e = {};
  if (f.name.trim().length < 3) e.name = 'Escriba el nombre del equipo (al menos 3 letras).';
  if (f.name.length > 120) e.name = 'El nombre es demasiado largo.';
  if (nuevo) {
    if (!f.category_code) e.category_code = 'Elija la categoría.';
    if (!f.branch_code) e.branch_code = 'Elija la rama.';
    if (!f.modality_code) e.modality_code = 'Elija la modalidad.';
  }
  return e;
}

function Formulario({ equipo, catalogos, asociacion }) {
  const navigate = useNavigate();
  const nuevo = !equipo;
  const [f, setF] = useState(() => inicial(equipo));
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    const encontrados = validar(f, nuevo);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;

    setEstado({ guardando: true, error: null });
    const comunes = {
      name: f.name.trim(),
      short_name: f.short_name.trim() || null,
      home_venue: f.home_venue.trim() || null,
      primary_color: f.primary_color,
      secondary_color: f.secondary_color
    };
    try {
      const guardado = nuevo
        ? await crearEquipo({ ...comunes, category_code: f.category_code, branch_code: f.branch_code, modality_code: f.modality_code })
        : await actualizarEquipo(equipo.id, { ...comunes, status: f.status });
      navigate(RUTA.equipo(guardado.id), { replace: true, state: { mensaje: nuevo ? 'Equipo registrado.' : 'Cambios guardados.' } });
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  const volver = nuevo ? RUTA.equipos : RUTA.equipo(equipo.id);

  return (
    <form className="g-pagina" onSubmit={guardar} noValidate>
      <Encabezado
        titulo={nuevo ? 'Registrar equipo' : `Editar ${equipo.name}`}
        bajada={asociacion.name}
        acciones={(
          <>
            <Link to={volver} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={estado.guardando}>
              {estado.guardando ? 'Guardando…' : nuevo ? 'Registrar equipo' : 'Guardar cambios'}
            </button>
          </>
        )}
      />

      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Datos del equipo">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Nombre del equipo" obligatorio error={errores.name} ancho>
                {(a) => <input {...a} className="g-control" value={f.name} onChange={cambiar('name')} maxLength={120} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Nombre corto" ayuda="Se usa en tablas y calendarios.">
                {(a) => <input {...a} className="g-control" value={f.short_name} onChange={cambiar('short_name')} maxLength={40} autoComplete="off" />}
              </Campo>
              <Campo etiqueta="Gimnasio sede">
                {(a) => (
                  <>
                    <input {...a} className="g-control" value={f.home_venue} onChange={cambiar('home_venue')} maxLength={120} list="sedes" autoComplete="off" />
                    <datalist id="sedes">{catalogos.sedes.map((s) => <option key={s.code} value={s.value} />)}</datalist>
                  </>
                )}
              </Campo>
              {!nuevo && (
                <Campo etiqueta="Estado" ayuda="Un equipo inactivo no aparece para inscripciones.">
                  {(a) => (
                    <select {...a} className="g-control" value={f.status} onChange={cambiar('status')}>
                      <option value="ACTIVO">Activo</option>
                      <option value="INACTIVO">Inactivo</option>
                    </select>
                  )}
                </Campo>
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Categoría y modalidad" nota={nuevo ? 'No se pueden cambiar después de registrar el equipo.' : 'Definidas al registrar el equipo.'}>
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Categoría" obligatorio={nuevo} error={errores.category_code}>
                {(a) => (
                  <select {...a} className="g-control" value={f.category_code} onChange={cambiar('category_code')} disabled={!nuevo}>
                    <OpcionesCatalogo valores={catalogos.categorias} vacia="Elija…" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Rama" obligatorio={nuevo} error={errores.branch_code}>
                {(a) => (
                  <select {...a} className="g-control" value={f.branch_code} onChange={cambiar('branch_code')} disabled={!nuevo}>
                    <OpcionesCatalogo valores={catalogos.ramas} vacia="Elija…" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Modalidad" obligatorio={nuevo} error={errores.modality_code}>
                {(a) => (
                  <select {...a} className="g-control" value={f.modality_code} onChange={cambiar('modality_code')} disabled={!nuevo}>
                    <OpcionesCatalogo valores={catalogos.modalidades} vacia="Elija…" />
                  </select>
                )}
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Colores">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Principal">
                {(a) => <input {...a} type="color" className="g-control" value={f.primary_color} onChange={cambiar('primary_color')} />}
              </Campo>
              <Campo etiqueta="Secundario">
                {(a) => <input {...a} type="color" className="g-control" value={f.secondary_color} onChange={cambiar('secondary_color')} />}
              </Campo>
            </div>
          </Tarjeta>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Después de guardar</span>
            Arme la nómina desde la ficha del equipo: agregue jugadores y cuerpo técnico que ya estén registrados en Personas.
          </p>
        </div>
      </div>
    </form>
  );
}

export default function EquipoForm() {
  const { id } = useParams();
  const nuevo = !id;
  const { asociacion } = useAsociacion(nuevo
    ? [{ texto: 'Mis equipos', to: RUTA.equipos }, { texto: 'Registrar equipo' }]
    : [{ texto: 'Mis equipos', to: RUTA.equipos }, { texto: 'Editar equipo' }]);

  const carga = useCarga(
    (signal) => Promise.all([
      nuevo ? Promise.resolve(null) : obtenerEquipo(id, { signal }),
      valoresCatalogo('Categorías', { signal }),
      valoresCatalogo('Ramas', { signal }),
      valoresCatalogo('Modalidades', { signal }),
      valoresCatalogo('Sedes', { signal })
    ]).then(([equipo, categorias, ramas, modalidades, sedes]) => ({ equipo, catalogos: { categorias, ramas, modalidades, sedes } })),
    [id]
  );

  if (!nuevo && !esId(id)) return <SinResultados titulo="Equipo no encontrado" texto="El enlace no es válido." />;
  if (carga.estado === 'cargando') return <Cargando texto="Cargando…" />;
  if (carga.estado === 'error') {
    if (carga.error.status === 404 || carga.error.status === 403) {
      return <SinResultados titulo="Equipo no encontrado" texto="El equipo no existe o no pertenece a su asociación." />;
    }
    return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  }
  return <Formulario key={id || 'nuevo'} equipo={carga.datos.equipo} catalogos={carga.datos.catalogos} asociacion={asociacion} />;
}
