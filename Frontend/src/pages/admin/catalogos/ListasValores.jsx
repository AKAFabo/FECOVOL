import { useState, useEffect, useMemo } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';

const ELEMENTOS_POR_PAGINA = 10;

// Matriz oficial de subrutas y entornos accesibles del sistema (RF-SEG-005)
export const PANTALLAS_SISTEMA = [
  // ── Entornos Principales del Sistema (Vistas por Rol) ──
  { 
    key: '/admin', 
    categoria: 'Entornos del Sistema (Vistas de Rol)', 
    nombre: 'Entorno de Administración (/admin)', 
    ruta: '/admin', 
    desc: 'Acceso a la plataforma administrativa central FECOVOL' 
  },
  { 
    key: '/arbitro', 
    categoria: 'Entornos del Sistema (Vistas de Rol)', 
    nombre: 'Entorno de Cuerpo Arbitral (/arbitro)', 
    ruta: '/arbitro', 
    desc: 'Portal de designaciones arbitrales, actas de juego y reportes' 
  },
  { 
    key: '/asociacion', 
    categoria: 'Entornos del Sistema (Vistas de Rol)', 
    nombre: 'Entorno de Representante de Asociación (/asociacion)', 
    ruta: '/asociacion', 
    desc: 'Portal de comités y gestión de equipos y personas afiliadas' 
  },
  { 
    key: '/personal', 
    categoria: 'Entornos del Sistema (Vistas de Rol)', 
    nombre: 'Entorno de Personal Técnico (/personal)', 
    ruta: '/personal', 
    desc: 'Portal de personal de competencias y control operativo' 
  },

  // ── Subrutas y Módulos de Administración (/admin/*) ──
  { 
    key: '/admin/usuarios', 
    categoria: 'Módulos Administrativos', 
    nombre: 'Usuarios y Permisos (/admin/usuarios)', 
    ruta: '/admin/usuarios', 
    desc: 'Gestión y control de cuentas, asignación de roles y estados' 
  },
  { 
    key: '/admin/listas-valores', 
    categoria: 'Módulos Administrativos', 
    nombre: 'Listas de Valores y Roles (/admin/listas-valores)', 
    ruta: '/admin/listas-valores', 
    desc: 'Gestión de roles del sistema, permisos, asociaciones y catálogos' 
  },
  { 
    key: '/admin/auditoria', 
    categoria: 'Módulos Administrativos', 
    nombre: 'Auditoría y Bitácora (/admin/auditoria)', 
    ruta: '/admin/auditoria', 
    desc: 'Bitácora oficial de eventos del sistema, inicios de sesión y trazabilidad' 
  },
  { 
    key: '/admin/perfil', 
    categoria: 'Módulos Administrativos', 
    nombre: 'Perfil y Sesiones Activas (/admin/perfil)', 
    ruta: '/admin/perfil', 
    desc: 'Cambio de contraseña y monitoreo de sesiones activas' 
  }
];

