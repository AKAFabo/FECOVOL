import { Link, useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { CanchaPlano } from '../../components/Ilustraciones.jsx';
import useCarga from '../../hooks/useCarga.js';
import { listarNoticias, PAGINA_MAXIMA } from '../../services/noticias.js';
import { fechaLarga } from '../../utils/formato.js';
import './NoticiasPublicas.css';

function leerPagina(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= PAGINA_MAXIMA ? n : 1;
}

function Portada({ noticia }) {
  if (noticia.cover) {
    return <img src={noticia.cover.url} alt={noticia.cover.alt} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return <CanchaPlano />;
}

function TarjetaNoticia({ noticia, principal = false }) {
  const fecha = fechaLarga(noticia.published_at);
  return (
    <li className={`tarjeta-noticia${principal ? ' tarjeta-noticia--principal' : ''}`}>
      <div className="tarjeta-noticia__imagen" aria-hidden={noticia.cover ? undefined : 'true'}>
        <Portada noticia={noticia} />
      </div>
      <div className="tarjeta-noticia__cuerpo">
        <p className="tarjeta-noticia__meta">
          {noticia.competition && <span className="antetitulo">{noticia.competition.name}</span>}
          {fecha && <time dateTime={noticia.published_at}>{fecha}</time>}
        </p>
        <h2 className="tarjeta-noticia__titulo">
          {/* El enlace cubre toda la tarjeta (ver ::after en el CSS). */}
          <Link to={`/noticias/${noticia.id}`} className="tarjeta-noticia__enlace">{noticia.title}</Link>
        </h2>
        {noticia.summary && <p className="tarjeta-noticia__resumen">{noticia.summary}</p>}
      </div>
    </li>
  );
}

function Paginacion({ pagina, totalPaginas, onCambiar }) {
  if (totalPaginas <= 1) return null;
  return (
    <nav className="paginacion" aria-label="Páginas de noticias">
      <button
        type="button"
        className="boton boton--chico paginacion__boton"
        disabled={pagina <= 1}
        onClick={() => onCambiar(pagina - 1)}
      >
        ← Más recientes
      </button>
      <span className="paginacion__estado" aria-live="polite">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        className="boton boton--chico paginacion__boton"
        disabled={pagina >= totalPaginas}
        onClick={() => onCambiar(pagina + 1)}
      >
        Anteriores →
      </button>
    </nav>
  );
}

export default function NoticiasPublicas() {
  const [params, setParams] = useSearchParams();
  const pagina = leerPagina(params.get('pagina'));

  const { estado, datos, error, reintentar } = useCarga((signal) => listarNoticias(pagina, { signal }), [pagina]);

  const items = datos?.items || [];
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.page_size)) : 1;

  // En la primera página, la noticia destacada más reciente (o la más reciente) va en grande.
  const indicePrincipal = pagina === 1 && items.length ? Math.max(0, items.findIndex((n) => n.featured)) : -1;
  const principal = indicePrincipal >= 0 ? items[indicePrincipal] : null;
  const resto = items.filter((_, i) => i !== indicePrincipal);

  function cambiarPagina(n) {
    const siguiente = new URLSearchParams(params);
    if (n <= 1) siguiente.delete('pagina');
    else siguiente.set('pagina', String(n));
    setParams(siguiente);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <CabeceraSeccion
        antetitulo="Noticias"
        titulo="Noticias y comunicados"
        bajada="Lo más reciente de las competencias, el arbitraje y la vida de la Federación."
      />

      <section className="bloque noticias-publicas" aria-labelledby="titulo-noticias">
        <div className="contenedor">
          <h2 id="titulo-noticias" className="visualmente-oculto">Listado de noticias</h2>

          {estado === 'cargando' && <Cargando texto="Cargando noticias…" />}
          {estado === 'error' && <ErrorCarga mensaje={error.message} onReintentar={reintentar} />}
          {estado === 'listo' && items.length === 0 && (
            <SinResultados
              titulo={pagina > 1 ? 'No hay más noticias' : 'Todavía no hay noticias publicadas'}
              texto={pagina > 1 ? undefined : 'Las noticias de la Federación aparecerán aquí en cuanto se publiquen.'}
            >
              {pagina > 1 && (
                <button type="button" className="boton boton--primario boton--chico" onClick={() => cambiarPagina(1)}>
                  Ir a las más recientes
                </button>
              )}
            </SinResultados>
          )}
          {estado === 'listo' && items.length > 0 && (
            <>
              {principal && (
                <ul className="lista-noticias lista-noticias--principal">
                  <TarjetaNoticia noticia={principal} principal />
                </ul>
              )}
              {resto.length > 0 && (
                <ul className="lista-noticias">
                  {resto.map((n) => (
                    <TarjetaNoticia key={n.id} noticia={n} />
                  ))}
                </ul>
              )}
              <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={cambiarPagina} />
            </>
          )}
        </div>
      </section>
    </>
  );
}
