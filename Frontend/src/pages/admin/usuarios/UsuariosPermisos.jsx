import { useState, useMemo } from 'react';
import '../AdminCommon.css';

const USUARIOS_MOCK = [
  {
    id: '1',
    nombre: 'Gabriela Rojas',
    email: 'g.rojas@fecovol.cr',
    rol: 'Administración FECOVOL',
    alcance: 'Toda la Federación',
    ultimoIngreso: 'Hoy 14:20',
    estado: 'ACTIVA'
  },
  {
    id: '2',
    nombre: 'Andrés Vargas Solís',
    email: 'a.vargas@fecovol.cr',
    rol: 'Personal de competencias',
    alcance: 'Todas las competencias',
    ultimoIngreso: 'Hoy 09:12',
    estado: 'ACTIVA'
  },
  {
    id: '3',
    nombre: 'Luis Mora Brenes',
    email: 'l.mora@adcartago.cr',
    rol: 'Representante de asociación',
    alcance: 'Asoc. Cartago',
    ultimoIngreso: 'Ayer 18:40',
    estado: 'ACTIVA'
  },
  {
    id: '4',
    nombre: 'Ana Lucía Ramírez',
    email: 'a.ramirez@avsj.cr',
    rol: 'Representante de asociación',
    alcance: 'Asoc. San José',
    ultimoIngreso: '11 set',
    estado: 'ACTIVA'
  },
  {
    id: '5',
    nombre: 'Marta Vega González',
    email: 'm.vega@fecovol.cr',
    rol: 'Cuerpo arbitral',
    alcance: 'Sus designaciones',
    ultimoIngreso: 'Ayer 21:38',
    estado: 'ACTIVA'
  },
  {
    id: '6',
    nombre: 'Rodolfo Baltodano',
    email: 'r.baltodano@avg.cr',
    rol: 'Representante de asociación',
    alcance: 'Asoc. Guanacaste',
    ultimoIngreso: '28 ago',
    estado: 'SUSPENDIDA'
  }
];

