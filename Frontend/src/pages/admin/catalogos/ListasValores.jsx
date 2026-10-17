import { useState } from 'react';
import '../AdminCommon.css';

const CATALOGOS_MOCK = [
  { id: '1', nombre: 'Categorías', total: 6, activos: 5 },
  { id: '2', nombre: 'Ramas', total: 3, activos: 3 },
  { id: '3', nombre: 'Modalidades', total: 2, activos: 2 },
  { id: '4', nombre: 'Posiciones', total: 6, activos: 6 },
  { id: '5', nombre: 'Tipos de documento', total: 7, activos: 7 },
  { id: '6', nombre: 'Tipos de incidente', total: 12, activos: 12 },
  { id: '7', nombre: 'Tipos de sanción', total: 8, activos: 8 },
  { id: '8', nombre: 'Tipos de oficial', total: 4, activos: 4 },
  { id: '9', nombre: 'Estados de partido', total: 6, activos: 6 }
];

const VALORES_CATEGORIAS_MOCK = [
  { id: 'v1', catalogo: 'Categorías', codigo: 'CAT-MAY', valor: 'Mayor', descripcion: 'Sin límite de edad', seUsaEn: '18 registros', estado: 'ACTIVO' },
  { id: 'v2', catalogo: 'Categorías', codigo: 'CAT-U21', valor: 'Sub-21', descripcion: 'Nacidas a partir de 2005', seUsaEn: '4 registros', estado: 'ACTIVO' },
  { id: 'v3', catalogo: 'Categorías', codigo: 'CAT-U19', valor: 'Sub-19', descripcion: 'Nacidas a partir de 2007', seUsaEn: '9 registros', estado: 'ACTIVO' },
  { id: 'v4', catalogo: 'Categorías', codigo: 'CAT-U17', valor: 'Sub-17', descripcion: 'Nacidas a partir de 2009', seUsaEn: '8 registros', estado: 'ACTIVO' },
  { id: 'v5', catalogo: 'Categorías', codigo: 'CAT-U15', valor: 'Sub-15', descripcion: 'Nacidas a partir de 2011', seUsaEn: '6 registros', estado: 'ACTIVO' },
  { id: 'v6', catalogo: 'Categorías', codigo: 'CAT-U13', valor: 'Sub-13', descripcion: 'Descontinuada en 2024', seUsaEn: '2 registros', estado: 'INACTIVO' }
];

export default function ListasValores() {
  const [catalogos] = useState(CATALOGOS_MOCK);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState(CATALOGOS_MOCK[0]);
  const [valores, setValores] = useState(VALORES_CATEGORIAS_MOCK);
  
  // Modal de agregar valor
  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoValor, setNuevoValor] = useState({
    codigo: '',
    valor: '',
    descripcion: '',
    orden: 1,
    estado: 'ACTIVO'
  });

  const handleAgregarValor = (e) => {
    e.preventDefault();
    if (!nuevoValor.codigo || !nuevoValor.valor) return;

    const valorObj = {
      id: `v-${Date.now()}`,
      catalogo: catalogoSeleccionado.nombre,
      codigo: nuevoValor.codigo,
      valor: nuevoValor.valor,
      descripcion: nuevoValor.descripcion,
      seUsaEn: '0 registros',
      estado: nuevoValor.estado
    };

    setValores([...valores, valorObj]);
    setMostrarModal(false);
    setNuevoValor({
      codigo: '',
      valor: '',
      descripcion: '',
      orden: 1,
      estado: 'ACTIVO'
    });
  };

  const toggleEstadoValor = (id) => {
    setValores(valores.map(v => {
      if (v.id === id) {
        return {
          ...v,
          estado: v.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
        };
      }
      return v;
    }));
  };

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Listas de valores</h1>
          <p className="admin-page-header__subtitle">
            {catalogos.length} listas · {valores.length} valores en {catalogoSeleccionado.nombre}
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary">
            Exportar
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={() => setMostrarModal(true)}
          >
            Agregar valor
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="admin-card" style={{ padding: '14px 20px', marginBottom: '24px', background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '1rem' }}>ℹ</span>
          <div>
            <strong style={{ color: '#1e40af', fontSize: '0.88rem', display: 'block', marginBottom: '2px' }}>
              Los valores no se borran, se desactivan
            </strong>
            <p style={{ color: '#3b82f6', fontSize: '0.82rem', margin: 0 }}>
              Un valor que ya se usó en un partido, una nómina o un expediente queda para siempre en el histórico. Desactivarlo lo saca de los formularios nuevos sin romper lo ya registrado.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Catalog List + Values Table */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Catalogs List */}
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Listas</h2>
            <span className="admin-card__badge">{catalogos.length} listas</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {catalogos.map((cat) => {
              const isSelected = cat.id === catalogoSeleccionado.id;
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
        </div>

        {/* Right Column: Values Table */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h2 className="admin-card__title">{catalogoSeleccionado.nombre}</h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                {valores.length} valores · {valores.filter(v => v.estado === 'ACTIVO').length} activos
              </span>
            </div>
            <button 
              type="button" 
              className="admin-btn admin-btn--secondary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setMostrarModal(true)}
            >
              Agregar valor
            </button>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Valor</th>
                <th>Descripción</th>
                <th>Se usa en</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {valores.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.codigo}</strong></td>
                  <td style={{ color: 'var(--texto)', fontWeight: 600 }}>{v.valor}</td>
                  <td>{v.descripcion}</td>
                  <td>{v.seUsaEn}</td>
                  <td>
                    <span className={`badge-status ${v.estado === 'ACTIVO' ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                      {v.estado}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      type="button" 
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => toggleEstadoValor(v.id)}
                    >
                      {v.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Sub-13 inactiva notice if exists in categories */}
          {valores.some(v => v.codigo === 'CAT-U13' && v.estado === 'INACTIVO') && (
            <div className="admin-banner" style={{ margin: '16px 20px' }}>
              <strong>SUB-13 ESTÁ INACTIVA: </strong>
              No aparece al crear competencias nuevas, pero los registros históricos que la usan siguen mostrándola con normalidad.
            </div>
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
                    value={catalogoSeleccionado.nombre}
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
                      placeholder="Ej. CAT-U23"
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
                      placeholder="Ej. Sub-23"
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
                    placeholder="Ej. Nacidas a partir de 2003"
                    value={nuevoValor.descripcion}
                    onChange={(e) => setNuevoValor({ ...nuevoValor, descripcion: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Orden en la lista</label>
                    <input 
                      type="number" 
                      className="campo__input" 
                      min="1"
                      value={nuevoValor.orden}
                      onChange={(e) => setNuevoValor({ ...nuevoValor, orden: parseInt(e.target.value) || 1 })}
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

                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', marginTop: '16px', fontSize: '0.78rem', color: 'var(--texto-suave)' }}>
                  Ejemplo: al agregar «Sub-23», esa opción aparece en el campo Categoría al crear una competencia, registrar un equipo o una persona.
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
                <button type="submit" className="admin-btn admin-btn--primary">
                  Agregar valor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
