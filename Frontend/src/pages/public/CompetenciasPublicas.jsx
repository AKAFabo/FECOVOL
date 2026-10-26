import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { CanchaPlano } from '../../components/Ilustraciones.jsx';
import Migas from '../../components/Migas.jsx';
import Segmentado from '../../components/Segmentado.jsx';
import useCarga from '../../hooks/useCarga.js';
import { estadoCompetencia, listarCompetencias } from '../../services/competencias.js';
import { fechaDiaMes, isoValida } from '../../utils/formato.js';
import './CompetenciasPublicas.css';

// Secciones de la página, en este orden: lo que está pasando, lo que viene y el historial.
const GRUPOS = [
  { clave: 'en-curso', titulo: 'En curso' },
  { clave: 'inscripciones', titulo: 'Inscripciones abiertas' },
  { clave: 'finalizadas', titulo: 'Finalizadas' }
];

// Filtros. Las opciones salen de las competencias publicadas (no de una lista fija), así nunca se
// ofrece un filtro que deja la página vacía. El valor viaja en la URL para poder compartirlo.
const FILTROS = [
  { parametro: 'modalidad', campo: 'modality', etiqueta: 'Modalidad' },
  { parametro: 'rama', campo: 'branch', etiqueta: 'Rama' },
  { parametro: 'categoria', campo: 'category', etiqueta: 'Categoría' }
];

const TODAS = 'todas';

// Valores que van primero en su filtro; los demás siguen en orden alfabético.
const PRIMEROS = { modality: ['Sala', 'Playa'], category: ['Mayor'] };

