import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import useCarga from '../../hooks/useCarga.js';
import { sigla } from '../../utils/sigla.js';
import { listarAsociaciones } from '../../services/asociaciones.js';
import { plural } from '../../utils/formato.js';
import './AsociacionesPublicas.css';

const LARGO_MAXIMO_BUSQUEDA = 80;

// Compara sin mayúsculas ni tildes: "san jose" encuentra "San José".
function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function ubicacion(a) {
  return [a.canton, a.province].filter(Boolean).join(', ');
}

function TarjetaAsociacion({ asociacion }) {
  const equipos = asociacion.team_count;
  return (
    <li className="tarjeta-asociacion">
      <span className="tarjeta-asociacion__sigla" aria-hidden="true">
        {sigla(asociacion.short_name, asociacion.name)}
      </span>
      <div className="tarjeta-asociacion__cuerpo">
        <h2 className="tarjeta-asociacion__nombre">
          {/* El enlace cubre toda la tarjeta (ver ::after en el CSS). */}
          <Link to={`/asociaciones/${asociacion.id}`} className="tarjeta-asociacion__enlace">
            {asociacion.name}
          </Link>
        </h2>
        {ubicacion(asociacion) && <p className="tarjeta-asociacion__lugar">{ubicacion(asociacion)}</p>}
        <p className="tarjeta-asociacion__equipos">
          {equipos === 0 ? 'Sin equipos activos' : plural(equipos, 'equipo', 'equipos')}
        </p>
      </div>
    </li>
  );
}

export default function AsociacionesPublicas() {
  const [params, setParams] = useSearchParams();
  const busqueda = (params.get('q') || '').slice(0, LARGO_MAXIMO_BUSQUEDA);

  const { estado, datos, error, reintentar } = useCarga((signal) => listarAsociaciones({ signal }), []);
  const asociaciones = datos || [];

  const provincias = useMemo(
    () => [...new Set(asociaciones.map((a) => a.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [asociaciones]
  );
  // Una provincia en la URL que no está en los datos se ignora.
  const pedida = params.get('provincia');
  const provincia = provincias.includes(pedida) ? pedida : null;

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return asociaciones.filter(
      (a) =>
        (!provincia || a.province === provincia) &&
        (!q || normalizar(`${a.name} ${a.short_name || ''} ${a.canton || ''}`).includes(q))
    );
  }, [asociaciones, provincia, busqueda]);

  function actualizar(clave, valor) {
    const siguiente = new URLSearchParams(params);
    if (valor) siguiente.set(clave, valor);
    else siguiente.delete(clave);
    setParams(siguiente, { replace: true });
  }

  return (
    <>
      <CabeceraSeccion
        antetitulo="Asociaciones"
        titulo="Asociaciones afiliadas"
        bajada="Las asociaciones deportivas afiliadas a FECOVOL y los equipos con los que participan en las competencias nacionales."
      />

      <section className="bloque asociaciones-publicas" aria-labelledby="titulo-asociaciones">
        <div className="contenedor">
          <h2 id="titulo-asociaciones" className="visualmente-oculto">Listado de asociaciones</h2>

          <div className="asociaciones-publicas__herramientas">
            <label className="buscador">
              <span className="visualmente-oculto">Buscar asociación por nombre o cantón</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={busqueda}
                maxLength={LARGO_MAXIMO_BUSQUEDA}
                placeholder="Buscar por nombre o cantón"
                autoComplete="off"
                onChange={(e) => actualizar('q', e.target.value)}
              />
            </label>

            {provincias.length > 1 && (
              <label className="selector-provincia">
                <span>Provincia</span>
                <select value={provincia || ''} onChange={(e) => actualizar('provincia', e.target.value)}>
                  <option value="">Todas</option>
                  {provincias.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {estado === 'cargando' && <Cargando texto="Cargando asociaciones…" />}
          {estado === 'error' && <ErrorCarga mensaje={error.message} onReintentar={reintentar} />}
          {estado === 'listo' && asociaciones.length === 0 && (
            <SinResultados
              titulo="Todavía no hay asociaciones publicadas"
              texto="Las asociaciones aparecen aquí cuando FECOVOL aprueba su afiliación."
            />
          )}
          {estado === 'listo' && asociaciones.length > 0 && (
            <>
              <p className="asociaciones-publicas__conteo" aria-live="polite">
                {visibles.length === asociaciones.length
                  ? plural(asociaciones.length, 'asociación afiliada', 'asociaciones afiliadas')
                  : `${visibles.length} de ${asociaciones.length} asociaciones`}
              </p>
              {visibles.length === 0 ? (
                <SinResultados titulo="Ninguna asociación coincide con la búsqueda">
                  <button
                    type="button"
                    className="boton boton--primario boton--chico"
                    onClick={() => setParams(new URLSearchParams(), { replace: true })}
                  >
                    Limpiar filtros
                  </button>
                </SinResultados>
              ) : (
                <ul className="lista-asociaciones">
                  {visibles.map((a) => (
                    <TarjetaAsociacion key={a.id} asociacion={a} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
