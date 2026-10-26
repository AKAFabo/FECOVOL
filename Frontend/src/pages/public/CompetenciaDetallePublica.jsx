import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import Migas from '../../components/Migas.jsx';
import useCarga from '../../hooks/useCarga.js';
import { esIdValido, estadoCompetencia, obtenerCompetencia } from '../../services/competencias.js';
import { fechaHora } from '../../utils/formato.js';
import PestanaCalendario from './competencia/PestanaCalendario.jsx';
import PestanaEquipos from './competencia/PestanaEquipos.jsx';
import PestanaEstadisticas from './competencia/PestanaEstadisticas.jsx';
import PestanaPosiciones from './competencia/PestanaPosiciones.jsx';
import PestanaResultados from './competencia/PestanaResultados.jsx';
import './CompetenciaDetallePublica.css';

// Pestañas de la página. La activa viaja en la URL (?vista=calendario) para poder compartirla.
const VISTAS = [
  { valor: 'posiciones', texto: 'Posiciones' },
  { valor: 'calendario', texto: 'Calendario' },
  { valor: 'resultados', texto: 'Resultados' },
  { valor: 'equipos', texto: 'Equipos' },
  { valor: 'estadisticas', texto: 'Estadísticas' }
];

/* ----------------------------------------------------------------------------------------------
   Pestañas accesibles (patrón WAI-ARIA "tabs"): flechas izquierda/derecha, Inicio y Fin.
   ---------------------------------------------------------------------------------------------- */
function Pestanas({ activa, onCambiar }) {
  const refs = useRef([]);

  function alTeclear(evento, indice) {
    const ultimo = VISTAS.length - 1;
    const destino = {
      ArrowRight: indice === ultimo ? 0 : indice + 1,
      ArrowLeft: indice === 0 ? ultimo : indice - 1,
      Home: 0,
      End: ultimo
    }[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    onCambiar(VISTAS[destino].valor);
    refs.current[destino]?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label="Información de la competencia">
      {VISTAS.map((v, i) => {
        const seleccionada = v.valor === activa;
        return (
          <button
            key={v.valor}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`pestana-${v.valor}`}
            aria-selected={seleccionada}
            aria-controls={`panel-${v.valor}`}
            tabIndex={seleccionada ? 0 : -1}
            className={`pestana${seleccionada ? ' pestana--activa' : ''}`}
            onClick={() => onCambiar(v.valor)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {v.texto}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------
   Cabecera
   ---------------------------------------------------------------------------------------------- */
function PastillaEstado({ competencia: c }) {
  const estado = estadoCompetencia(c.status);
  if (c.status === 'EN_CURSO' && c.matchday_current) {
    const total = c.matchdays_total ? ` de ${c.matchdays_total}` : '';
    return <span className="pastilla pastilla--oscura-ok">Jornada {c.matchday_current}{total}</span>;
  }
  if (c.status === 'EN_CURSO') return <span className="pastilla pastilla--oscura-ok">{estado.texto}</span>;
  if (c.status === 'INSCRIPCIONES') return <span className="pastilla pastilla--aviso">{estado.texto}</span>;
  return <span className="pastilla pastilla--oscura">{estado.texto}</span>;
}

function CabeceraCompetencia({ competencia: c, vista, onCambiarVista }) {
  const detalle = [c.category, c.branch].filter(Boolean).join(' · ');
  const actualizada = fechaHora(c.updated_at);

  return (
    <header className="cabecera-competencia">
      <div className="contenedor">
        <div className="cabecera-competencia__superior">
          <div className="cabecera-competencia__texto">
            <Migas items={[{ texto: 'Inicio', to: '/' }, { texto: 'Competencias', to: '/competencias' }, { texto: c.name }]} />
            <h1 className="cabecera-competencia__titulo">{c.name}</h1>
            <p className="cabecera-competencia__pastillas">
              {c.modality && <span className="pastilla pastilla--oscura">{c.modality}</span>}
              {detalle && <span className="pastilla pastilla--oscura">{detalle}</span>}
              {c.team_count > 0 && (
                <span className="pastilla pastilla--oscura">{c.team_count} {c.team_count === 1 ? 'equipo' : 'equipos'}</span>
              )}
              <PastillaEstado competencia={c} />
            </p>
          </div>
          {actualizada && (
            <p className="cabecera-competencia__actualizacion">
              <span>Última actualización</span>
              <time dateTime={c.updated_at}>{actualizada}</time>
            </p>
          )}
        </div>
        <Pestanas activa={vista} onCambiar={onCambiarVista} />
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------------------------------------
   Página
   ---------------------------------------------------------------------------------------------- */
function NoEncontrada() {
  return (
    <section className="bloque detalle-competencia">
      <div className="contenedor">
        <SinResultados titulo="Competencia no encontrada" texto="La competencia que busca no existe o todavía no está publicada.">
          <Link to="/competencias" className="boton boton--primario boton--chico">Ver competencias</Link>
        </SinResultados>
      </div>
    </section>
  );
}

// Las pestañas que no traen su propia franja se muestran dentro de un bloque con contenedor.
function EnBloque({ children }) {
  return (
    <section className="bloque detalle-competencia">
      <div className="contenedor">{children}</div>
    </section>
  );
}

function Contenido({ competencia, vista, onCambiarVista }) {
  switch (vista) {
    case 'calendario':
      return <EnBloque><PestanaCalendario competenciaId={competencia.id} /></EnBloque>;
    case 'resultados':
      return <EnBloque><PestanaResultados competenciaId={competencia.id} /></EnBloque>;
    case 'equipos':
      return <EnBloque><PestanaEquipos competencia={competencia} /></EnBloque>;
    case 'estadisticas':
      return <EnBloque><PestanaEstadisticas competencia={competencia} /></EnBloque>;
    default:
      return <PestanaPosiciones competencia={competencia} onCambiarVista={onCambiarVista} />;
  }
}

export default function CompetenciaDetallePublica() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const pedida = params.get('vista');
  const vista = VISTAS.some((v) => v.valor === pedida) ? pedida : 'posiciones';
  const idValido = esIdValido(id);

  const competencia = useCarga(
    (signal) => (idValido ? obtenerCompetencia(id, { signal }) : Promise.resolve(null)),
    [id, idValido]
  );

  function cambiarVista(valor) {
    const siguiente = new URLSearchParams(params);
    if (valor === 'posiciones') siguiente.delete('vista');
    else siguiente.set('vista', valor);
    setParams(siguiente, { replace: true });
    // Los enlaces "Ver todas las jornadas" están abajo en la página: se vuelve a las pestañas.
    document.getElementById(`pestana-${valor}`)?.focus();
  }

  if (!idValido) return <NoEncontrada />;
  if (competencia.estado === 'error' && competencia.error.status === 404) return <NoEncontrada />;

  if (competencia.estado !== 'listo') {
    return (
      <EnBloque>
        {competencia.estado === 'cargando' ? (
          <Cargando texto="Cargando competencia…" />
        ) : (
          <ErrorCarga mensaje={competencia.error.message} onReintentar={competencia.reintentar} />
        )}
      </EnBloque>
    );
  }

  const c = competencia.datos;

  return (
    <>
      <CabeceraCompetencia competencia={c} vista={vista} onCambiarVista={cambiarVista} />
      <div role="tabpanel" id={`panel-${vista}`} aria-labelledby={`pestana-${vista}`} className="panel-competencia">
        <Contenido competencia={c} vista={vista} onCambiarVista={cambiarVista} />
      </div>
    </>
  );
}
