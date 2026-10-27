import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

export default function UsuariosPermisos() {
  const navigate = useNavigate();
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
    rolesIds: [],
    organizationId: '',
    estado: 'PENDIENTE_CONTRASENA'
  });

  // Modal de editar usuario
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [enviandoEnlace, setEnviandoEnlace] = useState(false);
  const [mensajeFeedbackModal, setMensajeFeedbackModal] = useState(null);

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

      // Cargar asociaciones vía Backend API (service_role para evitar bloqueo RLS)
      let asocs = [];
      try {
        const resAsoc = await fetch('http://localhost:4000/api/associations');
        if (resAsoc.ok) {
          const resJson = await resAsoc.json();
          asocs = resJson.data || [];
        }
      } catch (errApi) {
        console.warn('API backend no disponible para asociaciones, usando cliente Supabase:', errApi);
      }

      if (asocs.length === 0) {
        const { data: asocData } = await supabase
          .from('associations')
          .select('id, name, status')
          .order('name');
        asocs = asocData || [];
      }
      setAsociaciones(asocs);

      // 1. Intentar cargar perfiles vía Backend API (service_role para evitar filtrado por RLS)
      let profiles = null;
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        const resUsers = await fetch(`${backendUrl}/api/users`, {
          headers: { 'x-user-email': currentUser?.email || '' }
        });
        if (resUsers.ok) {
          const resJson = await resUsers.json();
          profiles = resJson.data;
        }
      } catch (backendErr) {
        console.warn('Backend API no disponible, consultando con cliente Supabase:', backendErr);
      }

      // 2. Si no se obtuvo de la API, consultar directamente con el cliente Supabase
      if (!profiles) {
        const { data: profilesDb, error: errProfiles } = await supabase
          .from('user_profiles')
          .select(`
            id,
            email,
            full_name,
            status,
            last_login,
            role_id,
            organization_id,
            roles:roles!user_profiles_role_id_fkey ( id, name ),
            user_roles ( role_id, roles ( id, name ) )
          `)
          .order('created_at', { ascending: false });

        if (errProfiles) throw errProfiles;
        profiles = profilesDb;
      }

      const formateados = (profiles || []).map((u) => {
        let alcance = 'Toda la Federación';
        
        // Roles múltiples o único
        let rolesIds = [];
        let rolesNombres = [];
        if (Array.isArray(u.role_ids) && u.role_ids.length > 0) {
          rolesIds = u.role_ids;
          rolesNombres = u.roles_names || [];
        } else if (Array.isArray(u.user_roles) && u.user_roles.length > 0) {
          rolesIds = u.user_roles.map(ur => ur.role_id || ur.roles?.id).filter(Boolean);
          rolesNombres = u.user_roles.map(ur => ur.roles?.name).filter(Boolean);
        } else if (u.role_id) {
          rolesIds = [u.role_id];
          rolesNombres = u.roles?.name ? [u.roles.name] : ['Sin rol'];
        }

        if (rolesNombres.length === 0) {
          rolesNombres = u.roles?.name ? [u.roles.name] : ['Sin rol'];
        }

        const rolName = rolesNombres.join(', ');
        const asoc = (asocs || []).find((a) => a.id === u.organization_id);

        if (asoc) {
          alcance = asoc.name;
        } else if (rolesNombres.includes('Representante')) {
          alcance = 'Asociación no asignada';
        } else if (rolesNombres.includes('Arbitro') && !rolesNombres.includes('Administrador')) {
          alcance = 'Sus designaciones';
        } else if (rolesNombres.includes('Personal') && !rolesNombres.includes('Administrador')) {
          alcance = 'Todas las competencias';
        }

        return {
          id: u.id,
          nombre: u.full_name,
          email: u.email,
          rol: rolName,
          rolId: u.role_id || rolesIds[0] || null,
          rolesIds,
          rolesNombres,
          organizationId: u.organization_id,
          asociacionNombre: asoc ? asoc.name : null,
          asociacionEstado: asoc ? asoc.status : null,
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
      const matchRol = filtroRol === 'todos' || (u.rolesNombres && u.rolesNombres.includes(filtroRol)) || u.rol === filtroRol;
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
      admin: usuarios.filter(u => u.rolesNombres?.includes('Administrador') || u.rol === 'Administrador').length,
      personal: usuarios.filter(u => u.rolesNombres?.includes('Personal') || u.rol === 'Personal').length,
      asoc: usuarios.filter(u => u.rolesNombres?.includes('Representante') || u.rol === 'Representante').length,
      arbitro: usuarios.filter(u => u.rolesNombres?.includes('Arbitro') || u.rol === 'Arbitro').length,
    };
  }, [usuarios]);

  // Crear usuario con inviteUserByEmail (llamando a la API backend o función de invitación)
  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    if (!nuevoUsuario.email || !nuevoUsuario.nombre) return;
    if (!nuevoUsuario.rolesIds || nuevoUsuario.rolesIds.length === 0) {
      alert('Debe seleccionar al menos un rol para el usuario.');
      return;
    }

    setGuardando(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const respuesta = await fetch(`${backendUrl}/api/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        },
        body: JSON.stringify({
          email: nuevoUsuario.email,
          full_name: nuevoUsuario.nombre,
          role_id: nuevoUsuario.rolesIds[0] || null,
          role_ids: nuevoUsuario.rolesIds,
          organization_id: nuevoUsuario.organizationId || null,
          status: nuevoUsuario.estado,
          admin_email: currentUser?.email || 'Administrador'
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
        rolesIds: roles[0] ? [roles[0].id] : [],
        organizationId: '',
        estado: 'PENDIENTE_CONTRASENA'
      });
      await cargarDatos();
      alert('Invitación enviada por correo al usuario con éxito y registrada en la bitácora.');
    } catch (err) {
      console.error('Error al invitar usuario:', err);
      alert('No se pudo enviar la invitación: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Reenviar enlace para definir/restablecer contraseña desde modal de edición (RF-SEG-009)
  const handleReenviarEnlaceContrasena = async () => {
    if (!usuarioEditando) return;
    if (usuarioEditando.estado === 'SUSPENDIDA') {
      setMensajeFeedbackModal({
        tipo: 'error',
        texto: 'Operación denegada: No se puede enviar un enlace de acceso a una cuenta suspendida. Active la cuenta previamente si desea otorgarle acceso.'
      });
      return;
    }

    const confirmar = window.confirm(
      `¿Desea enviar un enlace por correo electrónico a ${usuarioEditando.email} para que establezca su contraseña?\n\nLa cuenta quedará en estado "Contraseña pendiente" hasta que el usuario complete el proceso.`
    );
    if (!confirmar) return;

    setEnviandoEnlace(true);
    setMensajeFeedbackModal(null);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/users/resend-password-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        },
        body: JSON.stringify({
          user_id: usuarioEditando.id,
          email: usuarioEditando.email,
          admin_email: currentUser?.email || 'Administrador'
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'No se pudo enviar el enlace');
      }

      // Actualizar el estado en el modal si pasó a PENDIENTE_CONTRASENA
      setUsuarioEditando(prev => ({
        ...prev,
        estado: resJson.nuevoEstado || 'PENDIENTE_CONTRASENA'
      }));

      setMensajeFeedbackModal({
        tipo: 'exito',
        texto: `✓ Enlace enviado exitosamente a ${usuarioEditando.email} y registrado en la bitácora de auditoría.`
      });

      // Refrescar tabla en segundo plano
      cargarDatos();
    } catch (err) {
      console.error('Error al reenviar enlace de contraseña:', err);
      setMensajeFeedbackModal({
        tipo: 'error',
        texto: err.message
      });
    } finally {
      setEnviandoEnlace(false);
    }
  };

  // Detectar si el usuario que se está editando es el único administrador activo (RF-SEG-004 / RF-SEG-006)
  const esUnicoAdminActivo = useMemo(() => {
    if (!usuarioEditando) return false;
    const original = usuarios.find(u => u.id === usuarioEditando.id);
    if (!original || !(original.rolesNombres?.includes('Administrador') || original.rol === 'Administrador') || original.estado !== 'ACTIVA') return false;
    const totalAdminsActivos = usuarios.filter(u => (u.rolesNombres?.includes('Administrador') || u.rol === 'Administrador') && u.estado === 'ACTIVA').length;
    return totalAdminsActivos <= 1;
  }, [usuarioEditando, usuarios]);

  // Guardar edición de usuario
  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!usuarioEditando) return;

    // Validación preventiva: toda cuenta activa debe tener al menos un rol asignado (RF-SEG-006)
    if (usuarioEditando.estado === 'ACTIVA' && (!usuarioEditando.rolesIds || usuarioEditando.rolesIds.length === 0)) {
      alert('Operación no permitida: Toda cuenta activa debe tener al menos un rol asignado.');
      return;
    }

    setGuardando(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const usuarioOriginal = usuarios.find(u => u.id === usuarioEditando.id);
      
      const origIds = (usuarioOriginal?.rolesIds || [usuarioOriginal?.rolId]).filter(Boolean).sort().join(',');
      const newIds = (usuarioEditando.rolesIds || []).filter(Boolean).sort().join(',');
      const rolCambio = origIds !== newIds;

      const estadoCambio = usuarioOriginal && (
        (usuarioEditando.estado === 'SUSPENDIDA' && usuarioOriginal.estado !== 'SUSPENDIDA') ||
        (usuarioEditando.estado === 'PENDIENTE_CONTRASENA' && usuarioOriginal.estado !== 'PENDIENTE_CONTRASENA')
      );
      const esMismoUsuario = currentUser && currentUser.id === usuarioEditando.id;

      // Validación preventiva: Impedir desactivar o quitar rol admin al único Administrador activo (RF-SEG-004)
      const adminRole = roles.find(r => r.name === 'Administrador');
      const perdioAdmin = adminRole && !usuarioEditando.rolesIds.includes(adminRole.id);
      const desactivoCuenta = usuarioEditando.estado !== 'ACTIVA';

      if (esUnicoAdminActivo && (perdioAdmin || desactivoCuenta)) {
        alert(
          'Operación no permitida: Esta es la única cuenta de Administrador activa en el sistema. ' +
          'No puede ser suspendida ni despojada del rol Administrador para garantizar la continuidad del acceso administrativo.'
        );
        setGuardando(false);
        return;
      }

      // Intentar actualizar vía Backend API (service_role)
      let actualizado = false;
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        const resUpdate = await fetch(`${backendUrl}/api/users/${usuarioEditando.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': currentUser?.email || ''
          },
          body: JSON.stringify({
            full_name: usuarioEditando.nombre,
            role_id: usuarioEditando.rolesIds[0] || null,
            role_ids: usuarioEditando.rolesIds,
            organization_id: usuarioEditando.organizationId || null,
            status: usuarioEditando.estado,
            admin_email: currentUser?.email || 'Administrador'
          })
        });
        if (resUpdate.ok) {
          actualizado = true;
        } else {
          const errData = await resUpdate.json();
          throw new Error(errData.error || 'Error al actualizar usuario');
        }
      } catch (errApi) {
        if (errApi.message && errApi.message.includes('Operación')) {
          throw errApi;
        }
        console.warn('API backend no disponible para actualizar usuario, usando cliente Supabase:', errApi);
      }

      // Fallback: actualizar directamente con cliente Supabase
      if (!actualizado) {
        const { error: errUpdate } = await supabase
          .from('user_profiles')
          .update({
            full_name: usuarioEditando.nombre,
            role_id: usuarioEditando.rolesIds[0] || null,
            organization_id: usuarioEditando.organizationId || null,
            status: usuarioEditando.estado,
            updated_at: new Date().toISOString()
          })
          .eq('id', usuarioEditando.id);

        if (errUpdate) throw errUpdate;

        // Sync user_roles
        try {
          await supabase.from('user_roles').delete().eq('user_id', usuarioEditando.id);
          if (usuarioEditando.rolesIds.length > 0) {
            const inserts = usuarioEditando.rolesIds.map(rId => ({
              user_id: usuarioEditando.id,
              role_id: rId
            }));
            await supabase.from('user_roles').insert(inserts);
          }
        } catch (eUr) {
          console.warn('user_roles fallback sync warning:', eUr);
        }

        // Si cambió el rol o estado y no pasó por backend, auditarlo directo
        if (rolCambio || estadoCambio) {
          const razon = rolCambio 
            ? 'Revocación de sesión por cambio de rol' 
            : `Revocación de sesión por cambio de estado a ${usuarioEditando.estado}`;
          try {
            await supabase.from('audit_logs').insert([{
              usuario: currentUser?.email || 'Administrador',
              accion: 'LOGOUT',
              tabla: 'auth.users',
              registro_id: usuarioEditando.id,
              registro_nuevo: {
                evento: razon,
                email: usuarioEditando.email,
                nuevos_roles: usuarioEditando.rolesIds,
                nuevo_estado: usuarioEditando.estado,
                razon
              }
            }]);
          } catch (e) {}
        }
      }

      // Si el administrador editó el rol o suspendió SU PROPIA cuenta, cerrar su sesión de inmediato
      if (esMismoUsuario && (rolCambio || estadoCambio)) {
        alert(
          rolCambio
            ? 'Ha modificado los roles de su propia cuenta. Su sesión se cerrará para aplicar los nuevos permisos.'
            : `Ha modificado el estado de su propia cuenta a ${usuarioEditando.estado}. Su sesión ha sido finalizada.`
        );
        await supabase.auth.signOut();
        navigate('/ingresar', {
          state: {
            mensaje: rolCambio
              ? 'Sus roles de usuario fueron actualizados. Inicie sesión nuevamente para acceder con sus nuevos permisos.'
              : `Su cuenta ahora se encuentra en estado ${usuarioEditando.estado}.`,
            vista: 'login'
          },
          replace: true
        });
        return;
      }

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
                rolesIds: roles[0] ? [roles[0].id] : [],
                organizationId: '',
                estado: 'PENDIENTE_CONTRASENA'
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
          <option value="PENDIENTE_CONTRASENA">Contraseña pendiente</option>
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
                  <th>Asociación / Alcance</th>
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
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(u.rolesNombres && u.rolesNombres.length > 0 ? u.rolesNombres : [u.rol]).map((rn, idx) => (
                          <span 
                            key={idx}
                            className="badge-status"
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              fontWeight: 600,
                              background: rn === 'Administrador' ? '#fee2e2' : rn === 'Personal' ? '#dcfce7' : rn === 'Representante' ? '#f3e8ff' : '#e0f2fe',
                              color: rn === 'Administrador' ? '#991b1b' : rn === 'Personal' ? '#166534' : rn === 'Representante' ? '#6b21a8' : '#075985',
                              border: `1px solid ${rn === 'Administrador' ? '#fca5a5' : rn === 'Personal' ? '#86efac' : rn === 'Representante' ? '#d8b4fe' : '#7dd3fc'}`
                            }}
                          >
                            {rn}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {u.asociacionNombre ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--texto)' }}>{u.asociacionNombre}</span>
                          {u.asociacionEstado && (
                            <span style={{ 
                              fontSize: '0.72rem', 
                              fontWeight: 700,
                              color: (u.asociacionEstado === 'SUSPENDIDA' || u.asociacionEstado === 'DESAFILIADA') ? '#dc2626' : '#16a34a' 
                            }}>
                              {u.asociacionEstado === 'AFILIADA' ? '● Activa (Afiliada)' : `● Inactiva (${u.asociacionEstado})`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--texto-suave)' }}>{u.alcance}</span>
                      )}
                    </td>
                    <td>{u.ultimoIngreso}</td>
                    <td>
                      {u.estado === 'ACTIVA' && (
                        <span className="badge-status badge-status--activa">Activa</span>
                      )}
                      {u.estado === 'PENDIENTE_CONTRASENA' && (
                        <span className="badge-status" style={{ background: '#fef3c7', color: '#b45309' }}>
                          Contraseña pendiente
                        </span>
                      )}
                      {u.estado === 'SUSPENDIDA' && (
                        <span className="badge-status badge-status--suspendida">Suspendida</span>
                      )}
                      {u.estado !== 'ACTIVA' && u.estado !== 'PENDIENTE_CONTRASENA' && u.estado !== 'SUSPENDIDA' && (
                        <span className="badge-status">{u.estado}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          type="button" 
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => {
                            setMensajeFeedbackModal(null);
                            setUsuarioEditando({ 
                              ...u,
                              rolesIds: u.rolesIds ? [...u.rolesIds] : (u.rolId ? [u.rolId] : [])
                            });
                          }}
                        >
                          Editar
                        </button>
                        <button 
                          type="button" 
                          className="admin-btn admin-btn--secondary"
                          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                          onClick={() => navigate(`/admin/auditoria?tabla=user_profiles&registroId=${u.id}`)}
                          title="Ver historial de este usuario en la bitácora"
                        >
                          Bitácora
                        </button>
                      </div>
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
                  <label className="campo__etiqueta">Roles en el sistema * (Seleccione uno o varios)</label>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '8px', 
                    padding: '12px', 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '6px' 
                  }}>
                    {roles.map(r => {
                      const seleccionado = nuevoUsuario.rolesIds?.includes(r.id);
                      return (
                        <label 
                          key={r.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            fontSize: '0.85rem', 
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={seleccionado || false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNuevoUsuario(prev => ({
                                ...prev,
                                rolesIds: checked 
                                  ? [...(prev.rolesIds || []), r.id] 
                                  : (prev.rolesIds || []).filter(id => id !== r.id)
                              }));
                            }}
                          />
                          <span style={{ fontWeight: seleccionado ? 600 : 400 }}>{r.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(!nuevoUsuario.rolesIds || nuevoUsuario.rolesIds.length === 0) && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px', display: 'block' }}>
                      * Debe seleccionar al menos un rol para el usuario
                    </span>
                  )}
                </div>

                {asociaciones.length > 0 && (
                  <div className="campo" style={{ marginBottom: '14px' }}>
                    <label className="campo__etiqueta">Asociación vinculada</label>
                    <select 
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevoUsuario.organizationId}
                      onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, organizationId: e.target.value })}
                    >
                      <option value="">Ninguna / Toda la Federación</option>
                      {asociaciones.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
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
                    <option value="PENDIENTE_CONTRASENA">Contraseña pendiente (Recomendado)</option>
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
                {mensajeFeedbackModal && (
                  <div 
                    className={`alerta ${mensajeFeedbackModal.tipo === 'error' ? 'alerta--error' : ''}`}
                    style={{
                      marginBottom: '16px',
                      ...(mensajeFeedbackModal.tipo === 'exito' ? {
                        background: '#dcfce7',
                        color: '#166534',
                        border: '1px solid #bbf7d0'
                      } : {})
                    }}
                    role="alert"
                  >
                    {mensajeFeedbackModal.texto}
                  </div>
                )}

                {esUnicoAdminActivo && (
                  <div style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    border: '1px solid #fde68a',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    fontSize: '0.82rem',
                    lineHeight: '1.4'
                  }}>
                    🛡️ <strong>Única cuenta de Administrador activa:</strong> Esta cuenta es el único Administrador con estado activo en el sistema. Su rol y estado están protegidos contra desactivación para garantizar la continuidad del acceso administrativo.
                  </div>
                )}

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
                  <label className="campo__etiqueta">
                    Roles en el sistema * (Seleccione uno o varios)
                    {esUnicoAdminActivo && <span style={{ color: '#b45309', fontWeight: 'normal', fontSize: '0.78rem' }}> (Rol Administrador protegido: único admin)</span>}
                  </label>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '8px', 
                    padding: '12px', 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '6px' 
                  }}>
                    {roles.map(r => {
                      const esAdminRol = r.name === 'Administrador';
                      const deshabilitado = esUnicoAdminActivo && esAdminRol;
                      const seleccionado = usuarioEditando.rolesIds?.includes(r.id);
                      return (
                        <label 
                          key={r.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            fontSize: '0.85rem', 
                            cursor: deshabilitado ? 'not-allowed' : 'pointer',
                            opacity: deshabilitado ? 0.8 : 1,
                            userSelect: 'none'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={seleccionado || false}
                            disabled={deshabilitado}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setUsuarioEditando(prev => ({
                                ...prev,
                                rolesIds: checked 
                                  ? [...(prev.rolesIds || []), r.id] 
                                  : (prev.rolesIds || []).filter(id => id !== r.id)
                              }));
                            }}
                          />
                          <span style={{ fontWeight: seleccionado ? 600 : 400 }}>
                            {r.name} {deshabilitado && '🔒'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {usuarioEditando.estado === 'ACTIVA' && (!usuarioEditando.rolesIds || usuarioEditando.rolesIds.length === 0) && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px', display: 'block' }}>
                      * Una cuenta activa no puede quedar sin roles
                    </span>
                  )}
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Asociación vinculada</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={usuarioEditando.organizationId || ''}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, organizationId: e.target.value || null })}
                  >
                    <option value="">Ninguna / Toda la Federación</option>
                    {asociaciones.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">
                    Estado de la cuenta {esUnicoAdminActivo && <span style={{ color: '#b45309', fontWeight: 'normal', fontSize: '0.78rem' }}>(Protegido: debe permanecer activa)</span>}
                  </label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%', ...(esUnicoAdminActivo ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}) }}
                    value={usuarioEditando.estado}
                    onChange={(e) => setUsuarioEditando({ ...usuarioEditando, estado: e.target.value })}
                    disabled={esUnicoAdminActivo}
                  >
                    <option value="ACTIVA">Activa</option>
                    <option value="PENDIENTE_CONTRASENA">Contraseña pendiente</option>
                    <option value="SUSPENDIDA">Suspendida</option>
                  </select>
                </div>
              </div>

              <div 
                className="admin-modal__footer" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  flexWrap: 'wrap', 
                  gap: '10px' 
                }}
              >
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderColor: usuarioEditando.estado === 'SUSPENDIDA' ? '#e2e8f0' : '#cbd5e1',
                    color: usuarioEditando.estado === 'SUSPENDIDA' ? 'var(--texto-mudo)' : '#0e3b6b',
                    fontWeight: 600,
                    cursor: usuarioEditando.estado === 'SUSPENDIDA' ? 'not-allowed' : 'pointer'
                  }}
                  onClick={handleReenviarEnlaceContrasena}
                  disabled={enviandoEnlace || guardando || usuarioEditando.estado === 'SUSPENDIDA'}
                  title={
                    usuarioEditando.estado === 'SUSPENDIDA'
                      ? 'No se puede enviar un enlace de acceso a una cuenta suspendida'
                      : 'Reenviar enlace para definir o restablecer contraseña'
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>{enviandoEnlace ? 'Enviando enlace…' : 'Reenviar enlace de contraseña'}</span>
                </button>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="admin-btn admin-btn--secondary"
                    onClick={() => setUsuarioEditando(null)}
                    disabled={enviandoEnlace || guardando}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={guardando || enviandoEnlace}>
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
