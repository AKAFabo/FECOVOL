import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CanchaPerspectiva, CanchaPlano, Balon } from '../../components/Ilustraciones.jsx';
import {
  destacado,
  partidos,
  noticiaPrincipal,
  noticias,
  cifras,
  competencias,
  selecciones
} from '../../data/portada.js';
import './Inicio.css';

function Equipo({ equipo, ganador, jugado }) {
  return (
    <div className="partido__equipo">
      <span className="partido__escudo" aria-hidden="true" />
      <span className={`partido__nombre${ganador ? ' partido__nombre--ganador' : ''}`}>{equipo.nombre}</span>
      <span className={`partido__marcador${ganador ? ' partido__marcador--ganador' : ''}`}>
        {jugado ? equipo.marcador : '—'}
      </span>
    </div>
  );
}

function TarjetaPartido({ partido }) {
  const jugado = partido.local.marcador !== undefined;
  const ganaLocal = jugado && partido.local.marcador > partido.visita.marcador;
  const ganaVisita = jugado && partido.visita.marcador > partido.local.marcador;

  return (
    <li className="partido">
      <div className="partido__cabecera">
        <span className={`pastilla pastilla--${partido.estado.tono}`}>{partido.estado.texto}</span>
        <span className="partido__detalle">{partido.detalle}</span>
      </div>
      <Equipo equipo={partido.local} ganador={ganaLocal} jugado={jugado} />
      <Equipo equipo={partido.visita} ganador={ganaVisita} jugado={jugado} />
      {jugado && (
        <p className="visualmente-oculto">
          Resultado: {partido.local.nombre} {partido.local.marcador}, {partido.visita.nombre} {partido.visita.marcador}.
        </p>
      )}
    </li>
  );
}

function Suscripcion() {
  const [enviado, setEnviado] = useState(false);

  return (
    <section className="suscripcion" aria-labelledby="titulo-suscripcion">
      <div className="contenedor suscripcion__interior">
        <div>
          <h2 id="titulo-suscripcion" className="suscripcion__titulo">Recibí los resultados de cada jornada</h2>
          <p className="suscripcion__texto">Un correo semanal con marcadores, posiciones y convocatorias.</p>
        </div>
        {enviado ? (
          <p className="suscripcion__aviso" role="status">
            Gracias. La suscripción por correo todavía no está habilitada; te avisaremos cuando lo esté.
          </p>
        ) : (
          <form
            className="suscripcion__formulario"
            onSubmit={(e) => {
              e.preventDefault();
              setEnviado(true);
            }}
          >
            <label htmlFor="correo-suscripcion" className="visualmente-oculto">Correo electrónico</label>
            <input id="correo-suscripcion" type="email" required placeholder="nombre@correo.com" autoComplete="email" />
            <button type="submit" className="boton suscripcion__boton">Suscribirme</button>
          </form>
        )}
      </div>
    </section>
  );
}