export default function ListasValores() {
  // Vista actual: 'catalogo' | 'roles' | 'asociaciones'
  const [tipoVista, setTipoVista] = useState('catalogo');

  // Estado Catálogos Generales
  const [catalogos, setCatalogos] = useState([]);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState(null);
  const [valores, setValores] = useState([]);
  const [paginaValores, setPaginaValores] = useState(1);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [cargandoValores, setCargandoValores] = useState(false);
  const [error, setError] = useState(null);

  // Estado Roles del Sistema (RF-SEG-005)
  const [rolesList, setRolesList] = useState([]);
  const [cargandoRoles, setCargandoRoles] = useState(false);
  const [paginaRoles, setPaginaRoles] = useState(1);
  const [mostrarModalCrearRol, setMostrarModalCrearRol] = useState(false);
  const [rolEditando, setRolEditando] = useState(null);
  const [rolPermisosEditando, setRolPermisosEditando] = useState(null);
  const [guardandoRol, setGuardandoRol] = useState(false);
  const [nuevoRol, setNuevoRol] = useState({
    name: '',
    description: '',
    permissions: ['/admin']
  });

  // Estado Asociaciones Afiliadas (RF-SEG-005 - Apartado Entidades)
  const [asociacionesList, setAsociacionesList] = useState([]);
  const [cargandoAsociaciones, setCargandoAsociaciones] = useState(false);
  const [paginaAsociaciones, setPaginaAsociaciones] = useState(1);

  // Modal de agregar valor de catálogo
  const [mostrarModalValor, setMostrarModalValor] = useState(false);
  const [guardandoValor, setGuardandoValor] = useState(false);
  const [nuevoValor, setNuevoValor] = useState({
    codigo: '',
    valor: '',
    descripcion: '',
    estado: 'ACTIVO'
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  // ==========================================
  // 1. CARGA DE DATOS: Catálogos, Roles, Asociaciones
  // ==========================================

  // Cargar lista de catálogos generales
  async function cargarCatalogos() {
    setCargandoCatalogos(true);
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
      if (formateados.length > 0 && !catalogoSeleccionado && tipoVista === 'catalogo') {
        setCatalogoSeleccionado(formateados[0]);
      }
    } catch (err) {
      console.error('Error al cargar catálogos:', err);
      setError('No se pudieron cargar los catálogos generales.');
    } finally {
      setCargandoCatalogos(false);
    }
  }

  // Cargar valores del catálogo seleccionado
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

  // Cargar roles y sus permisos (RF-SEG-005)
  async function cargarRoles() {
    setCargandoRoles(true);
    try {
      // 1. Intentar cargar vía API backend
      let rolesData = null;
      try {
        const res = await fetch(`${backendUrl}/api/roles`);
        if (res.ok) {
          const resJson = await res.json();
          rolesData = resJson.data;
        }
      } catch (e) {
        console.warn('API /api/roles no disponible, usando cliente Supabase:', e);
      }

      // 2. Fallback con cliente Supabase
      if (!rolesData) {
        const { data: rolesDb } = await supabase.from('roles').select('id, name, description').order('name');
        const { data: permsDb } = await supabase.from('role_permissions').select('role_id, screen_key');
        const { data: uRoles } = await supabase.from('user_roles').select('role_id, user_id');

        const permsMap = {};
        (permsDb || []).forEach(p => {
          if (!permsMap[p.role_id]) permsMap[p.role_id] = [];
          permsMap[p.role_id].push(p.screen_key);
        });

        const usersCountMap = {};
        (uRoles || []).forEach(ur => {
          usersCountMap[ur.role_id] = (usersCountMap[ur.role_id] || 0) + 1;
        });

        rolesData = (rolesDb || []).map(r => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          permissions: permsMap[r.id] || (
            r.name === 'Administrador' ? PANTALLAS_SISTEMA.map(p => p.key) :
            r.name === 'Arbitro' ? ['/arbitro'] :
            r.name === 'Personal' ? ['/personal'] :
            r.name === 'Representante' ? ['/asociacion'] : ['/admin']
          ),
          assigned_users_count: usersCountMap[r.id] || 0,
          is_system_role: ['Administrador', 'Personal', 'Representante', 'Arbitro'].includes(r.name)
        }));
      }

      setRolesList(rolesData || []);
    } catch (err) {
      console.error('Error al cargar roles:', err);
    } finally {
      setCargandoRoles(false);
    }
  }

  // Cargar asociaciones afiliadas desde public.associations
  async function cargarAsociaciones() {
    setCargandoAsociaciones(true);
    try {
      let asocs = [];
      try {
        const res = await fetch(`${backendUrl}/api/associations`);
        if (res.ok) {
          const json = await res.json();
          asocs = json.data || [];
        }
      } catch (e) {
        console.warn('API /api/associations no disponible, usando cliente Supabase:', e);
      }

      if (asocs.length === 0) {
        const { data } = await supabase
          .from('associations')
          .select('id, name, short_name, tax_id, province, canton, status, affiliation_date')
          .order('name');
        asocs = data || [];
      }

      setAsociacionesList(asocs);
    } catch (err) {
      console.error('Error al cargar asociaciones:', err);
    } finally {
      setCargandoAsociaciones(false);
    }
  }

  // Carga inicial
  useEffect(() => {
    cargarCatalogos();
    cargarRoles();
    cargarAsociaciones();
  }, []);

  useEffect(() => {
    if (tipoVista === 'catalogo' && catalogoSeleccionado) {
      setPaginaValores(1);
      cargarValores(catalogoSeleccionado.id);
    }
  }, [tipoVista, catalogoSeleccionado]);

  // ==========================================
  // 2. PAGINACIÓN
  // ==========================================
  const totalPaginasValores = Math.ceil(valores.length / ELEMENTOS_POR_PAGINA) || 1;
  const valoresPaginados = useMemo(() => {
    const inicio = (paginaValores - 1) * ELEMENTOS_POR_PAGINA;
    return valores.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [valores, paginaValores]);

  const totalPaginasRoles = Math.ceil(rolesList.length / ELEMENTOS_POR_PAGINA) || 1;
  const rolesPaginados = useMemo(() => {
    const inicio = (paginaRoles - 1) * ELEMENTOS_POR_PAGINA;
    return rolesList.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [rolesList, paginaRoles]);

  const totalPaginasAsocs = Math.ceil(asociacionesList.length / ELEMENTOS_POR_PAGINA) || 1;
  const asociacionesPaginadas = useMemo(() => {
    const inicio = (paginaAsociaciones - 1) * ELEMENTOS_POR_PAGINA;
    return asociacionesList.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [asociacionesList, paginaAsociaciones]);

  // ==========================================
  // 3. OPERACIONES CRUD: VALORES DE CATÁLOGO
  // ==========================================
  const handleAgregarValor = async (e) => {
    e.preventDefault();
    if (!nuevoValor.codigo.trim() || !nuevoValor.valor.trim() || !catalogoSeleccionado) return;

    setGuardandoValor(true);
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

      setMostrarModalValor(false);
      setNuevoValor({
        codigo: '',
        valor: '',
        descripcion: '',
        estado: 'ACTIVO'
      });
      await cargarValores(catalogoSeleccionado.id);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al guardar valor:', err);
      alert('Error al guardar el valor: ' + (err.message || 'Código duplicado o error de servidor'));
    } finally {
      setGuardandoValor(false);
    }
  };

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

  // ==========================================
  // 4. OPERACIONES CRUD Y PERMISOS: ROLES (RF-SEG-005)
  // ==========================================

  // Crear nuevo rol
  const handleCrearRol = async (e) => {
    e.preventDefault();
    if (!nuevoRol.name.trim()) return;

    setGuardandoRol(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${backendUrl}/api/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user?.email || ''
        },
        body: JSON.stringify({
          name: nuevoRol.name.trim(),
          description: nuevoRol.description.trim(),
          permissions: nuevoRol.permissions,
          admin_email: user?.email || 'Administrador'
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Error al crear el rol');
      }

      setMostrarModalCrearRol(false);
      setNuevoRol({ name: '', description: '', permissions: ['/admin'] });
      await cargarRoles();
      alert(`Rol "${resJson.data?.name || nuevoRol.name}" creado con éxito.`);
    } catch (err) {
      console.error('Error al crear rol:', err);
      alert(err.message);
    } finally {
      setGuardandoRol(false);
    }
  };

  // Guardar edición de datos básicos del rol
  const handleGuardarEdicionRol = async (e) => {
    e.preventDefault();
    if (!rolEditando || !rolEditando.name.trim()) return;

    setGuardandoRol(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${backendUrl}/api/roles/${rolEditando.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user?.email || ''
        },
        body: JSON.stringify({
          name: rolEditando.name.trim(),
          description: rolEditando.description?.trim(),
          admin_email: user?.email || 'Administrador'
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Error al actualizar el rol');
      }

      setRolEditando(null);
      await cargarRoles();
      alert('Rol actualizado con éxito.');
    } catch (err) {
      console.error('Error al editar rol:', err);
      alert(err.message);
    } finally {
      setGuardandoRol(false);
    }
  };

  // Guardar matriz de permisos de un rol (RF-SEG-005)
  const handleGuardarPermisosRol = async (e) => {
    e.preventDefault();
    if (!rolPermisosEditando) return;

    setGuardandoRol(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${backendUrl}/api/roles/${rolPermisosEditando.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user?.email || ''
        },
        body: JSON.stringify({
          permissions: rolPermisosEditando.permissions,
          admin_email: user?.email || 'Administrador'
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Error al guardar permisos');
      }

      setRolPermisosEditando(null);
      await cargarRoles();
      alert(`Matriz de permisos para "${rolPermisosEditando.name}" actualizada con éxito y registrada en la bitácora.`);
    } catch (err) {
      console.error('Error al actualizar permisos:', err);
      alert(err.message);
    } finally {
      setGuardandoRol(false);
    }
  };

  // Eliminar rol con validación preventiva de cuentas asignadas (RF-SEG-005 Criterio 5)
  const handleEliminarRol = async (rol) => {
    if (rol.name === 'Administrador') {
      alert('Operación no permitida: El rol Administrador es fundamental para el sistema y no puede ser eliminado.');
      return;
    }

    if (rol.assigned_users_count > 0) {
      alert(
        `Operación denegada: El rol "${rol.name}" tiene ${rol.assigned_users_count} cuenta(s) de usuario asignada(s).\n\n` +
        'Debe reasignar o desvincular a los usuarios de este rol en "Usuarios y permisos" antes de poder eliminarlo.'
      );
      return;
    }

    const confirmar = window.confirm(
      `¿Está seguro de eliminar el rol "${rol.name}" del sistema?\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${backendUrl}/api/roles/${rol.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user?.email || ''
        },
        body: JSON.stringify({ admin_email: user?.email || 'Administrador' })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'No se pudo eliminar el rol');
      }

      await cargarRoles();
      alert(resJson.message || `Rol "${rol.name}" eliminado con éxito.`);
    } catch (err) {
      console.error('Error al eliminar rol:', err);
      alert(err.message);
    }
  };

  // Toggle estado de asociación afiliada
  const toggleEstadoAsociacion = async (asoc) => {
    const nuevoEstado = asoc.status === 'AFILIADA' ? 'SUSPENDIDA' : 'AFILIADA';
    const confirmar = window.confirm(
      `¿Desea cambiar el estado de la asociación "${asoc.name}" a "${nuevoEstado}"?`
    );
    if (!confirmar) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: errUpdate } = await supabase
        .from('associations')
        .update({ status: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', asoc.id);

      if (errUpdate) throw errUpdate;

      // Auditar en bitácora
      try {
        await supabase.from('audit_logs').insert([{
          usuario: user?.email || 'Administrador',
          accion: 'UPDATE',
          tabla: 'associations',
          registro_id: asoc.id,
          registro_nuevo: {
            evento: `Cambio de estado de asociación a ${nuevoEstado}`,
            nombre: asoc.name,
            nuevo_estado: nuevoEstado,
            timestamp: new Date().toISOString()
          }
        }]);
      } catch (e) {}

      await cargarAsociaciones();
    } catch (err) {
      console.error('Error al actualizar estado de asociación:', err);
      alert('Error: ' + err.message);
    }
  };

  const totalValoresEnSistema = catalogos.reduce((acc, c) => acc + c.total, 0);

  return (
    <div>
      {/* Header principal */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Listas de valores y entidades</h1>
          <p className="admin-page-header__subtitle">
            {tipoVista === 'roles' && `${rolesList.length} roles configurados · Permisos por pantallas (RF-SEG-005)`}
            {tipoVista === 'asociaciones' && `${asociacionesList.length} asociaciones afiliadas registradas en el sistema`}
            {tipoVista === 'catalogo' && `${catalogos.length} listas · ${totalValoresEnSistema} valores registrados`}
          </p>
        </div>
        <div className="admin-page-header__actions">
          {tipoVista === 'roles' && (
            <button 
              type="button" 
              className="admin-btn admin-btn--primary"
              onClick={() => {
                setNuevoRol({ name: '', description: '', permissions: ['/admin'] });
                setMostrarModalCrearRol(true);
              }}
            >
              + Crear rol
            </button>
          )}
          {tipoVista === 'catalogo' && (
            <button 
              type="button" 
              className="admin-btn admin-btn--primary"
              onClick={() => setMostrarModalValor(true)}
              disabled={!catalogoSeleccionado}
            >
              + Agregar valor
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="admin-banner" style={{ marginBottom: '20px', background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Two Column Layout: Navigation / Selector Column + Content Table */}
      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Lists and Entities Selector */}
        <div className="admin-card" style={{ padding: '0 0 10px 0' }}>
          <div className="admin-card__header" style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="admin-card__title" style={{ fontSize: '1rem' }}>Listas y Entidades</h2>
          </div>

          {/* Sección 1: Entidades del Sistema (Roles y Asociaciones) */}
          <div style={{ padding: '12px 18px 4px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-mudo)', letterSpacing: '0.05em' }}>
            Entidades del Sistema
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li>
              <button
                type="button"
                onClick={() => {
                  setTipoVista('roles');
                  setCatalogoSeleccionado(null);
                }}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: tipoVista === 'roles' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  borderLeft: tipoVista === 'roles' ? '3px solid #c8102e' : '3px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s'
                }}
              >
                <span style={{ 
                  fontWeight: tipoVista === 'roles' ? 700 : 500, 
                  color: tipoVista === 'roles' ? 'var(--texto)' : 'var(--texto-suave)', 
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  Roles del sistema
                </span>
                <span className="admin-card__badge" style={{ fontSize: '0.73rem', background: tipoVista === 'roles' ? '#fee2e2' : undefined, color: tipoVista === 'roles' ? '#991b1b' : undefined }}>
                  {rolesList.length} roles
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setTipoVista('asociaciones');
                  setCatalogoSeleccionado(null);
                }}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: tipoVista === 'asociaciones' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  borderLeft: tipoVista === 'asociaciones' ? '3px solid #c8102e' : '3px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s'
                }}
              >
                <span style={{ 
                  fontWeight: tipoVista === 'asociaciones' ? 700 : 500, 
                  color: tipoVista === 'asociaciones' ? 'var(--texto)' : 'var(--texto-suave)', 
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  Asociaciones afiliadas
                </span>
                <span className="admin-card__badge" style={{ fontSize: '0.73rem', background: tipoVista === 'asociaciones' ? '#dcfce7' : undefined, color: tipoVista === 'asociaciones' ? '#166534' : undefined }}>
                  {asociacionesList.length} asoc.
                </span>
              </button>
            </li>
          </ul>

          {/* Separador */}
          <div style={{ height: '1px', background: '#e2e8f0', margin: '12px 0' }} />

          {/* Sección 2: Catálogos Generales de Competencia */}
          <div style={{ padding: '4px 18px 4px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-mudo)', letterSpacing: '0.05em' }}>
            Catálogos Generales
          </div>
          {cargandoCatalogos ? (
            <div style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--texto-mudo)', fontSize: '0.85rem' }}>
              Cargando listas...
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {catalogos.map((cat) => {
                const isSelected = tipoVista === 'catalogo' && catalogoSeleccionado?.id === cat.id;
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoVista('catalogo');
                        setCatalogoSeleccionado(cat);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 18px',
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
                      <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--texto)' : 'var(--texto-suave)', fontSize: '0.86rem' }}>
                        {cat.nombre}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>
                        {cat.total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Column: Dynamic Panel (Roles / Asociaciones / Catálogo General) */}
        <div className="admin-card">

          {/* ══════════════════════════════════════════════════════════════
              VISTA 1: ROLES DEL SISTEMA Y GESTIÓN DE PERMISOS (RF-SEG-005)
              ══════════════════════════════════════════════════════════════ */}
          {tipoVista === 'roles' && (
            <div>
              <div className="admin-card__header">
                <div>
                  <h2 className="admin-card__title">Roles del sistema</h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                    Matriz de permisos por pantallas
                  </span>
                </div>
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setNuevoRol({ name: '', description: '', permissions: ['/admin'] });
                    setMostrarModalCrearRol(true);
                  }}
                >
                  + Crear nuevo rol
                </button>
              </div>

              {cargandoRoles ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
                  Cargando roles y permisos del sistema...
                </div>
              ) : (
                <>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Rol</th>
                        <th>Descripción</th>
                        <th>Pantallas autorizadas</th>
                        <th>Cuentas</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolesPaginados.map((rol) => {
                        const totalPerms = rol.permissions?.length || 0;
                        const esSuper = totalPerms === PANTALLAS_SISTEMA.length;

                        return (
                          <tr key={rol.id}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, color: 'var(--texto)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {rol.name}
                                  {rol.name === 'Administrador' && (
                                    <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                      Principal
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.84rem', color: 'var(--texto-suave)' }}>
                                {rol.description || 'Sin descripción'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ 
                                  fontSize: '0.75rem', 
                                  fontWeight: 700,
                                  color: esSuper ? '#166534' : '#0e3b6b'
                                }}>
                                  {esSuper ? '★ Acceso total (Todas las pantallas)' : `${totalPerms} de ${PANTALLAS_SISTEMA.length} pantallas`}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {(rol.permissions || []).slice(0, 3).map(pKey => {
                                    const pObj = PANTALLAS_SISTEMA.find(p => p.key === pKey);
                                    return (
                                      <span key={pKey} style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                        {pObj?.nombre || pKey}
                                      </span>
                                    );
                                  })}
                                  {totalPerms > 3 && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--texto-mudo)', padding: '2px 4px' }}>
                                      +{totalPerms - 3} más
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="badge-status" style={{ fontSize: '0.78rem', background: rol.assigned_users_count > 0 ? '#eff6ff' : '#f8fafc', color: rol.assigned_users_count > 0 ? '#1d4ed8' : 'var(--texto-mudo)', border: '1px solid #cbd5e1' }}>
                                {rol.assigned_users_count} {rol.assigned_users_count === 1 ? 'cuenta' : 'cuentas'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, color: '#0e3b6b', borderColor: '#93c5fd' }}
                                  onClick={() => setRolPermisosEditando({ ...rol, permissions: [...(rol.permissions || [])] })}
                                  title="Configurar qué pantallas y módulos puede ver este rol"
                                >
                                  Permisos
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => setRolEditando({ ...rol })}
                                  title="Editar nombre y descripción"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  style={{ 
                                    padding: '4px 8px', 
                                    fontSize: '0.75rem',
                                    color: (rol.assigned_users_count > 0 || rol.name === 'Administrador') ? 'var(--texto-mudo)' : '#dc2626',
                                    borderColor: (rol.assigned_users_count > 0 || rol.name === 'Administrador') ? '#e2e8f0' : '#fca5a5',
                                    cursor: (rol.assigned_users_count > 0 || rol.name === 'Administrador') ? 'not-allowed' : 'pointer'
                                  }}
                                  onClick={() => handleEliminarRol(rol)}
                                  disabled={rol.assigned_users_count > 0 || rol.name === 'Administrador'}
                                  title={
                                    rol.name === 'Administrador'
                                      ? 'El rol Administrador no puede ser eliminado'
                                      : rol.assigned_users_count > 0 
                                      ? `No se puede eliminar: tiene ${rol.assigned_users_count} usuario(s) asignado(s)`
                                      : 'Eliminar rol'
                                  }
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Paginación Roles */}
                  <div className="admin-table-footer">
                    <span>
                      Mostrando {rolesPaginados.length} de {rolesList.length} roles
                    </span>
                    {totalPaginasRoles > 1 && (
                      <div className="admin-pagination-links">
                        <button 
                          type="button" 
                          onClick={() => setPaginaRoles(p => Math.max(p - 1, 1))}
                          disabled={paginaRoles <= 1}
                        >
                          &lt; Anterior
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setPaginaRoles(p => Math.min(p + 1, totalPaginasRoles))}
                          disabled={paginaRoles >= totalPaginasRoles}
                        >
                          Siguiente &gt;
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              VISTA 2: ASOCIACIONES AFILIADAS (Apartado en Listas de Valores)
              ══════════════════════════════════════════════════════════════ */}
          {tipoVista === 'asociaciones' && (
            <div>
              <div className="admin-card__header">
                <div>
                  <h2 className="admin-card__title">Asociaciones afiliadas</h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                    Órganos y clubes vinculados a FECOVOL
                  </span>
                </div>
              </div>

              {cargandoAsociaciones ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
                  Cargando asociaciones afiliadas...
                </div>
              ) : (
                <>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Asociación</th>
                        <th>Siglas / Cédula</th>
                        <th>Ubicación</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asociacionesPaginadas.map((asoc) => (
                        <tr key={asoc.id}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: 'var(--texto)' }}>{asoc.name}</strong>
                              <span style={{ fontSize: '0.74rem', color: 'var(--texto-mudo)' }}>
                                {asoc.affiliation_date ? `Afiliada el: ${new Date(asoc.affiliation_date).toLocaleDateString('es-CR')}` : 'Sin fecha registrada'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>{asoc.short_name || '—'}</span>
                              <span style={{ fontSize: '0.74rem', color: 'var(--texto-mudo)' }}>{asoc.tax_id || 'Sin cédula'}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem' }}>
                              {asoc.province || 'Costa Rica'}{asoc.canton ? `, ${asoc.canton}` : ''}
                            </span>
                          </td>
                          <td>
                            <span className={`badge-status ${asoc.status === 'AFILIADA' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                              {asoc.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="admin-btn admin-btn--secondary"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              onClick={() => toggleEstadoAsociacion(asoc)}
                            >
                              {asoc.status === 'AFILIADA' ? 'Suspender' : 'Afiliar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {asociacionesPaginadas.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                            No hay asociaciones registradas en la base de datos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Paginación Asociaciones */}
                  <div className="admin-table-footer">
                    <span>
                      Mostrando {asociacionesPaginadas.length} de {asociacionesList.length} asociaciones
                    </span>
                    {totalPaginasAsocs > 1 && (
                      <div className="admin-pagination-links">
                        <button 
                          type="button" 
                          onClick={() => setPaginaAsociaciones(p => Math.max(p - 1, 1))}
                          disabled={paginaAsociaciones <= 1}
                        >
                          &lt; Anterior
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setPaginaAsociaciones(p => Math.min(p + 1, totalPaginasAsocs))}
                          disabled={paginaAsociaciones >= totalPaginasAsocs}
                        >
                          Siguiente &gt;
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              VISTA 3: CATÁLOGOS GENERALES (Valores de catálogos deportivos)
              ══════════════════════════════════════════════════════════════ */}
          {tipoVista === 'catalogo' && (
            <div>
              <div className="admin-card__header">
                <div>
                  <h2 className="admin-card__title">{catalogoSeleccionado?.nombre || 'Seleccione un catálogo'}</h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                    {valores.length} valores · {valores.filter(v => v.is_active).length} activos · Tabla <code>catalog_values</code>
                  </span>
                </div>
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => setMostrarModalValor(true)}
                  disabled={!catalogoSeleccionado}
                >
                  + Agregar valor
                </button>
              </div>

              {cargandoValores ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--texto-mudo)', fontSize: '0.88rem' }}>
                  Cargando valores del catálogo...
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

                  {/* Paginación Catálogo General */}
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
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR MATRIZ DE PERMISOS DE PANTALLAS (RF-SEG-005)
          ══════════════════════════════════════════════════════════════ */}
      {rolPermisosEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '640px' }}>
            <div className="admin-modal__header">
              <div>
                <h3 className="admin-modal__title">Matriz de permisos: {rolPermisosEditando.name}</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                  Seleccione las pantallas y componentes que los usuarios con este rol podrán acceder.
                </p>
              </div>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setRolPermisosEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarPermisosRol}>
              <div className="admin-modal__body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                
                {/* Botones rápidos: Acceso total / Entorno base / Desmarcar */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    onClick={() => {
                      setRolPermisosEditando(prev => ({
                        ...prev,
                        permissions: PANTALLAS_SISTEMA.map(p => p.key)
                      }));
                    }}
                  >
                    ★ Acceso total (Superuser)
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    onClick={() => {
                      const rName = (rolPermisosEditando.name || '').toLowerCase();
                      let base = ['/admin'];
                      if (rName.includes('arbitr')) base = ['/arbitro'];
                      else if (rName.includes('person')) base = ['/personal'];
                      else if (rName.includes('repres') || rName.includes('asoc')) base = ['/asociacion'];
                      setRolPermisosEditando(prev => ({
                        ...prev,
                        permissions: base
                      }));
                    }}
                  >
                    Solo entorno base
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--texto-mudo)' }}
                    onClick={() => {
                      setRolPermisosEditando(prev => ({
                        ...prev,
                        permissions: []
                      }));
                    }}
                  >
                    Limpiar todo
                  </button>
                </div>

                {/* Lista de subrutas categorizadas con checkbox */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {['Entornos del Sistema (Vistas de Rol)', 'Módulos Administrativos'].map(cat => {
                    const itemsCat = PANTALLAS_SISTEMA.filter(p => p.categoria === cat);
                    if (itemsCat.length === 0) return null;

                    return (
                      <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 700, 
                          color: '#475569', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.04em',
                          borderBottom: '1px solid #e2e8f0',
                          paddingBottom: '4px'
                        }}>
                          {cat}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {itemsCat.map(pantalla => {
                            const permitida = rolPermisosEditando.permissions?.includes(pantalla.key);
                            return (
                              <label 
                                key={pantalla.key} 
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '12px',
                                  padding: '10px 12px',
                                  background: permitida ? '#f0fdf4' : '#f8fafc',
                                  border: `1px solid ${permitida ? '#bbf7d0' : '#e2e8f0'}`,
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <input 
                                  type="checkbox"
                                  checked={permitida}
                                  style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setRolPermisosEditando(prev => ({
                                      ...prev,
                                      permissions: checked 
                                        ? [...(prev.permissions || []), pantalla.key]
                                        : (prev.permissions || []).filter(k => k !== pantalla.key)
                                    }));
                                  }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: permitida ? '#166534' : 'var(--texto)', fontSize: '0.86rem' }}>
                                      {pantalla.nombre}
                                    </span>
                                    <code style={{ fontSize: '0.72rem', color: '#0e3b6b', background: '#e0f2fe', padding: '1px 6px', borderRadius: '4px' }}>
                                      {pantalla.ruta}
                                    </code>
                                  </div>
                                  <p style={{ margin: '2px 0 0', fontSize: '0.77rem', color: 'var(--texto-suave)', lineHeight: 1.3 }}>
                                    {pantalla.desc}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setRolPermisosEditando(null)}
                  disabled={guardandoRol}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoRol}>
                  {guardandoRol ? 'Guardando permisos…' : 'Guardar matriz de permisos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CREAR NUEVO ROL (RF-SEG-005)
          ══════════════════════════════════════════════════════════════ */}
      {mostrarModalCrearRol && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '580px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Crear rol del sistema</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModalCrearRol(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCrearRol}>
              <div className="admin-modal__body">
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '16px' }}>
                  Defina el nombre del rol y seleccione las pantallas a las que tendrá autorización de acceso (ej. superuser con acceso total).
                </p>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre del rol *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    placeholder="Ej. Superuser, Coordinador, Gestor"
                    value={nuevoRol.name}
                    onChange={(e) => setNuevoRol({ ...nuevoRol, name: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '16px' }}>
                  <label className="campo__etiqueta">Descripción</label>
                  <input 
                    type="text" 
                    className="campo__input" 
                    placeholder="Propósito o funciones de este rol"
                    value={nuevoRol.description}
                    onChange={(e) => setNuevoRol({ ...nuevoRol, description: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="campo__etiqueta" style={{ margin: 0 }}>Subrutas y entornos autorizados iniciales</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', color: '#0e3b6b', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => setNuevoRol(prev => ({ ...prev, permissions: PANTALLAS_SISTEMA.map(p => p.key) }))}
                      >
                        ★ Acceso total
                      </button>
                      <span style={{ color: '#cbd5e1' }}>|</span>
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', color: 'var(--texto-mudo)', fontSize: '0.75rem', cursor: 'pointer' }}
                        onClick={() => setNuevoRol(prev => ({ ...prev, permissions: ['/admin'] }))}
                      >
                        Solo /admin
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    {PANTALLAS_SISTEMA.map(pantalla => {
                      const seleccionada = nuevoRol.permissions?.includes(pantalla.key);
                      return (
                        <label key={pantalla.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox"
                            checked={seleccionada}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNuevoRol(prev => ({
                                ...prev,
                                permissions: checked 
                                  ? [...(prev.permissions || []), pantalla.key]
                                  : (prev.permissions || []).filter(k => k !== pantalla.key)
                              }));
                            }}
                          />
                          <span>{pantalla.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModalCrearRol(false)}
                  disabled={guardandoRol}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoRol}>
                  {guardandoRol ? 'Creando rol…' : 'Crear rol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR NOMBRE / DESCRIPCIÓN DEL ROL (RF-SEG-005)
          ══════════════════════════════════════════════════════════════ */}
      {rolEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '500px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar rol: {rolEditando.name}</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setRolEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicionRol}>
              <div className="admin-modal__body">
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre del rol *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    value={rolEditando.name}
                    onChange={(e) => setRolEditando({ ...rolEditando, name: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Descripción</label>
                  <textarea 
                    className="campo__input" 
                    rows="3"
                    value={rolEditando.description || ''}
                    onChange={(e) => setRolEditando({ ...rolEditando, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setRolEditando(null)}
                  disabled={guardandoRol}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoRol}>
                  {guardandoRol ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: AGREGAR VALOR DE CATÁLOGO GENERAL
          ══════════════════════════════════════════════════════════════ */}
      {mostrarModalValor && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Agregar valor</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModalValor(false)}
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
                  onClick={() => setMostrarModalValor(false)}
                  disabled={guardandoValor}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoValor}>
                  {guardandoValor ? 'Guardando…' : 'Agregar valor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
