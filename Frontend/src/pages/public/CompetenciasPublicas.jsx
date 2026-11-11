import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { CanchaPlano } from '../../components/Ilustraciones.jsx';
import useCarga from '../../hooks/useCarga.js';
import { estadoCompetencia, listarCompetencias } from '../../services/competencias.js';
import { isoValida, rangoFechas } from '../../utils/formato.js';
import './CompetenciasPublicas.css';

// Filtros de la lista. El valor viaja en la URL (?estado=en-curso) para que se pueda compartir el
// enlace; cualquier otro valor se ignora y se muestran todas.
const FILTROS = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'en-curso', texto: 'En curso' },
  { valor: 'inscripciones', texto: 'Inscripciones abiertas' },
  { valor: 'finalizadas', texto: 'Finalizadas' }
];

// Primero lo que está pasando, luego lo que viene y al final el historial.
const ORDEN_GRUPO = { 'en-curso': 0, inscripciones: 1, finalizadas: 2, otras: 3 };

function TarjetaCompetencia({ competencia }) {
  const estado = estadoCompetencia(competencia.status);
  const detalle = [competencia.category, competencia.branch, competencia.modality].filter(Boolean).join(' · ');

  return (
    <li className={`tarjeta-competencia${estado.grupo === 'finalizadas' ? ' tarjeta-competencia--finalizada' : ''}`}>
      <div className="tarjeta-competencia__imagen" aria-hidden="true">
        <CanchaPlano />
      </div>
      <div className="tarjeta-competencia__cuerpo">
        <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>
        <h2 className="tarjeta-competencia__nombre">
          {/* El enlace cubre toda la tarjeta (ver ::after en el CSS). */}
          <Link to={`/competencias/${competencia.id}`} className="tarjeta-competencia__enlace">
            {competencia.name}
          </Link>
        </h2>
        {detalle && <p className="tarjeta-competencia__detalle">{detalle}</p>}
        <p className="tarjeta-competencia__fechas">
          <time dateTime={isoValida(competencia.start_date)}>
            {rangoFechas(competencia.start_date, competencia.end_date)}
          </time>
        </p>
        <span className="enlace-flecha tarjeta-competencia__accion" aria-hidden="true">
          Posiciones, calendario y resultados
        </span>
      </div>
    </li>
  );
}

export default function CompetenciasPublicas() {
  const [params, setParams] = useSearchParams();
  const pedido = params.get('estado');
  const filtro = FILTROS.some((f) => f.valor === pedido) ? pedido : 'todas';

  const { estado, datos, error, reintentar } = useCarga((signal) => listarCompetencias({ signal }), []);

  const ordenadas = useMemo(
    () =>
      [...(datos || [])].sort(
        (a, b) =>
          ORDEN_GRUPO[estadoCompetencia(a.status).grupo] - ORDEN_GRUPO[estadoCompetencia(b.status).grupo] ||
          (b.start_date || '').localeCompare(a.start_date || '')
      ),
    [datos]
  );

  const conteo = useMemo(() => {
    const c = { todas: ordenadas.length };
    for (const comp of ordenadas) {
      const g = estadoCompetencia(comp.status).grupo;
      c[g] = (c[g] || 0) + 1;
    }
    return c;
  }, [ordenadas]);

  const visibles = filtro === 'todas' ? ordenadas : ordenadas.filter((c) => estadoCompetencia(c.status).grupo === filtro);

  function elegir(valor) {
    const siguiente = new URLSearchParams(params);
    if (valor === 'todas') siguiente.delete('estado');
    else siguiente.set('estado', valor);
    setParams(siguiente, { replace: true });
  }

  return (
    <>
      <CabeceraSeccion
        antetitulo="Competencias"
        titulo="Competencias oficiales"
        bajada="Tablas de posiciones, calendario y resultados de las competencias que organiza FECOVOL."
      />

      <section className="bloque competencias-publicas" aria-labelledby="titulo-listado">
        <div className="contenedor">
          <h2 id="titulo-listado" className="visualmente-oculto">Listado de competencias</h2>

          <div className="filtros" role="group" aria-label="Filtrar competencias por estado">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`filtro${filtro === f.valor ? ' filtro--activo' : ''}`}
                aria-pressed={filtro === f.valor}
                onClick={() => elegir(f.valor)}
              >
                {f.texto}
                {estado === 'listo' && <span className="filtro__conteo">{conteo[f.valor] || 0}</span>}
              </button>
            ))}
          </div>

          {estado === 'cargando' && <Cargando texto="Cargando competencias…" />}
          {estado === 'error' && <ErrorCarga mensaje={error.message} onReintentar={reintentar} />}
          {estado === 'listo' && visibles.length === 0 && (
            <SinResultados
              titulo={filtro === 'todas' ? 'Todavía no hay competencias publicadas' : 'No hay competencias con este estado'}
              texto="Cuando la Federación publique una competencia, aparecerá aquí."
            >
              {filtro !== 'todas' && (
                <button type="button" className="boton boton--primario boton--chico" onClick={() => elegir('todas')}>
                  Ver todas
                </button>
              )}
            </SinResultados>
          )}
          {estado === 'listo' && visibles.length > 0 && (
            <ul className="lista-competencias">
              {visibles.map((c) => (
                <TarjetaCompetencia key={c.id} competencia={c} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
