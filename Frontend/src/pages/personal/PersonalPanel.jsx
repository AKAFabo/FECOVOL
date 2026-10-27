import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../admin/AdminCommon.css'; 
import { supabase } from '../../supabaseClient.js'; 

// Clase de la pastilla según el estado de la competencia.
const CLASE_ESTADO = {
  EN_CURSO: 'badge-status--activa',
  INSCRIPCIONES: 'badge-status--inactivo'
};

export default function PersonalPanel() {
  const navigate = useNavigate();
  
  // Define los estados para el manejo de datos y UI
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTemporada, setFiltroTemporada] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Ejecuta consulta al backend al montar el componente
  useEffect(() => {
    async function cargarCompetencias() {
      try {
        // Configur la URL del backend según variables de entorno
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        // Consumi el endpoint de competencias
        const res = await fetch(`${backendUrl}/api/competitions`);
        
        if (!res.ok) throw new Error('Error al cargar competencias');
        const json = await res.json();
        
        // Almacena los datos en el estado
        setCompetencias(json.data || []);
      } catch (err) {
        console.error(err);
        setError('No se pudieron cargar las competencias. Verifique la conexión con el backend.');
      } finally {
        setCargando(false);
      }
    }
    // La función maneja sus propios errores; no hay nada que esperar aquí.
    void cargarCompetencias();
  }, []);

  // Filtra el listado según criterios seleccionados para optimizar renderizado
  const competenciasFiltradas = useMemo(() => {
    return competencias.filter(c => {
      const matchTemporada = filtroTemporada === 'todas' || c.season === filtroTemporada;
      const matchEstado = filtroEstado === 'todos' || c.status === filtroEstado;
      return matchTemporada && matchEstado;
    });
  }, [competencias, filtroTemporada, filtroEstado]);

  // Cierra la sesión e invalida los credenciales
  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate('/ingresar');
  };

  return (
    <div style={{ background: '#f5f6f8', minHeight: '100vh', padding: '24px' }}>
      
      {/* Renderiza el encabezado con acciones principales */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Competencias y Resultados</h1>
          <p className="admin-page-header__subtitle">Gestión de torneos, inscripciones y calendario oficial.</p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={handleCerrarSesion}>
            Cerrar sesión
          </button>
          <button type="button" className="admin-btn admin-btn--primary">
            Nueva competencia
          </button>
        </div>
      </div>

      {/* muestra el banner de error en caso de fallo en la petición */}
      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Renderiza la barra de filtros */}
      <div className="admin-filters-bar">
        <select className="admin-select" value={filtroTemporada} onChange={(e) => setFiltroTemporada(e.target.value)}>
          <option value="todas">Temporada: todas</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
        </select>

        <select className="admin-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Estado: todos</option>
          <option value="EN_CURSO">En curso</option>
          <option value="INSCRIPCIONES">Inscripciones</option>
          <option value="PLANIFICACION">Planificación</option>
          <option value="FINALIZADA">Finalizada</option>
        </select>
      </div>

      {/* Renderiza la tabla de competencias */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h2 className="admin-card__title">Listado de competencias</h2>
          <span className="admin-card__badge">{competenciasFiltradas.length} torneos</span>
        </div>

        {/* Validar el estado de carga antes de renderizar la tabla */}
        {cargando ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
            Cargando competencias...
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Competencia</th>
                <th>Temporada</th>
                <th>Categoría / Rama</th>
                <th>Fechas</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* Mapea y renderiza cada competencia */}
              {competenciasFiltradas.map((comp) => (
                <tr key={comp.id}>
                  <td><strong style={{ color: 'var(--texto)' }}>{comp.name}</strong></td>
                  <td>{comp.season}</td>
                  <td>{comp.categoria?.value} · {comp.rama?.value}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
                    {comp.start_date} al {comp.end_date}
                  </td>
                  <td>
                    <span className={`badge-status ${CLASE_ESTADO[comp.status] || ''}`}>
                      {comp.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="admin-btn admin-btn--secondary" 
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => navigate(`/personal/competencia/${comp.id}`)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              
              {/* Renderiza el mensaje si no hay resultados */}
              {competenciasFiltradas.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                    No hay competencias que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}