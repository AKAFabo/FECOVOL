import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import '../../App.css';

export default function CompetenciaDetallePublica() {
  const { id } = useParams();
  
  const [competencia, setCompetencia] = useState(null);
  const [posiciones, setPosiciones] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('posiciones');

  useEffect(() => {
    async function cargar() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        
        const [resComp, resPos, resPartidos] = await Promise.all([
          fetch(`${backendUrl}/api/competitions/${id}`),
          fetch(`${backendUrl}/api/competitions/${id}/standings`),
          fetch(`${backendUrl}/api/matches?competition_id=${id}`)
        ]);
        
        const jsonComp = await resComp.json();
        const jsonPos = await resPos.json();
        const jsonPartidos = await resPartidos.json();
        
        setCompetencia(jsonComp.data);
        setPosiciones(jsonPos.data || []);
        setPartidos(jsonPartidos.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [id]);

  if (cargando) return <div className="contenedor" style={{ padding: '60px' }}>Cargando resultados...</div>;
  if (!competencia) return <div className="contenedor" style={{ padding: '60px' }}>Competencia no encontrada.</div>;

  // Agrupa los partidos por jornada para el calendario
  const partidosPorJornada = partidos.reduce((acc, partido) => {
    acc[partido.matchday] = acc[partido.matchday] || [];
    acc[partido.matchday].push(partido);
    return acc;
  }, {});

  // Filtra solo los partidos finalizados para la pestaña de resultados
  const partidosFinalizados = partidos
    .filter(p => p.status === 'FINALIZADO')
    .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date)); // Más recientes primero

  return (
    <div className="contenedor" style={{ padding: '48px 0' }}>
      
      {/* Navegación de retorno */}
      <Link to="/competencias" style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px', display: 'inline-block' }}>
        ← Volver a competencias
      </Link>
      
      {/* Encabezado del Torneo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 className="seccion-titulo" style={{ marginBottom: '8px' }}>{competencia.name}</h1>
          <p style={{ color: 'var(--texto-mudo)', fontSize: '1rem' }}>
            {competencia.categoria?.value} · {competencia.rama?.value} · Temporada {competencia.season}
          </p>
        </div>
        <span className="pastilla pastilla--ok" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
          {competencia.status.replace('_', ' ')}
        </span>
      </div>

      {/* MENÚ DE PESTAÑAS */}
      <div style={{ display: 'flex', gap: '32px', borderBottom: '2px solid var(--linea)', marginBottom: '32px' }}>
        {['posiciones', 'calendario', 'resultados'].map((tab) => (
          <button
            key={tab}
            onClick={() => setTabActiva(tab)}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 0',
              fontSize: '1.05rem',
              fontWeight: 700,
              textTransform: 'capitalize',
              cursor: 'pointer',
              color: tabActiva === tab ? 'var(--azul)' : 'var(--texto-mudo)',
              borderBottom: tabActiva === tab ? '3px solid var(--rojo)' : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* PESTAÑA 1: POSICIONES */}
      {tabActiva === 'posiciones' && (
        <div style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
            <thead style={{ background: 'var(--azul)', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <tr>
                <th style={{ padding: '16px 12px', textAlign: 'left', paddingLeft: '24px' }}>#</th>
                <th style={{ padding: '16px 12px', textAlign: 'left' }}>Equipo</th>
                <th style={{ padding: '16px 12px' }}>PJ</th>
                <th style={{ padding: '16px 12px' }}>PG</th>
                <th style={{ padding: '16px 12px' }}>PP</th>
                <th style={{ padding: '16px 12px' }}>SG</th>
                <th style={{ padding: '16px 12px' }}>SP</th>
                <th style={{ padding: '16px 12px', fontWeight: 800 }}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {posiciones.map((pos, i) => (
                <tr key={pos.team_id} style={{ borderBottom: '1px solid var(--linea)', backgroundColor: i < 4 ? '#f8fafc' : '#fff' }}>
                  <td style={{ padding: '16px 12px', textAlign: 'left', paddingLeft: '24px', fontWeight: 700, color: i < 4 ? 'var(--azul)' : 'var(--texto-mudo)' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 600 }}>{pos.team_name}</td>
                  <td style={{ padding: '16px 12px' }}>{pos.matches_played}</td>
                  <td style={{ padding: '16px 12px', color: 'var(--ok)' }}>{pos.matches_won}</td>
                  <td style={{ padding: '16px 12px', color: 'var(--rojo)' }}>{pos.matches_lost}</td>
                  <td style={{ padding: '16px 12px' }}>{pos.sets_won}</td>
                  <td style={{ padding: '16px 12px' }}>{pos.sets_lost}</td>
                  <td style={{ padding: '16px 12px', fontWeight: 800, fontSize: '1.1rem', color: 'var(--azul)' }}>{pos.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PESTAÑA 2: CALENDARIO */}
      {tabActiva === 'calendario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {Object.keys(partidosPorJornada).sort((a,b) => a-b).map(jornada => (
            <div key={jornada} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ background: 'var(--fondo)', padding: '16px 24px', borderBottom: '1px solid var(--linea)' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Jornada {jornada}</h3>
              </div>
              <div style={{ padding: '8px 24px' }}>
                {partidosPorJornada[jornada].map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--fondo)' }}>
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: '1.05rem' }}>{p.local.name}</div>
                    <div style={{ padding: '0 24px', minWidth: '120px', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontWeight: 800, color: 'var(--azul)' }}>
                        {p.status === 'FINALIZADO' ? `${p.home_sets_won} - ${p.away_sets_won}` : 'vs'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>
                        {p.status === 'PROGRAMADO' ? p.scheduled_time : p.scheduled_date}
                      </span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: '1.05rem' }}>{p.visitante.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PESTAÑA 3: RESULTADOS */}
      {tabActiva === 'resultados' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {partidosFinalizados.length === 0 ? (
            <p style={{ color: 'var(--texto-mudo)' }}>Aún no hay resultados oficiales registrados.</p>
          ) : (
            partidosFinalizados.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: '10px', padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '120px', fontSize: '0.85rem', color: 'var(--texto-mudo)', borderRight: '1px solid var(--linea)', paddingRight: '16px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--texto)', marginBottom: '4px' }}>{p.scheduled_date}</div>
                  <div>{p.venue}</div>
                </div>
                
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', paddingRight: '32px' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.local.name}</span>
                  <div style={{ width: '48px', height: '48px', background: 'var(--fondo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'var(--azul)' }}>
                    {p.home_sets_won}
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '16px', paddingLeft: '32px' }}>
                  <div style={{ width: '48px', height: '48px', background: 'var(--fondo)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: 'var(--texto-mudo)' }}>
                    {p.away_sets_won}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{p.visitante.name}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
}