export default function UsuariosPermisos() {
  const [usuarios, setUsuarios] = useState(USUARIOS_MOCK);
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  
  // Modal de crear usuario
  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre: '',
    email: '',
    telefono: '',
    rol: 'Personal de competencias',
    alcance: 'Todas las competencias',
    estado: 'ACTIVA'
  });

  // Modal de editar usuario
  const [usuarioEditando, setUsuarioEditando] = useState(null);

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter(u => {
      const matchRol = filtroRol === 'todos' || u.rol === filtroRol;
      const matchEstado = filtroEstado === 'todos' || u.estado === filtroEstado;
      const matchBusqueda = busqueda === '' || 
        u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        u.email.toLowerCase().includes(busqueda.toLowerCase());
      return matchRol && matchEstado && matchBusqueda;
    });
  }, [usuarios, filtroRol, filtroEstado, busqueda]);

  // Conteos
  const cuentasPorRol = useMemo(() => {
    return {
      admin: usuarios.filter(u => u.rol === 'Administración FECOVOL').length,
      personal: usuarios.filter(u => u.rol === 'Personal de competencias').length,
      asoc: usuarios.filter(u => u.rol === 'Representante de asociación').length,
      arbitro: usuarios.filter(u => u.rol === 'Cuerpo arbitral').length,
    };
  }, [usuarios]);

  const handleCrearUsuario = (e) => {
    e.preventDefault();
    if (!nuevoUsuario.email || !nuevoUsuario.nombre) return;

    const userObj = {
      id: Date.now().toString(),
      nombre: nuevoUsuario.nombre,
      email: nuevoUsuario.email,
      rol: nuevoUsuario.rol,
      alcance: nuevoUsuario.rol === 'Representante de asociación' ? nuevoUsuario.alcance : (nuevoUsuario.rol === 'Administración FECOVOL' ? 'Toda la Federación' : (nuevoUsuario.rol === 'Cuerpo arbitral' ? 'Sus designaciones' : 'Todas las competencias')),
      ultimoIngreso: 'Nunca',
      estado: nuevoUsuario.estado
    };

    setUsuarios([userObj, ...usuarios]);
    setMostrarModalCrear(false);
    setNuevoUsuario({
      nombre: '',
      email: '',
      telefono: '',
      rol: 'Personal de competencias',
      alcance: 'Todas las competencias',
      estado: 'ACTIVA'
    });
  };

  const handleGuardarEdicion = (e) => {
    e.preventDefault();
    if (!usuarioEditando) return;

    setUsuarios(usuarios.map(u => u.id === usuarioEditando.id ? usuarioEditando : u));
    setUsuarioEditando(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Usuarios y permisos</h1>
          <p className="admin-page-header__subtitle">{usuarios.filter(u => u.estado === 'ACTIVA').length} usuarios activos</p>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary">
            Exportar
          </button>
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={() => setMostrarModalCrear(true)}
          >
            Crear usuario
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-filters-bar">
        <select 
          className="admin-select"
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value)}
        >
          <option value="todos">Rol: todos</option>
          <option value="Administración FECOVOL">Administración FECOVOL</option>
          <option value="Personal de competencias">Personal de competencias</option>
          <option value="Representante de asociación">Representante de asociación</option>
          <option value="Cuerpo arbitral">Cuerpo arbitral</option>
        </select>

        <select 
          className="admin-select"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="todos">Estado: todos</option>
          <option value="ACTIVA">Activa</option>
          <option value="SUSPENDIDA">Suspendida</option>
        </select>

        <input 
          type="search"
          className="admin-input admin-input--search"
          placeholder="Buscar usuario o correo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Grid: Table + Side Cards */}
      <div className="admin-grid-layout">
        {/* Table card */}
        <div className="admin-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Alcance</th>
                <th>Último ingreso</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="admin-table__user-cell">
                      <span className="admin-table__user-name">{u.nombre}</span>
                      <span className="admin-table__user-email">{u.email}</span>
                    </div>
                  </td>
                  <td>{u.rol}</td>
                  <td>{u.alcance}</td>
                  <td>{u.ultimoIngreso}</td>
                  <td>
                    <span className={`badge-status ${u.estado === 'ACTIVA' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                      {u.estado}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      type="button" 
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      onClick={() => setUsuarioEditando({ ...u })}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                    No se encontraron usuarios que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="admin-table-footer">
            <span>{usuariosFiltrados.length} de {usuarios.length} usuarios mostrados</span>
            <div className="admin-pagination-links">
              <button type="button" disabled>&lt; Anterior</button>
              <button type="button" disabled>Siguiente &gt;</button>
            </div>
          </div>
        </div>

        {/* Side Cards */}
        <div>
          {/* Roles Breakdown */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Roles del sistema</h2>
              <p className="admin-side-card__subtitle">{usuarios.length} cuentas</p>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#c8102e' }} />
                  Administración FECOVOL
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.admin}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#1b6b31' }} />
                  Personal de competencias
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.personal}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#7c3aed' }} />
                  Representante de asociación
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.asoc}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#0e3b6b' }} />
                  Cuerpo arbitral
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.arbitro}</span>
              </li>
            </ul>
          </div>

          {/* Security stats */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Seguridad</h2>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Sesiones abiertas ahora</span>
                <strong style={{ color: 'var(--texto)' }}>9</strong>
              </li>
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Intentos fallidos hoy</span>
                <strong style={{ color: 'var(--texto)' }}>4</strong>
              </li>
              <li className="admin-side-card__item">
                <span style={{ color: 'var(--texto-suave)' }}>Cuentas sin ingresar en 90 días</span>
                <strong style={{ color: 'var(--texto)' }}>3</strong>
              </li>
              <li className="admin-side-card__item" style={{ borderTop: '1px solid var(--linea)', paddingTop: '8px' }}>
                <span style={{ color: 'var(--texto-suave)' }}>Último respaldo</span>
                <strong style={{ color: 'var(--texto)' }}>Hoy 03:00</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal: Crear Usuario */}
      {mostrarModalCrear && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '580px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Crear usuario</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModalCrear(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCrearUsuario}>
              <div className="admin-modal__body">
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '18px' }}>
                  La persona recibe un correo para definir su contraseña. El rol decide qué partes del sistema ve.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Nombre completo *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      placeholder="Ej. Esteban Mora Chaves"
                      value={nuevoUsuario.nombre}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Teléfono</label>
                    <input 
                      type="tel" 
                      className="campo__input" 
                      placeholder="8888-8888"
                      value={nuevoUsuario.telefono}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, telefono: e.target.value })}
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Correo de acceso *</label>
                  <input 
                    type="email" 
                    required 
                    className="campo__input" 
                    placeholder="usuario@fecovol.cr"
                    value={nuevoUsuario.email}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Rol en el sistema</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevoUsuario.rol}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                  >
                    <option value="Administración FECOVOL">Administración FECOVOL (Todo el sistema)</option>
                    <option value="Personal de competencias">Personal de competencias (Competencias, resultados)</option>
                    <option value="Representante de asociación">Representante de asociación (Solo su club)</option>
                    <option value="Cuerpo arbitral">Cuerpo arbitral (Sus designaciones)</option>
                  </select>
                </div>

                {nuevoUsuario.rol === 'Representante de asociación' && (
                  <div className="campo" style={{ marginBottom: '14px' }}>
                    <label className="campo__etiqueta">Asociación asignada *</label>
                    <select 
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevoUsuario.alcance}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, alcance: e.target.value })}
                    >
                      <option value="Asoc. Cartago">Asociación de Voleibol de Cartago</option>
                      <option value="Asoc. San José">Asociación de Voleibol de San José</option>
                      <option value="Asoc. Guanacaste">Asociación de Voleibol de Guanacaste</option>
                      <option value="Asoc. Alajuela">Asociación de Voleibol de Alajuela</option>
                    </select>
                  </div>
                )}

                <div className="campo">
                  <label className="campo__etiqueta">Estado inicial</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevoUsuario.estado}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, estado: e.target.value })}
                  >
                    <option value="ACTIVA">Activa</option>
                    <option value="SUSPENDIDA">Suspendida</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModalCrear(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Crear y enviar invitación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuario */}
      {usuarioEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar usuario</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setUsuarioEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicion}>
              <div className="admin-modal__body">
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre completo</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    value={usuarioEditando.nombre}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, nombre: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Correo</label>
                  <input 
                    type="email" 
                    disabled
                    className="campo__input" 
                    value={usuarioEditando.email}
                    style={{ opacity: 0.7 }}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Rol</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={usuarioEditando.rol}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, rol: e.target.value })}
                  >
                    <option value="Administración FECOVOL">Administración FECOVOL</option>
                    <option value="Personal de competencias">Personal de competencias</option>
                    <option value="Representante de asociación">Representante de asociación</option>
                    <option value="Cuerpo arbitral">Cuerpo arbitral</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Estado de la cuenta</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={usuarioEditando.estado}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, estado: e.target.value })}
                  >
                    <option value="ACTIVA">Activa</option>
                    <option value="SUSPENDIDA">Suspendida</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setUsuarioEditando(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
