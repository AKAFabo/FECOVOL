import { Link, useParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import useCarga from '../../hooks/useCarga.js';
import { sigla } from '../../utils/sigla.js';
import { esIdValido, obtenerAsociacion } from '../../services/asociaciones.js';
import { estadoCompetencia } from '../../services/competencias.js';
import { fechaCorta, isoValida } from '../../utils/formato.js';
import './AsociacionDetallePublica.css';

function NoEncontrada() {
  return (
    <section className="bloque detalle-asociacion">
      <div className="contenedor">
        <SinResultados
          titulo="Asociación no encontrada"
          texto="La asociación que busca no existe o no está afiliada en este momento."
        >
          <Link to="/asociaciones" className="boton boton--primario boton--chico">Ver asociaciones</Link>
        </SinResultados>
      </div>
    </section>
  );
}

// Muestra el dominio sin "https://" ni la barra final.
function textoSitio(url) {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}

function TarjetaEquipo({ equipo }) {
  const detalle = [equipo.category, equipo.branch, equipo.modality].filter(Boolean).join(' · ');
  return (
    <li className="tarjeta-equipo">
      <div className="tarjeta-equipo__encabezado">
        <span className="tarjeta-equipo__sigla" aria-hidden="true">
          {sigla(equipo.short_name, equipo.name)}
        </span>
        <div>
          <h3 className="tarjeta-equipo__nombre">{equipo.name}</h3>
          {detalle && <p className="tarjeta-equipo__detalle">{detalle}</p>}
        </div>
      </div>

      {equipo.home_venue && (
        <p className="tarjeta-equipo__sede">
          <span className="tarjeta-equipo__etiqueta">Sede</span> {equipo.home_venue}
        </p>
      )}

      <div className="tarjeta-equipo__competencias">
        <span className="tarjeta-equipo__etiqueta">Competencias</span>
        {equipo.competitions.length === 0 ? (
          <p className="tarjeta-equipo__vacio">No está inscrito en competencias publicadas.</p>
        ) : (
          <ul>
            {equipo.competitions.map((c) => {
              const estado = estadoCompetencia(c.status);
              return (
                <li key={c.id}>
                  <Link to={`/competencias/${c.id}`} className="tarjeta-equipo__competencia">
                    {c.name}
                  </Link>
                  <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function AsociacionDetallePublica() {
  const { id } = useParams();
  const idValido = esIdValido(id);

  const carga = useCarga(
    (signal) => (idValido ? obtenerAsociacion(id, { signal }) : Promise.resolve(null)),
    [id, idValido]
  );

  if (!idValido) return <NoEncontrada />;
  if (carga.estado === 'error' && carga.error.status === 404) return <NoEncontrada />;

  if (carga.estado !== 'listo') {
    return (
      <section className="bloque detalle-asociacion">
        <div className="contenedor">
          {carga.estado === 'cargando' ? (
            <Cargando texto="Cargando asociación…" />
          ) : (
            <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />
          )}
        </div>
      </section>
    );
  }

  const a = carga.datos;
  const lugar = [a.canton, a.province].filter(Boolean).join(', ');
  const datos = [
    lugar && { termino: 'Ubicación', valor: lugar },
    a.home_venue && { termino: 'Gimnasio sede', valor: a.home_venue },
    a.affiliation_date && {
      termino: 'Afiliada desde',
      valor: <time dateTime={isoValida(a.affiliation_date)}>{fechaCorta(a.affiliation_date)}</time>
    },
    // La API ya filtra el sitio web; se vuelve a revisar aquí por si acaso.
    /^https?:\/\//i.test(a.website || '') && {
      termino: 'Sitio web',
      valor: (
        <a href={a.website} target="_blank" rel="noopener noreferrer nofollow">
          {textoSitio(a.website)}
          <span className="visualmente-oculto"> (se abre en otra pestaña)</span>
        </a>
      )
    }
  ].filter(Boolean);

  return (
    <>
      <CabeceraSeccion
        titulo={a.name}
        antes={
          <nav aria-label="Ruta de navegación" className="migas">
            <Link to="/asociaciones">Asociaciones</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{a.short_name || a.name}</span>
          </nav>
        }
      >
        <div className="detalle-asociacion__meta">
          <span className="pastilla pastilla--ok">Afiliada</span>
          {lugar && <span>{lugar}</span>}
        </div>
      </CabeceraSeccion>

      <section className="bloque detalle-asociacion">
        <div
          className={`contenedor detalle-asociacion__interior${datos.length === 0 ? ' detalle-asociacion__interior--sin-ficha' : ''}`}
        >
          {datos.length > 0 && (
            <aside className="ficha" aria-labelledby="titulo-ficha">
              <h2 id="titulo-ficha" className="ficha__titulo">Datos de la asociación</h2>
              <dl className="ficha__lista">
                {datos.map((d) => (
                  <div key={d.termino} className="ficha__fila">
                    <dt>{d.termino}</dt>
                    <dd>{d.valor}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}

          <div className="detalle-asociacion__equipos">
            <h2 className="seccion-titulo seccion-titulo--chico">
              Equipos <span className="detalle-asociacion__conteo">{a.teams.length}</span>
            </h2>
            {a.teams.length === 0 ? (
              <SinResultados titulo="Esta asociación no tiene equipos activos" />
            ) : (
              <ul className="lista-equipos">
                {a.teams.map((e) => (
                  <TarjetaEquipo key={e.id} equipo={e} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
