import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import Migas from '../../components/Migas.jsx';
import { contenidoFederacion } from '../../data/federacion.js';
import { REDES } from '../../data/redes.js';
import useCarga from '../../hooks/useCarga.js';
import { iniciales } from '../../utils/sigla.js';
import { obtenerCifras } from '../../services/federacion.js';
import './LaFederacion.css';

// Contenido institucional: solo lo confirmado en data/federacion.js. Lo vacío no se muestra.
const CONTENIDO = contenidoFederacion();

const formatoEntero = new Intl.NumberFormat('es-CR');

const CIFRAS = [
  { clave: 'associations', uno: 'asociación afiliada', varios: 'asociaciones afiliadas' },
  { clave: 'teams', uno: 'equipo activo', varios: 'equipos activos' },
  { clave: 'people', uno: 'persona registrada', varios: 'personas registradas' },
  { clave: 'referees', uno: 'árbitro activo', varios: 'árbitros activos' }
];

// Cifras desde la base de datos. Son un complemento del texto: si no cargan, la sección se muestra
// sin ellas en lugar de ocupar la página con un error.
function Cifras() {
  const { estado, datos } = useCarga((signal) => obtenerCifras({ signal }), []);
  if (estado !== 'listo') return null;

  const visibles = CIFRAS.filter((c) => Number.isInteger(datos[c.clave]) && datos[c.clave] > 0);
  if (!visibles.length) return null;

  return (
    <dl className="federacion-cifras">
      {visibles.map((c) => (
        <div key={c.clave} className="federacion-cifra">
          {/* dt antes de dd como pide HTML; el CSS muestra primero el número. */}
          <dt className="federacion-cifra__texto">{datos[c.clave] === 1 ? c.uno : c.varios}</dt>
          <dd className="federacion-cifra__valor">{formatoEntero.format(datos[c.clave])}</dd>
        </div>
      ))}
    </dl>
  );
}

function QuienesSomos() {
  return (
    <section className="bloque" aria-labelledby="quienes-somos">
      <div className="contenedor federacion-intro">
        <div className="federacion-intro__texto">
          <span className="antetitulo">Quiénes somos</span>
          <h2 id="quienes-somos" className="seccion-titulo">Competencias y registro federativo</h2>
          {CONTENIDO.quienesSomos.map((parrafo) => (
            <p key={parrafo} className="federacion-parrafo">{parrafo}</p>
          ))}
        </div>
        <Cifras />
      </div>
    </section>
  );
}

function MisionVision() {
  const tarjetas = [
    ['Misión', CONTENIDO.mision],
    ['Visión', CONTENIDO.vision]
  ].filter(([, texto]) => texto);
  if (!tarjetas.length) return null;

  return (
    <section className="bloque bloque--arena" aria-label="Misión y visión">
      <div className="contenedor federacion-mision">
        {tarjetas.map(([titulo, texto]) => (
          <article key={titulo} className="federacion-mision__tarjeta">
            <h2 className="antetitulo">{titulo}</h2>
            <p className="federacion-mision__texto">{texto}</p>
          </article>
        ))}
      </div>
    </section>
  );
}


function JuntaDirectiva() {
  const { miembros, periodo } = CONTENIDO.junta;
  if (!miembros.length) return null;

  return (
    <section className="bloque" aria-labelledby="junta-directiva">
      <div className="contenedor">
        <h2 id="junta-directiva" className="seccion-titulo federacion-titulo">Junta directiva</h2>
        <ul className="federacion-junta">
          {miembros.map((m) => (
            <li key={`${m.cargo}-${m.nombre}`} className="federacion-junta__miembro">
              <span className="federacion-junta__avatar" aria-hidden="true">{iniciales(m.nombre)}</span>
              <div>
                <p className="federacion-junta__nombre">{m.nombre}</p>
                <p className="federacion-junta__cargo">{m.cargo}</p>
              </div>
            </li>
          ))}
        </ul>
        {periodo && <p className="federacion-nota">Periodo {periodo}</p>}
      </div>
    </section>
  );
}

function Documentos() {
  const { documentos } = CONTENIDO;
  if (!documentos.length) return null;

  return (
    <section className="bloque bloque--arena" aria-labelledby="reglamentos">
      <div className="contenedor">
        <h2 id="reglamentos" className="seccion-titulo federacion-titulo">Reglamentos y documentos</h2>
        <ul className="federacion-documentos">
          {documentos.map((d) => (
            <li key={d.url} className="federacion-documento">
              <span className="federacion-documento__tipo" aria-hidden="true">{(d.formato || 'DOC').slice(0, 4).toUpperCase()}</span>
              <div className="federacion-documento__texto">
                <p className="federacion-documento__titulo">{d.titulo}</p>
                {d.detalle && <p className="federacion-documento__detalle">{d.detalle}</p>}
              </div>
              {(d.formato || d.tamano) && (
                <p className="federacion-documento__peso">{[d.formato, d.tamano].filter(Boolean).join(' · ')}</p>
              )}
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="boton boton--chico federacion-documento__boton">
                Descargar<span className="visualmente-oculto"> {d.titulo} (se abre en otra pestaña)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Contacto() {
  const { direccion, telefono, correo, horario } = CONTENIDO.contacto;
  const filas = [
    ['Dirección', direccion],
    ['Teléfono', telefono && <a href={`tel:${telefono.replace(/[^\d+]/g, '')}`}>{telefono}</a>],
    ['Correo', correo && <a href={`mailto:${correo}`}>{correo}</a>],
    ['Horario de oficina', horario],
    [
      'Redes sociales',
      <ul className="federacion-redes" key="redes">
        {REDES.map((r) => (
          <li key={r.nombre}>
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.nombre} <span className="federacion-redes__usuario">{r.usuario}</span>
              <span className="visualmente-oculto"> (se abre en otra pestaña)</span>
            </a>
          </li>
        ))}
      </ul>
    ]
  ].filter(([, valor]) => valor);

  return (
    <section className="bloque" aria-labelledby="contacto">
      <div className="contenedor">
        <h2 id="contacto" className="seccion-titulo federacion-titulo">Contacto</h2>
        <dl className="federacion-contacto">
          {filas.map(([nombre, valor]) => (
            <div key={nombre} className="federacion-contacto__fila">
              <dt>{nombre}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export default function LaFederacion() {
  return (
    <>
      <CabeceraSeccion
        titulo="La Federación Costarricense de Voleibol"
        bajada="Competencias, registro federativo y arbitraje del voleibol costarricense."
        imagen={false}
        antes={<Migas items={[{ texto: 'Inicio', to: '/' }, { texto: 'La Federación' }]} />}
      />
      <QuienesSomos />
      <MisionVision />
      <JuntaDirectiva />
      <Documentos />
      <Contacto />
    </>
  );
}
