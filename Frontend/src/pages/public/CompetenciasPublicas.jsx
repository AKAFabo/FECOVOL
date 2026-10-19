import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../App.css'; 

export default function CompetenciasPublicas() {
  // Define los estados para la carga de datos públicos
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Ejecuta la consulta al backend al montar el componente
  useEffect(() => {
    async function cargar() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        // Consume el endpoint filtrando solo las competencias en curso para el público
        const res = await fetch(`${backendUrl}/api/competitions?status=EN_CURSO`);
        const json = await res.json();
        setCompetencias(json.data || []);
      } catch (err) {
        console.error('Error cargando competencias públicas', err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  // Muestra el indicador de carga
  if (cargando) {
    return <div className="contenedor" style={{ padding: '60px', textAlign: 'center' }}>Cargando competencias...</div>;
  }

  return (
    <div className="contenedor" style={{ padding: '48px 0' }}>
      
      {/* Renderiza el encabezado de la sección */}
      <div className="seccion-encabezado" style={{ marginBottom: '32px' }}>
        <h1 className="seccion-titulo">Competencias Oficiales</h1>
        <span className="pastilla pastilla--ok">Temporada 2026</span>
      </div>

      {/* Renderiza la cuadrícula de tarjetas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Mapea y renderiza cada competencia pública */}
        {competencias.map((comp) => (
          <div key={comp.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: '10px', padding: '24px' }}>
            <span className="antetitulo" style={{ color: 'var(--rojo)' }}>En curso</span>
            <h2 style={{ fontSize: '1.4rem', margin: '8px 0', fontFamily: 'var(--fuente-titulo)' }}>{comp.name}</h2>
            <p style={{ color: 'var(--texto-mudo)', fontSize: '0.9rem', marginBottom: '16px' }}>
              {comp.categoria?.value} · {comp.rama?.value} · {comp.modalidad?.value}
            </p>
            
            <Link 
              to={`/competencias/${comp.id}`} 
              className="boton boton--primario boton--chico"
              style={{ width: '100%' }}
            >
              Ver tabla de posiciones
            </Link>
          </div>
        ))}

        {/* Renderiza el mensaje si no hay competencias disponibles */}
        {competencias.length === 0 && (
          <p style={{ color: 'var(--texto-mudo)' }}>No hay competencias públicas en curso actualmente.</p>
        )}
      </div>
    </div>
  );
}