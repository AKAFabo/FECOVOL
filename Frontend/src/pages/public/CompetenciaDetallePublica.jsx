import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import Migas from '../../components/Migas.jsx';
import useCarga from '../../hooks/useCarga.js';
import { esIdValido, estadoCompetencia, obtenerCompetencia } from '../../services/competencias.js';
import { fechaHora } from '../../utils/formato.js';
import { precargarCompetencia } from './competencia/cargas.js';
import PestanaCalendario from './competencia/PestanaCalendario.jsx';
import PestanaEquipos from './competencia/PestanaEquipos.jsx';
import PestanaEstadisticas from './competencia/PestanaEstadisticas.jsx';
import PestanaPosiciones from './competencia/PestanaPosiciones.jsx';
import PestanaResultados from './competencia/PestanaResultados.jsx';
import '../../styles/paneles.css';
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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

// Formatea una fecha ISO con hora
function formatearFechaHora(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr);
  return `${d.getDate()}-${MESES[d.getMonth()]}-${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Devuelve el nombre visible de la sede de un partido
function nombreSede(partido) {
  return partido?.sede?.value || 'Sede por definir';
}

export default function CompetenciaDetallePublica() {
  const { id } = useParams();

  // Declara los estados principales
  const [competencia, setCompetencia] = useState(null);
  const [posiciones, setPosiciones] = useState([]);
  const [metaPosiciones, setMetaPosiciones] = useState({ es_parcial: false, ultima_actualizacion: null });
  const [partidos, setPartidos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [estadisticas, setEstadisticas] = useState([]);

  // Declara los estados de control
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('posiciones');
  const [filtroJornada, setFiltroJornada] = useState('todas');
  const [filtroEquipo, setFiltroEquipo] = useState('todos');
  const [filtroSede, setFiltroSede] = useState('todas');

  // Carga los datos al montar el componente
  useEffect(() => {
    async function cargar() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        const [resComp, resPos, resPartidos, resEquipos, resStats] = await Promise.all([
          fetch(`${backendUrl}/api/competitions/${id}`),
          fetch(`${backendUrl}/api/competitions/${id}/standings`),
          fetch(`${backendUrl}/api/matches?competition_id=${id}`),
          fetch(`${backendUrl}/api/competitions/${id}/teams`),
          fetch(`${backendUrl}/api/reports/team-stats/${id}`)
        ]);
        const [jsonComp, jsonPos, jsonPartidos, jsonEquipos, jsonStats] = await Promise.all([
          resComp.json(), resPos.json(), resPartidos.json(), resEquipos.json(), resStats.json()
        ]);
        setCompetencia(jsonComp.data);
        setPosiciones(jsonPos.data || []);
        setMetaPosiciones({ es_parcial: jsonPos.es_parcial, ultima_actualizacion: jsonPos.ultima_actualizacion });
        setPartidos(jsonPartidos.data || []);
        setEquipos(jsonEquipos.data || []);
        setEstadisticas(jsonStats.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [id]);

  if (cargando) return <div className="contenedor" style={{ padding: '80px 0', textAlign: 'center' }}>Cargando información del torneo...</div>;
  if (!competencia) return <div className="contenedor" style={{ padding: '80px 0', textAlign: 'center' }}>Competencia no encontrada.</div>;

  // Agrupa los partidos finalizados por jornada
  const partidosPorJornada = partidos
    .filter(p => p.status === 'FINALIZADO')
    .reduce((acc, p) => {
      if (!acc[p.matchday]) acc[p.matchday] = [];
      acc[p.matchday].push(p);
      return acc;
    }, {});

  // Filtra los partidos del calendario
  const partidosCalendario = partidos.filter(p => {
    const matchJornada = filtroJornada === 'todas' || p.matchday === parseInt(filtroJornada);
    const matchEquipo = filtroEquipo === 'todos' || p.local?.id === filtroEquipo || p.visitante?.id === filtroEquipo;
    const matchSede = filtroSede === 'todas' || (p.sede?.value === filtroSede);
    return matchJornada && matchEquipo && matchSede;
  });

  const jornadasDisponibles = [...new Set(partidos.map(p => p.matchday))].sort((a, b) => a - b);
  const sedesDisponibles = [...new Set(partidos.map(p => p.sede?.value).filter(Boolean))].sort();

  return (
    <div className="contenedor" style={{ padding: '48px 0', minHeight: '70vh' }}>
      <Link to="/competencias" style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '24px', display: 'inline-block' }}>
        ← Volver a competencias
      </Link>

      <div style={{ background: 'var(--azul)', color: '#fff', padding: '32px', borderRadius: 'var(--radio)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span className="pastilla pastilla--ok" style={{ marginBottom: '12px' }}>{competencia.status.replace('_', ' ')}</span>
            <h1 style={{ fontSize: '2rem', margin: '0 0 8px 0', color: '#fff' }}>{competencia.name}</h1>
            <p style={{ color: '#bdcde1', margin: 0, fontSize: '1rem' }}>
              {competencia.categoria?.value} · {competencia.rama?.value} · {competencia.modalidad?.value} · Temporada {competencia.season}
            </p>
          </div>
          {metaPosiciones.ultima_actualizacion && (
            <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#9fb3cc' }}>
              <div>Última actualización:</div>
              <div style={{ fontWeight: 700, color: '#fff', marginTop: '4px' }}>{formatearFechaHora(metaPosiciones.ultima_actualizacion)}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '32px', borderBottom: '2px solid var(--linea)', marginBottom: '32px', overflowX: 'auto' }}>
        {['posiciones', 'calendario', 'resultados', 'equipos', 'estadisticas'].map((tab) => (
          <button key={tab} onClick={() => setTabActiva(tab)} style={{
            background: 'none', border: 'none', padding: '12px 0', fontSize: '1.05rem', fontWeight: 700,
            textTransform: 'capitalize', cursor: 'pointer', color: tabActiva === tab ? 'var(--azul)' : 'var(--texto-mudo)',
            borderBottom: tabActiva === tab ? '3px solid var(--rojo)' : '3px solid transparent', marginBottom: '-2px', whiteSpace: 'nowrap'
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Pestaña: Posiciones */}
      {tabActiva === 'posiciones' && (
        <div>
          {metaPosiciones.es_parcial && (
            <div className="alerta alerta--aviso" style={{ marginBottom: '20px' }}>
              <strong>Tabla en progreso:</strong> Aún hay partidos pendientes de jugar o validar. Las posiciones pueden cambiar.
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead style={{ background: 'var(--campo)', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--texto-mudo)' }}>
                <tr>
                  <th style={{ padding: '16px 12px', textAlign: 'left', paddingLeft: '24px' }}>#</th>
                  <th style={{ padding: '16px 12px', textAlign: 'left' }}>Equipo</th>
                  <th style={{ padding: '16px 12px' }}>PJ</th>
                  <th style={{ padding: '16px 12px' }}>PG</th>
                  <th style={{ padding: '16px 12px' }}>PP</th>
                  <th style={{ padding: '16px 12px' }}>SG</th>
                  <th style={{ padding: '16px 12px' }}>SP</th>
                  <th style={{ padding: '16px 12px' }}>Ratio Sets</th>
                  <th style={{ padding: '16px 12px' }}>Ratio Pts</th>
                  <th style={{ padding: '16px 12px', fontWeight: 800, color: 'var(--azul)' }}>PTS</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.map((pos, i) => (
                  <tr key={pos.team_id} style={{ borderBottom: '1px solid var(--linea)', backgroundColor: i < 4 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '16px 12px', textAlign: 'left', paddingLeft: '24px', fontWeight: 700, color: i < 4 ? 'var(--azul)' : 'var(--texto-mudo)' }}>{i + 1}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 600 }}>{pos.team_name}</td>
                    <td style={{ padding: '16px 12px' }}>{pos.matches_played}</td>
                    <td style={{ padding: '16px 12px', color: 'var(--ok)' }}>{pos.matches_won}</td>
                    <td style={{ padding: '16px 12px', color: 'var(--rojo)' }}>{pos.matches_lost}</td>
                    <td style={{ padding: '16px 12px' }}>{pos.sets_won}</td>
                    <td style={{ padding: '16px 12px' }}>{pos.sets_lost}</td>
                    <td style={{ padding: '16px 12px', fontWeight: 600 }}>{typeof pos.ratio_sets === 'number' ? pos.ratio_sets.toFixed(2) : (pos.ratio_sets ?? '—')}</td>
                    <td style={{ padding: '16px 12px', fontWeight: 600 }}>{typeof pos.ratio_puntos === 'number' ? pos.ratio_puntos.toFixed(2) : (pos.ratio_puntos ?? '—')}</td>
                    <td style={{ padding: '16px 12px', fontWeight: 800, fontSize: '1.1rem', color: 'var(--azul)' }}>{pos.total_points}</td>
                  </tr>
                ))}
                {posiciones.length === 0 && <tr><td colSpan="10" style={{ padding: '32px', color: 'var(--texto-mudo)' }}>Aún no hay resultados registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pestaña: Calendario */}
      {tabActiva === 'calendario' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <select className="admin-select" value={filtroJornada} onChange={(e) => setFiltroJornada(e.target.value)}>
              <option value="todas">Jornada: todas</option>
              {jornadasDisponibles.map(j => <option key={j} value={j}>Jornada {j}</option>)}
            </select>
            <select className="admin-select" value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)}>
              <option value="todos">Equipo: todos</option>
              {equipos.map(eq => <option key={eq.equipo.id} value={eq.equipo.id}>{eq.equipo.name}</option>)}
            </select>
            <select className="admin-select" value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
              <option value="todas">Sede: todas</option>
              {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {partidosCalendario.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: '150px', fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--texto)' }}>Jornada {p.matchday}</div>
                  <div>{formatearFecha(p.scheduled_date)} · {p.scheduled_time}</div>
                  <div style={{ marginTop: '4px' }}>{nombreSede(p)}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', paddingRight: '32px' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.local?.name}</span>
                  <div style={{ width: '40px', height: '40px', background: 'var(--campo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: 'var(--azul)' }}>
                    {p.status === 'FINALIZADO' ? p.home_sets_won : 'vs'}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '16px', paddingLeft: '32px' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--campo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: 'var(--texto-mudo)' }}>
                    {p.status === 'FINALIZADO' ? p.away_sets_won : 'vs'}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.visitante?.name}</span>
                </div>
              </div>
            ))}
            {partidosCalendario.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--texto-mudo)' }}>No hay partidos que coincidan con los filtros.</div>}
          </div>
        </div>
      )}

      {/* Pestaña: Resultados */}
      {tabActiva === 'resultados' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {Object.entries(partidosPorJornada).sort(([a], [b]) => parseInt(b) - parseInt(a)).map(([jornada, lista]) => (
            <div key={jornada}>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', color: 'var(--texto)', fontFamily: 'var(--fuente-titulo)' }}>Jornada {jornada}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {lista.map(p => (
                  <div key={p.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '150px', fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--texto)', marginBottom: '4px' }}>{formatearFecha(p.scheduled_date)}</div>
                      <div>{nombreSede(p)}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', paddingRight: '32px' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.local?.name}</span>
                      <div style={{ width: '48px', height: '48px', background: 'var(--campo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'var(--azul)' }}>{p.home_sets_won}</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '16px', paddingLeft: '32px' }}>
                      <div style={{ width: '48px', height: '48px', background: 'var(--campo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'var(--texto-mudo)' }}>{p.away_sets_won}</div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.visitante?.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(partidosPorJornada).length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--texto-mudo)' }}>Aún no hay resultados oficiales registrados.</div>}
        </div>
      )}

      {/* Pestaña: Equipos */}
      {tabActiva === 'equipos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {equipos.map(eq => (
            <div key={eq.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <div style={{ width: '48px', height: '48px', background: 'var(--campo)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--azul)', fontSize: '1.2rem' }}>
                  {eq.equipo.name.charAt(0)}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 2px 0', fontSize: '1.1rem', fontFamily: 'var(--fuente-titulo)' }}>{eq.equipo.name}</h3>
                  <span style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>{eq.equipo.short_name || 'Sin siglas'}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', borderTop: '1px solid var(--linea)', paddingTop: '12px' }}>
                <div><strong>Asociación:</strong> {eq.equipo.association?.name || 'Sin asociación'}</div>
                <div style={{ marginTop: '4px' }}><strong>Sede local:</strong> {eq.equipo.home_venue || 'Por definir'}</div>
              </div>
            </div>
          ))}
          {equipos.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--texto-mudo)' }}>No hay equipos inscritos.</div>}
        </div>
      )}

      {/* Pestaña: Estadísticas */}
      {tabActiva === 'estadisticas' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead style={{ background: 'var(--campo)', fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--texto-mudo)' }}>
                <tr>
                  <th style={{ padding: '14px 10px', textAlign: 'left', paddingLeft: '20px' }}>#</th>
                  <th style={{ padding: '14px 10px', textAlign: 'left' }}>Equipo</th>
                  <th style={{ padding: '14px 10px' }}>PJ</th>
                  <th style={{ padding: '14px 10px' }}>PG</th>
                  <th style={{ padding: '14px 10px' }}>PP</th>
                  <th style={{ padding: '14px 10px' }}>Sets G</th>
                  <th style={{ padding: '14px 10px' }}>Sets P</th>
                  <th style={{ padding: '14px 10px' }}>Ratio Sets</th>
                  <th style={{ padding: '14px 10px' }}>Ratio Pts</th>
                  <th style={{ padding: '14px 10px', fontWeight: 800, color: 'var(--azul)' }}>PTS</th>
                </tr>
              </thead>
              <tbody>
                {estadisticas.map((t, i) => (
                  <tr key={t.team_id} style={{ borderBottom: '1px solid var(--linea)' }}>
                    <td style={{ padding: '12px 10px', textAlign: 'left', paddingLeft: '20px', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600 }}>{t.team_name}</td>
                    <td style={{ padding: '12px 10px' }}>{t.matches_played}</td>
                    <td style={{ padding: '12px 10px', color: 'var(--ok)' }}>{t.matches_won}</td>
                    <td style={{ padding: '12px 10px', color: 'var(--rojo)' }}>{t.matches_lost}</td>
                    <td style={{ padding: '12px 10px' }}>{t.sets_won}</td>
                    <td style={{ padding: '12px 10px' }}>{t.sets_lost}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600 }}>{t.ratio_sets}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600 }}>{t.ratio_puntos}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 800, color: 'var(--azul)' }}>{t.total_points}</td>
                  </tr>
                ))}
                {estadisticas.length === 0 && <tr><td colSpan="10" style={{ padding: '32px', color: 'var(--texto-mudo)' }}>Aún no hay estadísticas disponibles.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
