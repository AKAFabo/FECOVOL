import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import HtmlSeguro from '../../components/HtmlSeguro.jsx';
import useCarga from '../../hooks/useCarga.js';
import { esIdValido, obtenerNoticia } from '../../services/noticias.js';
import { fechaLarga } from '../../utils/formato.js';
import './NoticiaDetallePublica.css';

function Contenedor({ children }) {
  return (
    <section className="bloque noticia-detalle">
      <div className="contenedor">{children}</div>
    </section>
  );
}

function NoEncontrada() {
  return (
    <Contenedor>
      <SinResultados titulo="Noticia no encontrada" texto="La noticia que busca no existe o ya no está publicada.">
        <Link to="/noticias" className="boton boton--primario boton--chico">Ver noticias</Link>
      </SinResultados>
    </Contenedor>
  );
}

export default function NoticiaDetallePublica() {
  const { id } = useParams();
  const idValido = esIdValido(id);

  const carga = useCarga(
    (signal) => (idValido ? obtenerNoticia(id, { signal }) : Promise.resolve(null)),
    [id, idValido]
  );

  if (!idValido) return <NoEncontrada />;
  if (carga.estado === 'error' && carga.error.status === 404) return <NoEncontrada />;
  if (carga.estado === 'cargando') return <Contenedor><Cargando texto="Cargando noticia…" /></Contenedor>;
  if (carga.estado === 'error') {
    return <Contenedor><ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} /></Contenedor>;
  }

  const n = carga.datos;
  const fecha = fechaLarga(n.published_at);

  return (
    <article className="bloque noticia-detalle">
      <div className="contenedor noticia-detalle__columna">
        <nav aria-label="Ruta de navegación" className="noticia-detalle__migas">
          <Link to="/noticias">Noticias</Link>
          {n.competition && (
            <>
              <span aria-hidden="true"> / </span>
              <Link to={`/competencias/${n.competition.id}`}>{n.competition.name}</Link>
            </>
          )}
        </nav>

        <header className="noticia-detalle__encabezado">
          <h1 className="noticia-detalle__titulo">{n.title}</h1>
          {n.summary && <p className="noticia-detalle__resumen">{n.summary}</p>}
          {fecha && (
            <p className="noticia-detalle__fecha">
              Publicada el <time dateTime={n.published_at}>{fecha}</time>
            </p>
          )}
        </header>

        {n.cover && (
          <figure className="noticia-detalle__portada">
            <img src={n.cover.url} alt={n.cover.alt} referrerPolicy="no-referrer" />
          </figure>
        )}

        {n.content_html ? (
          <HtmlSeguro html={n.content_html} className="noticia-detalle__cuerpo" />
        ) : (
          <p className="noticia-detalle__vacio">Esta noticia no tiene texto adicional.</p>
        )}

        <footer className="noticia-detalle__pie">
          <Link to="/noticias" className="enlace-flecha">Ver todas las noticias</Link>
        </footer>
      </div>
    </article>
  );
}