function opcionesDe(competencias, campo) {
  const valores = [...new Set(competencias.map((c) => c[campo]).filter(Boolean))];
  const primeros = PRIMEROS[campo] || [];
  const rango = (v) => (primeros.includes(v) ? primeros.indexOf(v) : primeros.length);
  valores.sort((a, b) => rango(a) - rango(b) || a.localeCompare(b, 'es'));
  return [{ valor: TODAS, texto: 'Todas' }, ...valores.map((v) => ({ valor: v, texto: v }))];
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// Líneas de avance de la tarjeta según el estado de la competencia.
function avance(c, grupo) {
  const equipos = c.team_count ? plural(c.team_count, 'equipo', 'equipos') : null;
  if (grupo === 'en-curso') {
    const jornada = c.matchday_current
      ? `Jornada ${c.matchday_current}${c.matchdays_total ? ` de ${c.matchdays_total}` : ''}`
      : 'Por iniciar';
    return {
      principal: [jornada, equipos].filter(Boolean).join(' · '),
      secundaria: c.leader ? `Líder: ${c.leader.name}` : null
    };
  }
  if (grupo === 'inscripciones') {
    return {
      principal: isoValida(c.start_date) ? `Inicia el ${fechaDiaMes(c.start_date)}` : 'Fecha de inicio por definir',
      secundaria: equipos ? `${equipos} inscritos hasta ahora` : null
    };
  }
  return {
    principal: c.matchdays_total ? plural(c.matchdays_total, 'jornada', 'jornadas') : equipos,
    secundaria: c.leader ? `Primer lugar: ${c.leader.name}` : null
  };
}

function TarjetaCompetencia({ competencia: c }) {
  const estado = estadoCompetencia(c.status);
  const detalle = [c.category, c.branch].filter(Boolean).join(' · ');
  const { principal, secundaria } = avance(c, estado.grupo);
  const tono = estado.grupo === 'finalizadas' ? 'finalizada' : c.modality === 'Playa' ? 'playa' : estado.grupo;

  return (
    <li className={`tarjeta-competencia tarjeta-competencia--${tono}`}>
      <div className="tarjeta-competencia__imagen" aria-hidden="true">
        <CanchaPlano />
      </div>
      <div className="tarjeta-competencia__cuerpo">
        <p className="tarjeta-competencia__pastillas">
          {c.modality && <span className="pastilla pastilla--info">{c.modality}</span>}
          <span className={`pastilla pastilla--${estado.tono}`}>{estado.texto}</span>
        </p>
        <h3 className="tarjeta-competencia__nombre">
          {/* El enlace cubre toda la tarjeta (ver ::after en el CSS). */}
          <Link to={`/competencias/${c.id}`} className="tarjeta-competencia__enlace">{c.name}</Link>
        </h3>
        {detalle && <p className="tarjeta-competencia__detalle">{detalle}</p>}
        {(principal || secundaria) && (
          <div className="tarjeta-competencia__avance">
            {principal && <p className="tarjeta-competencia__avance-principal">{principal}</p>}
            {secundaria && <p>{secundaria}</p>}
          </div>
        )}
        <span className="enlace-flecha tarjeta-competencia__accion" aria-hidden="true">Ver competencia</span>
      </div>
    </li>
  );
}

export default function CompetenciasPublicas() {
  const [params, setParams] = useSearchParams();
  const { estado, datos, error, reintentar } = useCarga((signal) => listarCompetencias({ signal }), []);
  const competencias = useMemo(() => datos || [], [datos]);

  const filtros = useMemo(
    () =>
      FILTROS.map((f) => {
        const opciones = opcionesDe(competencias, f.campo);
        const pedido = params.get(f.parametro);
        return { ...f, opciones, valor: opciones.some((o) => o.valor === pedido) ? pedido : TODAS };
      }),
    [competencias, params]
  );

  const visibles = competencias.filter((c) => filtros.every((f) => f.valor === TODAS || c[f.campo] === f.valor));
  const filtrando = filtros.some((f) => f.valor !== TODAS);

  const porGrupo = GRUPOS.map((g) => ({
    ...g,
    lista: visibles
      .filter((c) => estadoCompetencia(c.status).grupo === g.clave)
      .sort((a, b) =>
        g.clave === 'inscripciones'
          ? (a.start_date || '9').localeCompare(b.start_date || '9')
          : (b.start_date || '').localeCompare(a.start_date || '')
      )
  })).filter((g) => g.lista.length > 0);

  const temporadas = [...new Set(competencias.map((c) => c.season).filter(Boolean))].sort();
  const resumen =
    estado === 'listo'
      ? [
          temporadas.length === 1 ? `Temporada ${temporadas[0]}` : null,
          `${competencias.length} ${competencias.length === 1 ? 'competencia' : 'competencias'}`
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Tablas de posiciones, calendario y resultados de las competencias de FECOVOL.';

  function elegir(parametro, valor) {
    const siguiente = new URLSearchParams(params);
    if (valor === TODAS) siguiente.delete(parametro);
    else siguiente.set(parametro, valor);
    setParams(siguiente, { replace: true });
  }

  function limpiarFiltros() {
    const siguiente = new URLSearchParams(params);
    for (const f of FILTROS) siguiente.delete(f.parametro);
    setParams(siguiente, { replace: true });
  }

  return (
    <>
      <CabeceraSeccion
        titulo="Competencias"
        bajada={resumen}
        imagen={false}
        antes={<Migas items={[{ texto: 'Inicio', to: '/' }, { texto: 'Competencias' }]} />}
      >
        {estado === 'listo' && competencias.length > 0 && (
          <div className="competencias-filtros">
            {filtros
              .filter((f) => f.opciones.length > 2)
              .map((f) => (
                <Segmentado
                  key={f.parametro}
                  etiqueta={f.etiqueta}
                  valor={f.valor}
                  opciones={f.opciones}
                  onCambiar={(v) => elegir(f.parametro, v)}
                />
              ))}
          </div>
        )}
      </CabeceraSeccion>

      <section className="bloque competencias-publicas" aria-label="Listado de competencias">
        <div className="contenedor">
          {estado === 'cargando' && <Cargando texto="Cargando competencias…" />}
          {estado === 'error' && <ErrorCarga mensaje={error.message} onReintentar={reintentar} />}
          {estado === 'listo' && porGrupo.length === 0 && (
            <SinResultados
              titulo={filtrando ? 'Ninguna competencia coincide con los filtros' : 'Todavía no hay competencias publicadas'}
              texto={filtrando ? undefined : 'Cuando la Federación publique una competencia, aparecerá aquí.'}
            >
              {filtrando && (
                <button type="button" className="boton boton--primario boton--chico" onClick={limpiarFiltros}>
                  Quitar filtros
                </button>
              )}
            </SinResultados>
          )}
          {porGrupo.map((g) => (
            <section key={g.clave} className="grupo-competencias" aria-labelledby={`grupo-${g.clave}`}>
              <h2 id={`grupo-${g.clave}`} className="grupo-competencias__titulo">{g.titulo}</h2>
              <ul className="lista-competencias">
                {g.lista.map((c) => (
                  <TarjetaCompetencia key={c.id} competencia={c} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
