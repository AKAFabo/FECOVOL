import { useState, useEffect, useMemo } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

export default function UsuariosPermisos() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [asociaciones, setAsociaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);

  // Filtros
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  
  // Modal de crear usuario (invitación por correo)
  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre: '',
    email: '',
    rolId: '',
    organizationId: '',
    estado: 'ACTIVA'
  });

  // Modal de editar usuario
  const [usuarioEditando, setUsuarioEditando] = useState(null);

  // 1. Cargar perfiles, roles y asociaciones desde Supabase
  async function cargarDatos() {
    setCargando(true);
    setError(null);
    try {
      const { data: rolesData, error: errRoles } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');
      if (errRoles) console.warn('Aviso al cargar roles:', errRoles);
      setRoles(rolesData || []);

      const { data: asocData } = await supabase
        .from('associations')
        .select('id, name')
        .order('name');
      setAsociaciones(asocData || []);

      const { data: profiles, error: errProfiles } = await supabase
        .from('user_profiles')
        .select(`
          id,
          email,
          full_name,
          status,
          last_login,
          role_id,
          organization_id,
          roles ( id, name )
        `)
        .order('created_at', { ascending: false });

      if (errProfiles) throw errProfiles;

      const formateados = (profiles || []).map((u) => {
        let alcance = 'Toda la Federación';
        const rolName = u.roles?.name || 'Sin rol';
        if (rolName === 'Representante') {
          const asoc = (asocData || []).find((a) => a.id === u.organization_id);
          alcance = asoc ? asoc.name : 'Asociación asignada';
        } else if (rolName === 'Arbitro') {
          alcance = 'Sus designaciones';
        } else if (rolName === 'Personal') {
          alcance = 'Todas las competencias';
        }

        return {
          id: u.id,
          nombre: u.full_name,
          email: u.email,
          rol: rolName,
          rolId: u.role_id,
          organizationId: u.organization_id,
          alcance,
          ultimoIngreso: u.last_login ? new Date(u.last_login).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca',
          estado: u.status || 'ACTIVA'
        };
      });

      setUsuarios(formateados);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError('No se pudieron cargar los usuarios de Supabase: ' + err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  // Filtrado
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

  // Al cambiar filtros volvemos a la página 1
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroRol, filtroEstado, busqueda]);

  // Paginación: 10 registros por página
  const totalPaginas = Math.ceil(usuariosFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  const usuariosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
    return usuariosFiltrados.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [usuariosFiltrados, paginaActual]);

  // Conteos para tarjeta lateral
  const cuentasPorRol = useMemo(() => {
    return {
      admin: usuarios.filter(u => u.rol === 'Administrador').length,
      personal: usuarios.filter(u => u.rol === 'Personal').length,
      asoc: usuarios.filter(u => u.rol === 'Representante').length,
      arbitro: usuarios.filter(u => u.rol === 'Arbitro').length,
    };
  }, [usuarios]);

  // Crear usuario con inviteUserByEmail (llamando a la API backend o función de invitación)
  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    if (!nuevoUsuario.email || !nuevoUsuario.nombre) return;

    setGuardando(true);
    try {
      // Llamada al endpoint backend que usa supabase.auth.admin.inviteUserByEmail
      const respuesta = await fetch('http://localhost:4000/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: nuevoUsuario.email,
          full_name: nuevoUsuario.nombre,
          role_id: nuevoUsuario.rolId || null,
          organization_id: nuevoUsuario.organizationId || null,
          status: nuevoUsuario.estado
        })
      });

      if (!respuesta.ok) {
        const errorData = await respuesta.json();
        throw new Error(errorData.error || 'Error al enviar la invitación');
      }

      setMostrarModalCrear(false);
      setNuevoUsuario({
        nombre: '',
        email: '',
        rolId: '',
        organizationId: '',
        estado: 'ACTIVA'
      });
      await cargarDatos();
      alert('Invitación enviada por correo al usuario con éxito.');
    } catch (err) {
      console.error('Error al invitar usuario:', err);
      alert('No se pudo enviar la invitación: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Guardar edición de usuario
  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!usuarioEditando) return;

    setGuardando(true);
    try {
      const { error: errUpdate } = await supabase
        .from('user_profiles')
        .update({
          full_name: usuarioEditando.nombre,
          role_id: usuarioEditando.rolId || null,
          status: usuarioEditando.estado,
          updated_at: new Date().toISOString()
        })
        .eq('id', usuarioEditando.id);

      if (errUpdate) throw errUpdate;

      setUsuarioEditando(null);
      await cargarDatos();
    } catch (err) {
      console.error('Error al editar usuario:', err);
      alert('Error al actualizar usuario: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Usuarios y permisos</h1>
          <p className="admin-page-header__subtitle">
            {usuarios.filter(u => u.estado === 'ACTIVA').length} usuarios activos
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button 
            type="button" 
            className="admin-btn admin-btn--primary"
            onClick={() => {
              setNuevoUsuario({
                nombre: '',
                email: '',
                rolId: roles[0]?.id || '',
                organizationId: '',
                estado: 'ACTIVA'
              });
              setMostrarModalCrear(true);
            }}
          >
            Crear usuario
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="admin-filters-bar">
        <select 
          className="admin-select"
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value)}
        >
          <option value="todos">Rol: todos</option>
          {roles.map(r => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
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
          {cargando ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
              Cargando usuarios desde Supabase...
            </div>
          ) : (
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
                {usuariosPaginados.map((u) => (
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
                {usuariosPaginados.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                      No se encontraron usuarios registrados en la base de datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Pagination Controls */}
          <div className="admin-table-footer">
            <span>
              Mostrando {usuariosPaginados.length} de {usuariosFiltrados.length} usuarios
              {totalPaginas > 1 && ` (Página ${paginaActual} de ${totalPaginas})`}
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
        </div>

        {/* Side Cards */}
        <div>
          {/* Roles Breakdown */}
          <div className="admin-side-card">
            <div className="admin-side-card__header">
              <h2 className="admin-side-card__title">Roles del sistema</h2>
              <p className="admin-side-card__subtitle">{usuarios.length} cuentas registradas</p>
            </div>
            <ul className="admin-side-card__list">
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#c8102e' }} />
                  Administrador
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.admin}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#1b6b31' }} />
                  Personal
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.personal}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#7c3aed' }} />
                  Representante
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.asoc}</span>
              </li>
              <li className="admin-side-card__item">
                <span className="admin-side-card__item-label">
                  <span className="admin-side-card__dot" style={{ background: '#0e3b6b' }} />
                  Arbitro
                </span>
                <span className="admin-side-card__item-val">{cuentasPorRol.arbitro}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal: Crear Usuario (InviteUserByEmail) */}
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
                <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '18px', lineHeight: 1.4 }}>
                  La persona recibirá una invitación por correo electrónico con un enlace para establecer su contraseña y acceder al sistema.
                </p>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre completo *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    placeholder="Ej. Laura Campos Morales"
                    value={nuevoUsuario.nombre}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                  />
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
                  <label className="campo__etiqueta">Rol en el sistema *</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevoUsuario.rolId}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rolId: e.target.value })}
                    required
                  >
                    <option value="">Seleccione un rol...</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                {asociaciones.length > 0 && (
                  <div className="campo" style={{ marginBottom: '14px' }}>
                    <label className="campo__etiqueta">Asociación (Opcional, para representantes)</label>
                    <select 
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevoUsuario.organizationId}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, organizationId: e.target.value })}
                    >
                      <option value="">Ninguna / Toda la Federación</option>
                      {asociaciones.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
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
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando}>
                  {guardando ? 'Enviando invitación…' : 'Crear y enviar invitación'}
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
                    value={usuarioEditando.rolId || ''}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, rolId: e.target.value })}
                  >
                    <option value="">Seleccione un rol...</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
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
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
