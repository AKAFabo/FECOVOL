import { useState, useEffect, useMemo } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const CATEGORIAS_PARAMETROS = [
  { key: 'TODAS', label: 'Todas las categorías' },
  { key: 'COMPETENCIAS', label: 'Competencias y Reglas de Juego' },
  { key: 'SEGURIDAD', label: 'Seguridad y Sesiones' },
  { key: 'OPERATIVOS', label: 'Operativos y Evidencias' },
  { key: 'DIVULGACION', label: 'Divulgación y Prensa' }
];

const ELEMENTOS_POR_PAGINA = 8;

export default function ParametrosSistema() {
  const [parametros, setParametros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);

  // Modales
  const [parametroEditando, setParametroEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);
  const [guardandoCrear, setGuardandoCrear] = useState(false);
  const [nuevoParametro, setNuevoParametro] = useState({
    name: '',
    value: '',
    category: 'COMPETENCIAS',
    data_type: 'NUMBER',
    description: '',
    is_active: true
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  // ==========================================
  // 1. CARGA DE PARÁMETROS DEL SISTEMA
  // ==========================================
  async function cargarParametros() {
    setCargando(true);
    setError(null);
    try {
      let dataFinal = null;
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Intentar vía API Backend Express
      try {
        const res = await fetch(`${backendUrl}/api/parameters`, {
          headers: {
            'x-user-email': user?.email || ''
          }
        });
        if (res.ok) {
          const json = await res.json();
          dataFinal = json.data;
        }
      } catch (errApi) {
        console.warn('API /api/parameters no disponible, usando Supabase cliente:', errApi);
      }

      // 2. Fallback directo a Supabase
      if (!dataFinal) {
        const { data, error: errDb } = await supabase
          .from('system_parameters')
          .select('*')
          .order('name');

        if (errDb) throw errDb;

        dataFinal = (data || []).map(p => ({
          id: p.id,
          name: p.name,
          value: p.value,
          description: p.description || 'Sin descripción',
          category: p.category || 'GENERAL',
          data_type: p.data_type || 'STRING',
          is_active: p.is_active !== false,
          is_readonly: Boolean(p.is_readonly),
          updated_at: p.updated_at
        }));
      }

      setParametros(dataFinal || []);
    } catch (err) {
      console.error('Error al cargar parámetros:', err);
      setError('No se pudieron cargar los parámetros del sistema.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarParametros();
  }, []);

  // ==========================================
  // 2. FILTRADO Y PAGINACIÓN
  // ==========================================
  const parametrosFiltrados = useMemo(() => {
    return parametros.filter(p => {
      const coincideCat = categoriaSeleccionada === 'TODAS' || p.category === categoriaSeleccionada;
      if (!coincideCat) return false;

      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.value.toLowerCase().includes(q)
      );
    });
  }, [parametros, categoriaSeleccionada, busqueda]);

  const totalPaginas = Math.ceil(parametrosFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  const parametrosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
    return parametrosFiltrados.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [parametrosFiltrados, paginaActual]);

  // Resumen estadístico
  const totalActivos = useMemo(() => parametros.filter(p => p.is_active).length, [parametros]);
  const categoriasContadas = useMemo(() => new Set(parametros.map(p => p.category)).size, [parametros]);

  // ==========================================
  // 3. OPERACIONES CRUD: PARÁMETROS (RF-AUD-001)
  // ==========================================

  // Crear parámetro
  const handleCrearParametro = async (e) => {
    e.preventDefault();
    if (!nuevoParametro.name.trim() || nuevoParametro.value === '') return;

    setGuardandoCrear(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      const nombreLimpio = nuevoParametro.name.trim().toUpperCase().replace(/\s+/g, '_');

      // 1. Intentar API backend
      try {
        const res = await fetch(`${backendUrl}/api/parameters`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            name: nombreLimpio,
            value: nuevoParametro.value.trim(),
            category: nuevoParametro.category,
            data_type: nuevoParametro.data_type,
            description: nuevoParametro.description?.trim() || null,
            is_active: nuevoParametro.is_active,
            admin_email: user?.email || 'Administrador'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.message || 'Error al crear parámetro');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al crear parámetro, usando Supabase directo:', errApi);
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const { error: insErr } = await supabase
          .from('system_parameters')
          .insert({
            name: nombreLimpio,
            value: nuevoParametro.value.trim(),
            category: nuevoParametro.category,
            data_type: nuevoParametro.data_type,
            description: nuevoParametro.description?.trim() || null,
            is_active: nuevoParametro.is_active
          });

        if (insErr) throw insErr;
      }

      setMostrarModalCrear(false);
      setNuevoParametro({
        name: '',
        value: '',
        category: 'COMPETENCIAS',
        data_type: 'NUMBER',
        description: '',
        is_active: true
      });
      await cargarParametros();
      alert(`Parámetro "${nombreLimpio}" creado y auditado con éxito.`);
    } catch (err) {
      console.error('Error al crear parámetro:', err);
      alert('Error: ' + err.message);
    } finally {
      setGuardandoCrear(false);
    }
  };

  // Guardar edición de parámetro existente
  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!parametroEditando || parametroEditando.value === '') return;

    setGuardandoEdicion(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar API backend
      try {
        const res = await fetch(`${backendUrl}/api/parameters/${parametroEditando.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            value: String(parametroEditando.value).trim(),
            description: parametroEditando.description?.trim() || null,
            category: parametroEditando.category,
            is_active: parametroEditando.is_active,
            admin_email: user?.email || 'Administrador'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.message || 'Error al actualizar parámetro');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al actualizar parámetro, usando Supabase directo:', errApi);
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const { error: updErr } = await supabase
          .from('system_parameters')
          .update({
            value: String(parametroEditando.value).trim(),
            description: parametroEditando.description?.trim() || null,
            category: parametroEditando.category,
            is_active: parametroEditando.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', parametroEditando.id);

        if (updErr) throw updErr;
      }

      setParametroEditando(null);
      await cargarParametros();
      alert(`Parámetro "${parametroEditando.name}" actualizado con éxito en la bitácora.`);
    } catch (err) {
      console.error('Error al editar parámetro:', err);
      alert('Error: ' + err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Alternar estado activo / inactivo
  const handleToggleEstado = async (param) => {
    if (param.is_readonly) {
      alert(`El parámetro "${param.name}" es de solo lectura por configuración del sistema.`);
      return;
    }

    const nuevoEstado = !param.is_active;
    const accion = nuevoEstado ? 'activar' : 'inactivar';
    const confirmar = window.confirm(
      `¿Desea ${accion} el parámetro "${param.name}"?\n\n` +
      (nuevoEstado 
        ? 'El parámetro volverá a aplicarse en los cálculos y reglas operativas.'
        : 'Los módulos que usen este parámetro utilizarán los valores predeterminados de contingencia.')
    );
    if (!confirmar) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      try {
        const res = await fetch(`${backendUrl}/api/parameters/${param.id}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({ admin_email: user?.email || 'Administrador' })
        });
        if (res.ok) ok = true;
      } catch (errApi) {}

      if (!ok) {
        const { error: errUpd } = await supabase
          .from('system_parameters')
          .update({ is_active: nuevoEstado, updated_at: new Date().toISOString() })
          .eq('id', param.id);

        if (errUpd) throw errUpd;
      }

      await cargarParametros();
    } catch (err) {
      console.error('Error al alternar estado del parámetro:', err);
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="admin-page">
      {/* ── Encabezado Principal ── */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Parámetros del Sistema</h1>
          <p className="admin-page-header__subtitle">
            Configuración global de reglas de puntuación, desempates, seguridad y límites operativos.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => setMostrarModalCrear(true)}
          >
            + Nuevo parámetro
          </button>
        </div>
      </div>

      {/* ── Tarjetas Resumen de Parámetros ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="admin-card" style={{ padding: '16px 20px', borderLeft: '4px solid #082846' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--texto-mudo)', fontWeight: 700 }}>
            Total Parámetros
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--texto)', marginTop: '4px' }}>
            {parametros.length}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
            Reglas y criterios en base de datos
          </div>
        </div>

        <div className="admin-card" style={{ padding: '16px 20px', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--texto-mudo)', fontWeight: 700 }}>
            Parámetros Activos
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
            {totalActivos}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
            {parametros.length - totalActivos} inactivos / deshabilitados
          </div>
        </div>

        <div className="admin-card" style={{ padding: '16px 20px', borderLeft: '4px solid #2563eb' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--texto-mudo)', fontWeight: 700 }}>
            Categorías del Sistema
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
            {categoriasContadas}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--texto-mudo)', marginTop: '2px' }}>
            Competencias, seguridad y operaciones
          </div>
        </div>
      </div>

      {/* ── Barra de Pestañas por Categoría ── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--borde)',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {CATEGORIAS_PARAMETROS.map(cat => (
          <button
            key={cat.key}
            type="button"
            onClick={() => {
              setCategoriaSeleccionada(cat.key);
              setPaginaActual(1);
            }}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.88rem',
              color: categoriaSeleccionada === cat.key ? '#082846' : 'var(--texto-mudo)',
              borderBottom: categoriaSeleccionada === cat.key ? '3px solid #082846' : '3px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Barra de Búsqueda y Filtros ── */}
      <div className="admin-filters-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: '320px', maxWidth: '480px', flex: 1 }}>
          <input
            type="text"
            className="admin-input"
            placeholder="Buscar por clave, nombre o descripción…"
            style={{ width: '100%', paddingLeft: '34px' }}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPaginaActual(1);
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }}>
            🔍
          </span>
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--texto-mudo)',
                fontSize: '0.8rem'
              }}
            >
              Limpiar
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>
          Mostrando {parametrosPaginados.length} de {parametrosFiltrados.length} parámetros configurados
        </div>
      </div>

      {/* ── Contenedor de la Tabla ── */}
      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--texto-mudo)', fontSize: '0.9rem' }}>
            Cargando parámetros del sistema…
          </div>
        ) : error ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#dc2626' }}>
            {error}
          </div>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Clave / Parámetro</th>
                  <th style={{ width: '18%' }}>Valor Configurado</th>
                  <th style={{ width: '16%' }}>Categoría y Tipo</th>
                  <th style={{ width: '22%' }}>Descripción e Impacto</th>
                  <th style={{ width: '8%' }}>Estado</th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {parametrosPaginados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--texto)', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                          {p.name}
                        </strong>
                        {p.is_readonly && (
                          <span style={{ fontSize: '0.68rem', color: '#b45309', fontWeight: 600 }}>
                            🔒 Sistema (Solo lectura)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          backgroundColor: p.data_type === 'NUMBER' ? '#eff6ff' : p.data_type === 'BOOLEAN' ? '#f0fdf4' : '#f8fafc',
                          color: p.data_type === 'NUMBER' ? '#1d4ed8' : p.data_type === 'BOOLEAN' ? '#15803d' : '#334155',
                          border: '1px solid var(--borde)',
                          fontWeight: 700,
                          fontSize: '0.85rem'
                        }}>
                          {p.value}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--texto)' }}>
                          {p.category}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--texto-mudo)' }}>
                          Tipo: {p.data_type}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', lineHeight: '1.4' }}>
                        {p.description}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-status ${p.is_active ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                        {p.is_active ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => setParametroEditando({ ...p })}
                          title="Editar valor y descripción del parámetro"
                        >
                          Editar
                        </button>
                        {!p.is_readonly && (
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.78rem',
                              color: p.is_active ? '#dc2626' : '#166534',
                              borderColor: p.is_active ? '#fca5a5' : '#86efac'
                            }}
                            onClick={() => handleToggleEstado(p)}
                            title={p.is_active ? 'Inactivar parámetro' : 'Activar parámetro'}
                          >
                            {p.is_active ? 'Inactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {parametrosPaginados.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--texto-mudo)' }}>
                      {busqueda 
                        ? `No se encontraron parámetros que coincidan con "${busqueda}".` 
                        : 'No hay parámetros registrados para esta categoría.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Paginación */}
            <div className="admin-table-footer">
              <span>
                Página {paginaActual} de {totalPaginas}
              </span>
              <div className="admin-pagination-links">
                <button
                  type="button"
                  onClick={() => setPaginaActual(p => Math.max(p - 1, 1))}
                  disabled={paginaActual <= 1}
                >
                  &lt; Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPaginaActual(p => Math.min(p + 1, totalPaginas))}
                  disabled={paginaActual >= totalPaginas}
                >
                  Siguiente &gt;
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR PARÁMETRO DEL SISTEMA (RF-AUD-001)
          ══════════════════════════════════════════════════════════════ */}
      {parametroEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '540px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar parámetro</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setParametroEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicion}>
              <div className="admin-modal__body">
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--texto-mudo)', fontWeight: 700 }}>
                    Parámetro oficial
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.96rem', color: '#082846', marginTop: '2px' }}>
                    {parametroEditando.name}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>
                    Categoría: <strong>{parametroEditando.category}</strong> · Tipo: <strong>{parametroEditando.data_type}</strong>
                  </div>
                </div>

                {/* Input Dinámico según data_type */}
                <div className="campo" style={{ marginBottom: '16px' }}>
                  <label className="campo__etiqueta">
                    Valor del parámetro ({parametroEditando.data_type}) *
                  </label>
                  {parametroEditando.data_type === 'BOOLEAN' ? (
                    <select
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={String(parametroEditando.value).toLowerCase()}
                      onChange={(e) => setParametroEditando({ ...parametroEditando, value: e.target.value })}
                    >
                      <option value="true">Verdadero (Habilitado / true)</option>
                      <option value="false">Falso (Deshabilitado / false)</option>
                    </select>
                  ) : parametroEditando.data_type === 'NUMBER' ? (
                    <input
                      type="number"
                      required
                      step="any"
                      className="campo__input"
                      value={parametroEditando.value}
                      onChange={(e) => setParametroEditando({ ...parametroEditando, value: e.target.value })}
                    />
                  ) : (
                    <input
                      type="text"
                      required
                      className="campo__input"
                      value={parametroEditando.value}
                      onChange={(e) => setParametroEditando({ ...parametroEditando, value: e.target.value })}
                    />
                  )}
                </div>

                <div className="campo" style={{ marginBottom: '16px' }}>
                  <label className="campo__etiqueta">Categoría del parámetro</label>
                  <select
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={parametroEditando.category}
                    onChange={(e) => setParametroEditando({ ...parametroEditando, category: e.target.value })}
                  >
                    <option value="COMPETENCIAS">Competencias y Reglas de Juego</option>
                    <option value="SEGURIDAD">Seguridad y Sesiones</option>
                    <option value="OPERATIVOS">Operativos y Evidencias</option>
                    <option value="DIVULGACION">Divulgación y Prensa</option>
                    <option value="GENERAL">General</option>
                  </select>
                </div>

                <div className="campo" style={{ marginBottom: '16px' }}>
                  <label className="campo__etiqueta">Descripción o regla que rige</label>
                  <textarea
                    rows="3"
                    className="campo__input"
                    value={parametroEditando.description || ''}
                    onChange={(e) => setParametroEditando({ ...parametroEditando, description: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '16px' }}>
                  <label className="campo__etiqueta">Estado de vigencia</label>
                  <select
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={parametroEditando.is_active ? 'ACTIVO' : 'INACTIVO'}
                    onChange={(e) => setParametroEditando({ ...parametroEditando, is_active: e.target.value === 'ACTIVO' })}
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </div>

                {/* Advertencia de impacto en cálculos (RF-AUD-001) */}
                <div style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  color: '#92400e',
                  lineHeight: '1.45'
                }}>
                  <strong>⚠️ Impacto Oficial:</strong>
                  <br />
                  La modificación de este parámetro afectará los cálculos de clasificación de competencias, límites de carga o vigencia de sesiones. Esta acción quedará registrada en la bitácora con su usuario y valor previo.
                </div>
              </div>

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setParametroEditando(null)}
                  disabled={guardandoEdicion}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={guardandoEdicion}
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CREAR NUEVO PARÁMETRO (RF-AUD-001)
          ══════════════════════════════════════════════════════════════ */}
      {mostrarModalCrear && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '540px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Crear nuevo parámetro</h3>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setMostrarModalCrear(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCrearParametro}>
              <div className="admin-modal__body">
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Clave / Identificador único *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. COMPETENCIA_PUNTOS_DEFAULT"
                    className="campo__input"
                    style={{ fontFamily: 'monospace' }}
                    value={nuevoParametro.name}
                    onChange={(e) => setNuevoParametro({ ...nuevoParametro, name: e.target.value })}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--texto-mudo)' }}>
                    Se convertirá a mayúsculas y guiones bajos automáticamente.
                  </small>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Categoría *</label>
                    <select
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevoParametro.category}
                      onChange={(e) => setNuevoParametro({ ...nuevoParametro, category: e.target.value })}
                    >
                      <option value="COMPETENCIAS">Competencias</option>
                      <option value="SEGURIDAD">Seguridad</option>
                      <option value="OPERATIVOS">Operativos</option>
                      <option value="DIVULGACION">Divulgación</option>
                      <option value="GENERAL">General</option>
                    </select>
                  </div>

                  <div className="campo">
                    <label className="campo__etiqueta">Tipo de dato *</label>
                    <select
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevoParametro.data_type}
                      onChange={(e) => setNuevoParametro({ ...nuevoParametro, data_type: e.target.value })}
                    >
                      <option value="NUMBER">Numérico (NUMBER)</option>
                      <option value="STRING">Texto (STRING)</option>
                      <option value="BOOLEAN">Booleano (BOOLEAN)</option>
                    </select>
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Valor inicial *</label>
                  <input
                    type={nuevoParametro.data_type === 'NUMBER' ? 'number' : 'text'}
                    required
                    step="any"
                    placeholder="Ej. 15"
                    className="campo__input"
                    value={nuevoParametro.value}
                    onChange={(e) => setNuevoParametro({ ...nuevoParametro, value: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Descripción o regla que define</label>
                  <textarea
                    rows="2"
                    placeholder="Detalle el propósito de este parámetro y su impacto operativo"
                    className="campo__input"
                    value={nuevoParametro.description}
                    onChange={(e) => setNuevoParametro({ ...nuevoParametro, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-modal__footer">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModalCrear(false)}
                  disabled={guardandoCrear}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={guardandoCrear}
                >
                  {guardandoCrear ? 'Creando…' : 'Crear parámetro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