export default function Inicio() {
  return (
    <>
      {/* Portada */}
      <section className="portada">
        <div className="contenedor portada__interior">
          <div className="portada__texto">
            <span className="portada__etiqueta">{destacado}</span>
            <h1 className="portada__titulo">
              <span className="portada__linea">El voleibol nacional,</span> en un solo lugar
            </h1>
            <p className="portada__bajada">
              Calendarios, resultados, tablas de posiciones y noticias de todas las competencias organizadas por la
              Federación Costarricense de Voleibol. Sin cuenta y desde cualquier dispositivo.
            </p>
            <div className="portada__acciones">
              <Link to="/competencias" className="boton boton--claro">Ver últimos resultados</Link>
              <Link to="/competencias" className="boton boton--contorno-claro">Calendario completo</Link>
            </div>
          </div>
          <div className="portada__imagen">
            <CanchaPerspectiva />
          </div>
        </div>
      </section>

      {/* Resultados y próximos partidos */}
      <section className="bloque" aria-labelledby="titulo-partidos">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <h2 id="titulo-partidos" className="seccion-titulo seccion-titulo--mediano">
              <span className="solo-escritorio">Resultados y próximos partidos</span>
              <span className="solo-movil">Últimos resultados</span>
            </h2>
            <Link to="/competencias" className="enlace-flecha">
              <span className="solo-escritorio">Ver calendario completo</span>
              <span className="solo-movil">Ver todo</span>
            </Link>
          </div>
          <ul className="partidos">
            {partidos.map((p) => (
              <TarjetaPartido key={p.id} partido={p} />
            ))}
          </ul>
        </div>
      </section>

      {/* Noticias */}
      <section className="bloque bloque--arena" aria-labelledby="titulo-noticias">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <h2 id="titulo-noticias" className="seccion-titulo">Noticias</h2>
            <Link to="/noticias" className="enlace-flecha">
              <span className="solo-escritorio">Ver todas las noticias</span>
              <span className="solo-movil">Ver todas</span>
            </Link>
          </div>

          <div className="noticias">
            <article className="noticia-principal">
              <Link to="/noticias" className="noticia-principal__imagen" tabIndex={-1} aria-hidden="true">
                <CanchaPlano />
              </Link>
              <p className="noticia-principal__meta">
                <span className="antetitulo">{noticiaPrincipal.categoria}</span>
                <time>{noticiaPrincipal.fecha}</time>
              </p>
              <h3 className="noticia-principal__titulo">
                <Link to="/noticias">{noticiaPrincipal.titulo}</Link>
              </h3>
              <p className="noticia-principal__resumen">{noticiaPrincipal.resumen}</p>
            </article>

            <ul className="noticias__lista">
              {noticias.map((n) => (
                <li key={n.id} className="noticia">
                  <span className="noticia__imagen" style={{ backgroundColor: n.color }} aria-hidden="true" />
                  <div className="noticia__texto">
                    <span className="antetitulo">{n.categoria}</span>
                    <h3 className="noticia__titulo">
                      <Link to="/noticias">{n.titulo}</Link>
                    </h3>
                    <time className="noticia__fecha">{n.fecha}</time>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* La Federación en cifras */}
      <section className="federacion" aria-labelledby="titulo-federacion">
        <div className="contenedor federacion__interior">
          <div className="federacion__texto">
            <span className="antetitulo antetitulo--claro">La Federación</span>
            <h2 id="titulo-federacion" className="federacion__titulo">El voleibol en Costa Rica</h2>
            <p>
              FECOVOL es el organismo rector del voleibol en el país. Organiza las competencias nacionales de sala y de
              playa, federa a atletas, cuerpo técnico y árbitros, y dirige las selecciones nacionales.
            </p>
            <p>
              El voleibol se juega entre dos equipos de seis personas separados por una red. Gana el set quien llega
              primero a 25 puntos con dos de ventaja, y el partido quien gana tres sets.
            </p>
            <Link to="/federacion" className="enlace-flecha enlace-flecha--claro">Conocer la Federación</Link>
          </div>
          <dl className="cifras">
            {cifras.map((c) => (
              <div key={c.etiqueta} className="cifra">
                <dt className="cifra__etiqueta">{c.etiqueta}</dt>
                <dd className="cifra__valor">{c.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Competencias en curso */}
      <section className="bloque" aria-labelledby="titulo-competencias">
        <div className="contenedor">
          <div className="seccion-encabezado">
            <h2 id="titulo-competencias" className="seccion-titulo">Competencias en curso</h2>
            <Link to="/competencias" className="enlace-flecha">
              <span className="solo-escritorio">Todas las competencias</span>
              <span className="solo-movil">Ver todas</span>
            </Link>
          </div>
          <ul className="competencias">
            {competencias.map((c) => (
              <li key={c.id} className="competencia">
                <div className="competencia__imagen" style={{ backgroundColor: c.color }} aria-hidden="true">
                  <CanchaPlano />
                </div>
                <div className="competencia__cuerpo">
                  <span className={`pastilla pastilla--${c.estado.tono}`}>{c.estado.texto}</span>
                  <h3 className="competencia__nombre">{c.nombre}</h3>
                  <p className="competencia__detalle">{c.detalle}</p>
                  <Link to="/competencias" className="enlace-flecha competencia__enlace">{c.enlace}</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Selecciones nacionales */}
      <section className="bloque bloque--arena" aria-labelledby="titulo-selecciones">
        <div className="contenedor">
          <h2 id="titulo-selecciones" className="seccion-titulo">Selecciones nacionales</h2>
          <ul className="selecciones">
            {selecciones.map((s) => (
              <li key={s.id} className="seleccion">
                <div className="seleccion__imagen" style={{ backgroundColor: s.color }} aria-hidden="true">
                  <Balon />
                </div>
                <div className="seleccion__cuerpo">
                  <span className="antetitulo">{s.rama}</span>
                  <h3 className="seleccion__nombre">{s.nombre}</h3>
                  <p className="seleccion__compromiso">{s.compromiso}</p>
                  <Link to="/selecciones" className="enlace-flecha">Ver convocatoria</Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Suscripcion />
    </>
  );
}
