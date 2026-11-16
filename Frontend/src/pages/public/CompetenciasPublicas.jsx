import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../App.css'; 
import '../../pages/public/Inicio.css'; 

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

export default function CompetenciasPublicas() {
  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Declara los estados para los filtros
  const [filtroTemporada, setFiltroTemporada] = useState('todas');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // Carga las competencias al montar el componente
  useEffect(() => {
    async function cargar() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        // Obtén todas las competencias
        const res = await fetch(`${backendUrl}/api/competitions`);
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

  // Limpia todos los filtros a sus valores por defecto
  const limpiarFiltros = () => {
    setFiltroTemporada('todas');
    setFiltroCategoria('todas');
    setFiltroEstado('todos');
  };

  // Extrae opciones únicas para los filtros basadas en los datos cargados
  const temporadasDisponibles = [...new Set(competencias.map(c => c.season))].sort().reverse();
  const categoriasDisponibles = [...new Set(competencias.map(c => c.categoria?.value).filter(Boolean))];

  // Filtra las competencias según los criterios seleccionados
  const competenciasFiltradas = competencias.filter(c => {
    const matchTemporada = filtroTemporada === 'todas' || c.season === filtroTemporada;
    const matchCategoria = filtroCategoria === 'todas' || c.categoria?.value === filtroCategoria;
    const matchEstado = filtroEstado === 'todos' || c.status === filtroEstado;
    return matchTemporada && matchCategoria && matchEstado;
  });

  // Muestra el indicador de carga
  if (cargando) {
    return <div className="contenedor" style={{ padding: '80px 0', textAlign: 'center' }}>Cargando competencias...</div>;
  }

  return (
    <div className="contenedor" style={{ padding: '48px 0', minHeight: '70vh' }}>
      
      {/* Renderiza el encabezado de la sección */}
      <div className="seccion-encabezado" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="seccion-titulo">Competencias Oficiales</h1>
          <p style={{ color: 'var(--texto-mudo)', marginTop: '8px' }}>Consulta calendarios, resultados y tablas de posiciones de todos los torneos.</p>
        </div>
      </div>

      {/* Renderiza la barra de filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        background: 'var(--campo)', 
        padding: '20px', 
        borderRadius: 'var(--radio)', 
        marginBottom: '32px', 
        flexWrap: 'wrap',
        alignItems: 'flex-end'
      }}>
        <div className="campo" style={{ width: '200px', marginBottom: 0 }}>
          <label className="campo__etiqueta">Temporada</label>
          <select className="admin-select" style={{ width: '100%' }} value={filtroTemporada} onChange={(e) => setFiltroTemporada(e.target.value)}>
            <option value="todas">Todas las temporadas</option>
            {temporadasDisponibles.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="campo" style={{ width: '200px', marginBottom: 0 }}>
          <label className="campo__etiqueta">Categoría</label>
          <select className="admin-select" style={{ width: '100%' }} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="campo" style={{ width: '200px', marginBottom: 0 }}>
          <label className="campo__etiqueta">Estado</label>
          <select className="admin-select" style={{ width: '100%' }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="EN_CURSO">En Curso</option>
            <option value="INSCRIPCIONES">Inscripciones</option>
            <option value="FINALIZADA">Finalizadas</option>
          </select>
        </div>

        {/* Botón para limpiar los filtros */}
        <div style={{ marginLeft: 'auto' }}>
          <button 
            type="button" 
            className="admin-btn admin-btn--secondary" 
            onClick={limpiarFiltros}
            disabled={filtroTemporada === 'todas' && filtroCategoria === 'todas' && filtroEstado === 'todos'}
            style={{ height: '38px' }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Renderiza la cuadrícula de tarjetas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Mapea y renderiza cada competencia pública */}
        {competenciasFiltradas.map((comp) => (
          <div key={comp.id} style={{ background: '#fff', border: '1px solid var(--linea)', borderRadius: 'var(--radio)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <span className="antetitulo" style={{ color: comp.status === 'EN_CURSO' ? 'var(--rojo)' : 'var(--texto-mudo)', marginBottom: '8px' }}>
              {comp.status.replace('_', ' ')}
            </span>
            <h2 style={{ fontSize: '1.3rem', margin: '0 0 12px 0', fontFamily: 'var(--fuente-titulo)', color: 'var(--texto)' }}>
              {comp.name}
            </h2>
            
            <p style={{ color: 'var(--texto-mudo)', fontSize: '0.9rem', marginBottom: '8px' }}>
              {comp.categoria?.value} · {comp.rama?.value} · {comp.modalidad?.value}
            </p>
            <p style={{ color: 'var(--texto-mudo)', fontSize: '0.85rem', marginBottom: '24px' }}>
              Del {formatearFecha(comp.start_date)} al {formatearFecha(comp.end_date)}
            </p>
            
            <div style={{ marginTop: 'auto' }}>
              <Link 
                to={`/competencias/${comp.id}`} 
                className="boton boton--primario boton--chico"
                style={{ width: '100%', display: 'block', textAlign: 'center' }}
              >
                Ver detalles del torneo
              </Link>
            </div>
          </div>
        ))}

        {/* Muestra un mensaje si no hay competencias */}
        {competenciasFiltradas.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--texto-mudo)' }}>
            No hay competencias disponibles con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
}