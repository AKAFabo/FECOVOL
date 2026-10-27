import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../admin/AdminCommon.css'; 

export default function CompetenciaDetalle() {
  // Extrae el ID de la URL mediante el hook de enrutamiento
  const { id } = useParams(); 
  const navigate = useNavigate();
  
  // Define los estados locales para la competencia y su tabla
  const [competencia, setCompetencia] = useState(null);
  const [posiciones, setPosiciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Ejecuta las consultas al backend al montar el componente o cambiar el ID
  useEffect(() => {
    async function cargarDatos() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        
        // Consulta la información general de la competencia
        const resComp = await fetch(`${backendUrl}/api/competitions/${id}`);
        const jsonComp = await resComp.json();
        setCompetencia(jsonComp.data);

        // Consulta la vista SQL de la tabla de posiciones
        const resPos = await fetch(`${backendUrl}/api/competitions/${id}/standings`);
        const jsonPos = await resPos.json();
        setPosiciones(jsonPos.data || []);

      } catch (err) {
        console.error('Error cargando detalle:', err);
      } finally {
        setCargando(false);
      }
    }
    // La función maneja sus propios errores; no hay nada que esperar aquí.
    void cargarDatos();
  }, [id]);

  // Muestra el indicador de carga
  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando tabla de posiciones...</div>;
  
  // Muestra el mensaje de error si no se encuentra la competencia
  if (!competencia) return <div style={{ padding: '40px', textAlign: 'center' }}>Competencia no encontrada.</div>;

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', padding: '24px' }}>
      
      {/* Renderiza el encabezado con botón de retorno */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <button
            type="button"
            style={{ fontSize: '0.8rem', color: 'var(--rojo)', fontWeight: 700, cursor: 'pointer', background: 'none', border: 0, padding: 0, textAlign: 'left' }}
            onClick={() => navigate('/personal')}
          >
            ← Volver a competencias
          </button>
          <h1 style={{ marginTop: '8px' }}>{competencia.name}</h1>
          <p className="admin-page-header__subtitle">
            {competencia.categoria?.value} · {competencia.rama?.value} · Temporada {competencia.season}
          </p>
        </div>
      </div>

      {/* Renderiza el tarjeta contenedora de la tabla */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h2 className="admin-card__title">Tabla de posiciones oficial</h2>
          <span className="admin-card__badge">Actualizada en vivo</span>
        </div>

        <table className="admin-table" style={{ textAlign: 'center' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingLeft: '24px' }}>#</th>
              <th style={{ textAlign: 'left' }}>Equipo</th>
              <th>PJ</th>
              <th>PG</th>
              <th>PP</th>
              <th>SG</th>
              <th>SP</th>
              <th style={{ fontWeight: 800, color: 'var(--texto)' }}>PTS</th>
            </tr>
          </thead>
          <tbody>
            {/* Mapea los resultados de la vista SQL y renderiza las posiciones */}
            {posiciones.map((pos, index) => (
              <tr key={pos.team_id}>
                <td style={{ textAlign: 'left', paddingLeft: '24px', fontWeight: 700, color: index < 4 ? 'var(--azul)' : 'inherit' }}>
                  {index + 1}
                </td>
                <td style={{ textAlign: 'left', fontWeight: 600, color: 'var(--texto)' }}>
                  {pos.team_name}
                </td>
                <td>{pos.matches_played}</td>
                <td>{pos.matches_won}</td>
                <td>{pos.matches_lost}</td>
                <td>{pos.sets_won}</td>
                <td>{pos.sets_lost}</td>
                <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{pos.total_points}</td>
              </tr>
            ))}
            
            {/* Renderiza el mensaje en caso de no haber resultados oficiales */}
            {posiciones.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                  Aún no hay resultados oficiales para calcular la tabla de posiciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}