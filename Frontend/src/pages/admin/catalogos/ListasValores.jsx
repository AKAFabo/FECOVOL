import { useState, useEffect, useMemo } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

export default function ListasValores() {
  const [catalogos, setCatalogos] = useState([]);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState(null);
  const [valores, setValores] = useState([]);
  const [paginaValores, setPaginaValores] = useState(1);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [cargandoValores, setCargandoValores] = useState(false);
  const [error, setError] = useState(null);
  
  // Modal de agregar/editar valor
  const [mostrarModal, setMostrarModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoValor, setNuevoValor] = useState({
    codigo: '',
    valor: '',
    descripcion: '',
    estado: 'ACTIVO'
  });

  // Paginación de valores
  const totalPaginasValores = Math.ceil(valores.length / ELEMENTOS_POR_PAGINA) || 1;
  const valoresPaginados = useMemo(() => {
    const inicio = (paginaValores - 1) * ELEMENTOS_POR_PAGINA;
    return valores.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [valores, paginaValores]);

  // 1. Cargar la lista de catálogos y el conteo de valores
  async function cargarCatalogos() {
    setCargandoCatalogos(true);
    setError(null);
    try {
      const { data: cats, error: errCats } = await supabase
        .from('catalogs')
        .select(`
          id,
          name,
          description,
          catalog_values ( id, is_active )
        `)
        .order('name');

      if (errCats) throw errCats;

      const formateados = (cats || []).map((c) => ({
        id: c.id,
        nombre: c.name,
        descripcion: c.description,
        total: c.catalog_values?.length || 0,
        activos: c.catalog_values?.filter((v) => v.is_active).length || 0
      }));

      setCatalogos(formateados);
      if (formateados.length > 0 && !catalogoSeleccionado) {
        setCatalogoSeleccionado(formateados[0]);
      }
    } catch (err) {
      console.error('Error al cargar catálogos:', err);
      setError('No se pudieron cargar los catálogos.');
    } finally {
      setCargandoCatalogos(false);
    }
  }

  // 2. Cargar valores del catálogo seleccionado
  async function cargarValores(catalogId) {
    if (!catalogId) return;
    setCargandoValores(true);
    try {
      const { data: vals, error: errVals } = await supabase
        .from('catalog_values')
        .select('*')
        .eq('catalog_id', catalogId)
        .order('value');

      if (errVals) throw errVals;

      const formateados = (vals || []).map((v) => ({
        id: v.id,
        codigo: v.code,
        valor: v.value,
        descripcion: v.description || '—',
        is_active: v.is_active,
        estado: v.is_active ? 'ACTIVO' : 'INACTIVO'
      }));

      setValores(formateados);
    } catch (err) {
      console.error('Error al cargar valores:', err);
      setError('No se pudieron cargar los valores del catálogo.');
    } finally {
      setCargandoValores(false);
    }
  }

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    if (catalogoSeleccionado) {
      setPaginaValores(1);
      cargarValores(catalogoSeleccionado.id);
    }
  }, [catalogoSeleccionado]);

  // 3. Agregar nuevo valor (upsert)
  const handleAgregarValor = async (e) => {
    e.preventDefault();
    if (!nuevoValor.codigo.trim() || !nuevoValor.valor.trim() || !catalogoSeleccionado) return;

    setGuardando(true);
    try {
      const { error: errInsert } = await supabase
        .from('catalog_values')
        .insert({
          catalog_id: catalogoSeleccionado.id,
          code: nuevoValor.codigo.trim().toUpperCase(),
          value: nuevoValor.valor.trim(),
          description: nuevoValor.descripcion.trim() || null,
          is_active: nuevoValor.estado === 'ACTIVO'
        });

      if (errInsert) throw errInsert;

      setMostrarModal(false);
      setNuevoValor({
        codigo: '',
        valor: '',
        descripcion: '',
        estado: 'ACTIVO'
      });
      // Recargar valores y contadores
      await cargarValores(catalogoSeleccionado.id);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al guardar valor:', err);
      alert('Error al guardar el valor: ' + (err.message || 'Código duplicado o error de servidor'));
    } finally {
      setGuardando(false);
    }
  };

  // 4. Inactivar / Activar valor (Soft delete para proteger histórico)
  const toggleEstadoValor = async (valorItem) => {
    const nuevoEstado = !valorItem.is_active;
    try {
      const { error: errUpdate } = await supabase
        .from('catalog_values')
        .update({ is_active: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', valorItem.id);

      if (errUpdate) throw errUpdate;

      await cargarValores(catalogoSeleccionado.id);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al cambiar estado del valor:', err);
      alert('No se pudo actualizar el estado: ' + err.message);
    }
  };

  const totalValoresEnSistema = catalogos.reduce((acc, c) => acc + c.total, 0);

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Listas de valores</h1>
          <p className="admin-page-header__subtitle">
            {catalogos.length} listas · {totalValoresEnSistema} valores registrados
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={() => setMostrarModal(true)}
            disabled={!catalogoSeleccionado}
          >
            Agregar valor
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Two Column Layout: Catalog List + Values Table */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Catalogs List */}
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Listas</h2>
            <span className="admin-card__badge">{catalogos.length} listas</span>
          </div>
          {cargandoCatalogos ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--texto-mudo)', fontSize: '0.85rem' }}>
              Cargando catálogos de Supabase...
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {catalogos.map((cat) => {
                const isSelected = catalogoSeleccionado?.id === cat.id;
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => setCatalogoSeleccionado(cat)}
                      style={{
                        width: '100%',
                        padding: '12px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isSelected ? '#f1f5f9' : 'transparent',
                        border: 'none',
                        borderLeft: isSelected ? '3px solid #c8102e' : '3px solid transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s'
                      }}
                    >
                      <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--texto)' : 'var(--texto-suave)', fontSize: '0.88rem' }}>
                        {cat.nombre}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>
                        {cat.total} valores
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Column: Values Table */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title">{catalogoSeleccionado?.nombre || 'Seleccione un catálogo'}</h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                {valores.length} valores · {valores.filter(v => v.is_active).length} activos
              </span>
            </div>
            <button 
              type="button" 
              className="admin-btn admin-btn--secondary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setMostrarModal(true)}
              disabled={!catalogoSeleccionado}
            >
              Agregar valor
            </button>
          </div>

          {cargandoValores ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)', fontSize: '0.88rem' }}>
              Cargando valores...
            </div>
          ) : (
            <>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Valor</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {valoresPaginados.map((v) => (
                    <tr key={v.id}>
                      <td><strong>{v.codigo}</strong></td>
                      <td style={{ color: 'var(--texto)', fontWeight: 600 }}>{v.valor}</td>
                      <td>{v.descripcion}</td>
                      <td>
                        <span className={`badge-status ${v.is_active ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                          {v.estado}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          type="button" 
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => toggleEstadoValor(v)}
                        >
                          {v.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {valoresPaginados.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                        No hay valores registrados en este catálogo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination Controls */}
              <div className="admin-table-footer">
                <span>
                  Mostrando {valoresPaginados.length} de {valores.length} valores
                  {totalPaginasValores > 1 && ` (Página ${paginaValores} de ${totalPaginasValores})`}
                </span>
                <div className="admin-pagination-links">
                  <button 
                    type="button" 
                    onClick={() => setPaginaValores(p => Math.max(p - 1, 1))}
                    disabled={paginaValores <= 1}
                  >
                    &lt; Anterior
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPaginaValores(p => Math.min(p + 1, totalPaginasValores))}
                    disabled={paginaValores >= totalPaginasValores}
                  >
                    Siguiente &gt;
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: Agregar Valor */}
      {mostrarModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Agregar valor</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModal(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAgregarValor}>
              <div className="admin-modal__body">
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '18px' }}>
                  Estará disponible de inmediato en los formularios que usan esta lista.
                </p>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Lista *</label>
                  <input 
                    type="text" 
                    disabled 
                    className="campo__input" 
                    value={catalogoSeleccionado?.nombre || ''}
                    style={{ opacity: 0.8 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Código *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      placeholder="Ej. CAT-MAY"
                      value={nuevoValor.codigo}
                      onChange={(e) => setNuevoValor({ ...nuevoValor, codigo: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Valor *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      placeholder="Ej. Mayor"
                      value={nuevoValor.valor}
                      onChange={(e) => setNuevoValor({ ...nuevoValor, valor: e.target.value })}
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Descripción</label>
                  <input 
                    type="text" 
                    className="campo__input" 
                    placeholder="Descripción o restricción"
                    value={nuevoValor.descripcion}
                    onChange={(e) => setNuevoValor({ ...nuevoValor, descripcion: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Estado</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevoValor.estado}
                    onChange={(e) => setNuevoValor({ ...nuevoValor, estado: e.target.value })}
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Agregar valor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
