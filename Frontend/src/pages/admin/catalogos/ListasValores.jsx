import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';
import Icono from '../../../components/Icono.jsx';
import { normalizarTelefono, soloCaracteresDeTelefono } from '../../../utils/telefono.js';
import { avisar, pedirConfirmacion } from '../../../components/Avisos.jsx';

const ELEMENTOS_POR_PAGINA = 10;

export const PROVINCIAS_CR = [
  'San José',
  'Alajuela',
  'Cartago',
  'Heredia',
  'Guanacaste',
  'Puntarenas',
  'Limón'
];

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
    key: '/admin/parametros', 
    categoria: 'Módulos Administrativos', 
    nombre: 'Parámetros del Sistema (/admin/parametros)', 
    ruta: '/admin/parametros', 
    desc: 'Administración de reglas de competencia, desempates, seguridad y límites'
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
  const navigate = useNavigate();
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
  const [mostrarModalCrearAsoc, setMostrarModalCrearAsoc] = useState(false);
  const [guardandoAsoc, setGuardandoAsoc] = useState(false);
  const [nuevaAsociacion, setNuevaAsociacion] = useState({
    name: '',
    short_name: '',
    tax_id: '',
    province: 'San José',
    canton: '',
    email: '',
    phone: '',
    address: '',
    home_venue: '',
    status: 'AFILIADA'
  });
  const [asociacionEditando, setAsociacionEditando] = useState(null);
  const [guardandoEdicionAsoc, setGuardandoEdicionAsoc] = useState(false);
  const [busquedaAsoc, setBusquedaAsoc] = useState('');

  // Modal de agregar valor de catálogo
  const [mostrarModalValor, setMostrarModalValor] = useState(false);
  const [guardandoValor, setGuardandoValor] = useState(false);
  const [nuevoValor, setNuevoValor] = useState({
    codigo: '',
    valor: '',
    descripcion: '',
    estado: 'ACTIVO'
  });

  // Modal de agregar nuevo catálogo (RF-AUD-001)
  const [mostrarModalCatalogo, setMostrarModalCatalogo] = useState(false);
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false);
  const [nuevoCatalogo, setNuevoCatalogo] = useState({
    name: '',
    description: ''
  });

  // Modal de editar valor de catálogo (RF-AUD-001)
  const [valorEditando, setValorEditando] = useState(null);
  const [guardandoEdicionValor, setGuardandoEdicionValor] = useState(false);

  // Modal de editar catálogo
  const [catalogoEditando, setCatalogoEditando] = useState(null);
  const [guardandoEdicionCatalogo, setGuardandoEdicionCatalogo] = useState(false);

  // Modal de confirmación y advertencia de dependencias para desactivar (RF-AUD-002)
  const [modalConfirmacionDesactivar, setModalConfirmacionDesactivar] = useState(null);
  const [ejecutandoDesactivacion, setEjecutandoDesactivacion] = useState(false);

  // Filtro de búsqueda dentro del catálogo seleccionado
  const [busquedaValor, setBusquedaValor] = useState('');

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  // ==========================================
  // 1. CARGA DE DATOS: Catálogos, Roles, Asociaciones
  // ==========================================

  // Cargar lista de catálogos generales
  async function cargarCatalogos() {
    setCargandoCatalogos(true);
    try {
      let catsFormateados = null;

      // 1. Intentar cargar vía API backend
      try {
        const res = await fetch(`${backendUrl}/api/catalogs`);
        if (res.ok) {
          const json = await res.json();
          catsFormateados = (json.data || []).map((c) => ({
            id: c.id,
            nombre: c.name,
            descripcion: c.description,
            total: c.total_values || 0,
            activos: c.active_values || 0
          }));
        }
      } catch (e) {
        console.warn('API /api/catalogs no disponible, usando cliente Supabase:', e);
      }

      // 2. Fallback directo a Supabase
      if (!catsFormateados) {
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

        catsFormateados = (cats || []).map((c) => ({
          id: c.id,
          nombre: c.name,
          descripcion: c.description,
          total: c.catalog_values?.length || 0,
          activos: c.catalog_values?.filter((v) => v.is_active).length || 0
        }));
      }

      setCatalogos(catsFormateados || []);
      if (catsFormateados && catsFormateados.length > 0 && !catalogoSeleccionado && tipoVista === 'catalogo') {
        setCatalogoSeleccionado(catsFormateados[0]);
      }
    } catch (err) {
      console.error('Error al cargar catálogos:', err);
      setError('No se pudieron cargar los catálogos generales.');
    } finally {
      setCargandoCatalogos(false);
    }
  }

  // Cargar valores del catálogo seleccionado (con dependencias RF-AUD-002)
  async function cargarValores(catalogId) {
    if (!catalogId) return;
    setCargandoValores(true);
    try {
      let valsFormateados = null;

      // 1. Intentar vía API backend (con cálculo de dependencias)
      try {
        const res = await fetch(`${backendUrl}/api/catalogs/${catalogId}/values`);
        if (res.ok) {
          const json = await res.json();
          valsFormateados = (json.data || []).map((v) => ({
            id: v.id,
            codigo: v.code,
            valor: v.value,
            descripcion: v.description || '—',
            is_active: v.is_active,
            estado: v.is_active ? 'ACTIVO' : 'INACTIVO',
            dependency_count: v.dependency_count ?? 0,
            dependencies: v.dependencies ?? { total: 0, teams: 0, persons: 0, members: 0, documents: 0, referees: 0 },
            is_last_active: Boolean(v.is_last_active)
          }));
        }
      } catch (e) {
        console.warn('API /api/catalogs/:id/values no disponible, usando Supabase:', e);
      }

      // 2. Fallback Supabase
      if (!valsFormateados) {
        const { data: vals, error: errVals } = await supabase
          .from('catalog_values')
          .select('*')
          .eq('catalog_id', catalogId)
          .order('value');

        if (errVals) throw errVals;

        const activeCount = (vals || []).filter((v) => v.is_active).length;

        valsFormateados = (vals || []).map((v) => ({
          id: v.id,
          codigo: v.code,
          valor: v.value,
          descripcion: v.description || '—',
          is_active: v.is_active,
          estado: v.is_active ? 'ACTIVO' : 'INACTIVO',
          dependency_count: 0,
          dependencies: { total: 0, teams: 0, persons: 0, members: 0, documents: 0, referees: 0 },
          is_last_active: v.is_active && activeCount === 1
        }));
      }

      setValores(valsFormateados || []);
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
      const { data: { user } } = await supabase.auth.getUser();

      try {
        const res = await fetch(`${backendUrl}/api/associations`, {
          headers: {
            'x-user-email': user?.email || ''
          }
        });
        if (res.ok) {
          const json = await res.json();
          asocs = json.data || [];
        }
      } catch (e) {
        console.warn('API /api/associations no disponible, usando cliente Supabase:', e);
      }

      if (asocs.length === 0) {
        const { data, error } = await supabase
          .from('associations')
          .select('id, name, short_name, tax_id, province, canton, address, email, phone, website, home_venue, status, affiliation_date, founded_date')
          .order('name');
        if (error) throw error;
        asocs = data || [];
      }

      setAsociacionesList((asocs || []).map(a => ({
        ...a,
        dependency_count: a.dependency_count ?? ((a.teams_count || 0) + (a.persons_count || 0)),
        teams_count: a.teams_count ?? 0,
        persons_count: a.persons_count ?? 0,
        board_count: a.board_count ?? 0,
        profiles_count: a.profiles_count ?? 0,
        dependencies: a.dependencies ?? { total: 0, teams: a.teams_count || 0, persons: a.persons_count || 0 }
      })));
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
  // 2. PAGINACIÓN Y FILTRADO
  // ==========================================
  const valoresFiltrados = useMemo(() => {
    if (!busquedaValor.trim()) return valores;
    const q = busquedaValor.toLowerCase();
    return valores.filter(v =>
      v.codigo.toLowerCase().includes(q) ||
      v.valor.toLowerCase().includes(q) ||
      (v.descripcion && v.descripcion.toLowerCase().includes(q))
    );
  }, [valores, busquedaValor]);

  const totalPaginasValores = Math.ceil(valoresFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;
  const valoresPaginados = useMemo(() => {
    const inicio = (paginaValores - 1) * ELEMENTOS_POR_PAGINA;
    return valoresFiltrados.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [valoresFiltrados, paginaValores]);

  const totalPaginasRoles = Math.ceil(rolesList.length / ELEMENTOS_POR_PAGINA) || 1;
  const rolesPaginados = useMemo(() => {
    const inicio = (paginaRoles - 1) * ELEMENTOS_POR_PAGINA;
    return rolesList.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [rolesList, paginaRoles]);

  const asociacionesFiltradas = useMemo(() => {
    if (!busquedaAsoc.trim()) return asociacionesList;
    const q = busquedaAsoc.toLowerCase();
    return asociacionesList.filter(a =>
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.short_name && a.short_name.toLowerCase().includes(q)) ||
      (a.tax_id && a.tax_id.toLowerCase().includes(q)) ||
      (a.province && a.province.toLowerCase().includes(q)) ||
      (a.canton && a.canton.toLowerCase().includes(q))
    );
  }, [asociacionesList, busquedaAsoc]);

  const totalPaginasAsocs = Math.ceil(asociacionesFiltradas.length / ELEMENTOS_POR_PAGINA) || 1;
  const asociacionesPaginadas = useMemo(() => {
    const inicio = (paginaAsociaciones - 1) * ELEMENTOS_POR_PAGINA;
    return asociacionesFiltradas.slice(inicio, inicio + ELEMENTOS_POR_PAGINA);
  }, [asociacionesFiltradas, paginaAsociaciones]);

  // ==========================================
  // 3. OPERACIONES CRUD: VALORES Y CATÁLOGOS (RF-AUD-001)
  // ==========================================

  // Crear nuevo catálogo (RF-AUD-001 Nota 2)
  const handleAgregarCatalogo = async (e) => {
    e.preventDefault();
    if (!nuevoCatalogo.name.trim()) return;

    setGuardandoCatalogo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let creado = null;

      // 1. Intentar vía API backend
      try {
        const res = await fetch(`${backendUrl}/api/catalogs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            name: nuevoCatalogo.name.trim(),
            description: nuevoCatalogo.description?.trim() || null,
            admin_email: user?.email || 'Administrador'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al crear catálogo');
        creado = json.data;
      } catch (errApi) {
        console.warn('API backend falló al crear catálogo, usando Supabase:', errApi);
      }

      // 2. Fallback directo a Supabase
      if (!creado) {
        const { data, error: errInsert } = await supabase
          .from('catalogs')
          .insert({
            name: nuevoCatalogo.name.trim(),
            description: nuevoCatalogo.description?.trim() || null
          })
          .select('id, name, description')
          .single();

        if (errInsert) throw errInsert;
        creado = data;
      }

      setMostrarModalCatalogo(false);
      setNuevoCatalogo({ name: '', description: '' });
      await cargarCatalogos();

      // Seleccionar automáticamente el nuevo catálogo creado
      setCatalogoSeleccionado({
        id: creado.id,
        nombre: creado.name,
        descripcion: creado.description,
        total: 0,
        activos: 0
      });
      setTipoVista('catalogo');
    } catch (err) {
      console.error('Error al agregar catálogo:', err);
      avisar('Error al agregar el catálogo: ' + (err.message || 'Nombre duplicado o error de servidor'), { tono: 'error' });
    } finally {
      setGuardandoCatalogo(false);
    }
  };

  // Guardar edición de nombre y descripción de catálogo
  const handleGuardarEdicionCatalogo = async (e) => {
    e.preventDefault();
    if (!catalogoEditando || !catalogoEditando.name.trim()) return;

    setGuardandoEdicionCatalogo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      try {
        const res = await fetch(`${backendUrl}/api/catalogs/${catalogoEditando.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            name: catalogoEditando.name.trim(),
            description: catalogoEditando.description?.trim() || null,
            admin_email: user?.email || 'Administrador'
          })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al editar catálogo');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al editar catálogo, usando Supabase:', errApi);
      }

      if (!ok) {
        const { error } = await supabase
          .from('catalogs')
          .update({
            name: catalogoEditando.name.trim(),
            description: catalogoEditando.description?.trim() || null
          })
          .eq('id', catalogoEditando.id);

        if (error) throw error;
      }

      setCatalogoSeleccionado(prev => ({
        ...prev,
        nombre: catalogoEditando.name.trim(),
        descripcion: catalogoEditando.description?.trim() || null
      }));
      setCatalogoEditando(null);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al editar catálogo:', err);
      avisar('Error al actualizar catálogo: ' + err.message, { tono: 'error' });
    } finally {
      setGuardandoEdicionCatalogo(false);
    }
  };

  // Agregar valor de catálogo
  const handleAgregarValor = async (e) => {
    e.preventDefault();
    if (!nuevoValor.codigo.trim() || !nuevoValor.valor.trim() || !catalogoSeleccionado) return;

    setGuardandoValor(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API backend
      try {
        const res = await fetch(`${backendUrl}/api/catalogs/${catalogoSeleccionado.id}/values`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            code: nuevoValor.codigo.trim().toUpperCase(),
            value: nuevoValor.valor.trim(),
            description: nuevoValor.descripcion.trim() || null,
            is_active: nuevoValor.estado === 'ACTIVO',
            admin_email: user?.email || 'Administrador'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al guardar el valor');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al agregar valor, usando Supabase:', errApi);
      }

      // 2. Fallback Supabase
      if (!ok) {
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
      }

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
      avisar('Error al guardar el valor: ' + (err.message || 'Código duplicado o error de servidor'), { tono: 'error' });
    } finally {
      setGuardandoValor(false);
    }
  };

  // Guardar edición de valor existente (RF-AUD-001 y validaciones RF-AUD-002)
  const handleGuardarEdicionValor = async (e) => {
    e.preventDefault();
    if (!valorEditando || !valorEditando.codigo.trim() || !valorEditando.valor.trim()) return;

    // Validación preventiva de último activo (RF-AUD-002)
    if (!valorEditando.is_active && valorEditando.is_last_active) {
      avisar(`Operación denegada: No es posible desactivar este valor porque es el único valor activo en el catálogo "${catalogoSeleccionado?.nombre}".`, { tono: 'error' });
      return;
    }

    // Advertencia de consistencia histórica si se inactiva teniendo dependencias (RF-AUD-002)
    if (!valorEditando.is_active && valorEditando.estadoAnteriorActivo && (valorEditando.dependency_count || 0) > 0) {
      const confirmar = await pedirConfirmacion({
        titulo: 'Consistencia histórica',
        texto: `¿Desea confirmar la actualización?\n\nEste valor está referenciado por ${valorEditando.dependency_count} registros en el sistema. Al marcarlo como Inactivo, los registros históricos conservarán su integridad, pero este valor ya no podrá ser seleccionado en nuevos formularios o registros.`,
        textoAccion: 'Guardar como inactivo',
        peligro: true
      });
      if (!confirmar) return;
    }

    setGuardandoEdicionValor(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API Backend
      try {
        const res = await fetch(`${backendUrl}/api/catalogs/values/${valorEditando.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            code: valorEditando.codigo.trim().toUpperCase(),
            value: valorEditando.valor.trim(),
            description: valorEditando.descripcion?.trim() || null,
            is_active: valorEditando.is_active,
            admin_email: user?.email || 'Administrador'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al actualizar valor');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al actualizar valor, usando Supabase:', errApi);
      }

      // 2. Fallback Supabase
      if (!ok) {
        const { error: errUpdate } = await supabase
          .from('catalog_values')
          .update({
            code: valorEditando.codigo.trim().toUpperCase(),
            value: valorEditando.valor.trim(),
            description: valorEditando.descripcion?.trim() || null,
            is_active: valorEditando.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', valorEditando.id);

        if (errUpdate) throw errUpdate;
      }

      setValorEditando(null);
      await cargarValores(catalogoSeleccionado.id);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al editar valor:', err);
      avisar('Error al actualizar el valor: ' + (err.message || 'Código duplicado o error de servidor'), { tono: 'error' });
    } finally {
      setGuardandoEdicionValor(false);
    }
  };

  // Ejecutar toggle de valor con o sin confirmación de dependencias (RF-AUD-002)
  const ejecutarToggleValor = async (valorItem, confirmDeactivation = false) => {
    setEjecutandoDesactivacion(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API Backend
      try {
        const res = await fetch(`${backendUrl}/api/catalogs/values/${valorItem.id}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            admin_email: user?.email || 'Administrador',
            confirm_deactivation: confirmDeactivation
          })
        });

        const resJson = await res.json();
        if (!res.ok) {
          if (resJson.requires_confirmation) {
            // Mostrar modal de advertencia de consistencia histórica si aún no se había mostrado
            const deps = resJson.dependencies || {};
            const detalles = [
              deps.teams > 0 && { conteo: deps.teams, etiqueta: 'equipos de voleibol' },
              deps.persons > 0 && { conteo: deps.persons, etiqueta: 'personas afiliadas' },
              deps.members > 0 && { conteo: deps.members, etiqueta: 'miembros de equipo' },
              deps.documents > 0 && { conteo: deps.documents, etiqueta: 'documentos' },
              deps.referees > 0 && { conteo: deps.referees, etiqueta: 'designaciones arbitrales' }
            ].filter(Boolean);

            setModalConfirmacionDesactivar({
              tipo: 'valor',
              nombre: `${valorItem.valor} (${valorItem.codigo})`,
              totalDependencias: resJson.dependency_count,
              detalles: detalles.length > 0 ? detalles : [{ conteo: resJson.dependency_count, etiqueta: 'registros dependientes' }],
              bloqueado: false,
              onConfirmar: () => ejecutarToggleValor(valorItem, true)
            });
            return;
          }
          throw new Error(resJson.error || resJson.message || 'Error al actualizar valor');
        }
        ok = true;
      } catch (eApi) {
        if (eApi.message && !ok) throw eApi;
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const nuevoEstado = !valorItem.is_active;
        const { error: errUpdate } = await supabase
          .from('catalog_values')
          .update({ is_active: nuevoEstado, updated_at: new Date().toISOString() })
          .eq('id', valorItem.id);

        if (errUpdate) throw errUpdate;
      }

      setModalConfirmacionDesactivar(null);
      await cargarValores(catalogoSeleccionado.id);
      await cargarCatalogos();
    } catch (err) {
      console.error('Error al cambiar estado del valor:', err);
      avisar('No se pudo actualizar el estado: ' + err.message, { tono: 'error' });
    } finally {
      setEjecutandoDesactivacion(false);
    }
  };

  // Activar o desactivar valor con validación de dependencias (Soft-delete / Toggle RF-AUD-002)
  const toggleEstadoValor = async (valorItem) => {
    // Si se desea desactivar un valor activo
    if (valorItem.is_active) {
      // 1. Validación de último activo: no permitir dejar el catálogo sin opciones
      if (valorItem.is_last_active) {
        setModalConfirmacionDesactivar({
          tipo: 'valor',
          nombre: `${valorItem.valor} (${valorItem.codigo})`,
          bloqueado: true,
          mensajeBloqueo: `No es posible desactivar este valor porque es el único valor activo en el catálogo "${catalogoSeleccionado?.nombre}". El sistema requiere que al menos un valor permanezca activo para la creación y edición de registros.`
        });
        return;
      }

      // 2. Validación de dependencias existentes
      if ((valorItem.dependency_count || 0) > 0) {
        const deps = valorItem.dependencies || {};
        const detalles = [
          deps.teams > 0 && { conteo: deps.teams, etiqueta: 'equipos de voleibol' },
          deps.persons > 0 && { conteo: deps.persons, etiqueta: 'personas afiliadas' },
          deps.members > 0 && { conteo: deps.members, etiqueta: 'miembros de equipo' },
          deps.documents > 0 && { conteo: deps.documents, etiqueta: 'documentos' },
          deps.referees > 0 && { conteo: deps.referees, etiqueta: 'designaciones arbitrales' }
        ].filter(Boolean);

        setModalConfirmacionDesactivar({
          tipo: 'valor',
          nombre: `${valorItem.valor} (${valorItem.codigo})`,
          totalDependencias: valorItem.dependency_count,
          detalles: detalles.length > 0 ? detalles : [{ conteo: valorItem.dependency_count, etiqueta: 'registros dependientes' }],
          bloqueado: false,
          onConfirmar: () => ejecutarToggleValor(valorItem, true)
        });
        return;
      }

      // Sin dependencias: confirmación simple
      const confirmar = await pedirConfirmacion({
        titulo: 'Desactivar valor',
        texto: `¿Desea desactivar el valor «${valorItem.valor}»?\n\nYa no estará disponible para nuevos registros.`,
        textoAccion: 'Desactivar',
        peligro: true
      });
      if (!confirmar) return;
    }

    // Si se activa o si confirmó sin dependencias
    await ejecutarToggleValor(valorItem, false);
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
      avisar(`Rol "${resJson.data?.name || nuevoRol.name}" creado con éxito.`, { tono: 'ok' });
    } catch (err) {
      console.error('Error al crear rol:', err);
      avisar(err.message, { tono: 'error' });
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
      avisar('Rol actualizado con éxito.', { tono: 'ok' });
    } catch (err) {
      console.error('Error al editar rol:', err);
      avisar(err.message, { tono: 'error' });
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
      avisar(`Matriz de permisos para "${rolPermisosEditando.name}" actualizada con éxito y registrada en la bitácora.`, { tono: 'ok' });
    } catch (err) {
      console.error('Error al actualizar permisos:', err);
      avisar(err.message, { tono: 'error' });
    } finally {
      setGuardandoRol(false);
    }
  };

  // Eliminar rol con validación preventiva de cuentas asignadas (RF-SEG-005 Criterio 5)
  const handleEliminarRol = async (rol) => {
    if (rol.name === 'Administrador') {
      avisar('Operación no permitida: El rol Administrador es fundamental para el sistema y no puede ser eliminado.', { tono: 'error' });
      return;
    }

    if (rol.assigned_users_count > 0) {
      avisar(
        `Operación denegada: El rol "${rol.name}" tiene ${rol.assigned_users_count} cuenta(s) de usuario asignada(s).\n\n` +
        'Debe reasignar o desvincular a los usuarios de este rol en "Usuarios y permisos" antes de poder eliminarlo.', { tono: 'error' }
      );
      return;
    }

    const confirmar = await pedirConfirmacion({
      titulo: 'Eliminar rol',
      texto: `¿Está seguro de eliminar el rol "${rol.name}" del sistema?\n\nEsta acción no se puede deshacer.`,
      textoAccion: 'Eliminar rol',
      peligro: true
    });
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
      avisar(resJson.message || `Rol "${rol.name}" eliminado con éxito.`, { tono: 'ok' });
    } catch (err) {
      console.error('Error al eliminar rol:', err);
      avisar(err.message, { tono: 'error' });
    }
  };

  // Ejecutar toggle o cambio de estado de asociación (RF-AUD-002)
  const ejecutarToggleAsociacion = async (asoc, nuevoEstado, confirmDeactivation = false) => {
    setEjecutandoDesactivacion(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API Backend
      try {
        const res = await fetch(`${backendUrl}/api/associations/${asoc.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            status: nuevoEstado,
            confirm_deactivation: confirmDeactivation
          })
        });

        const resJson = await res.json();
        if (!res.ok) {
          if (resJson.requires_confirmation) {
            const deps = resJson.dependencies || {};
            const detalles = [
              deps.teams > 0 && { conteo: deps.teams, etiqueta: 'equipos inscritos' },
              deps.persons > 0 && { conteo: deps.persons, etiqueta: 'personas afiliadas' },
              deps.board > 0 && { conteo: deps.board, etiqueta: 'miembros de junta directiva' },
              deps.profiles > 0 && { conteo: deps.profiles, etiqueta: 'cuentas de usuario vinculadas' }
            ].filter(Boolean);

            setModalConfirmacionDesactivar({
              tipo: 'asociacion',
              nombre: asoc.name,
              totalDependencias: resJson.dependency_count,
              detalles: detalles.length > 0 ? detalles : [{ conteo: resJson.dependency_count, etiqueta: 'registros dependientes' }],
              bloqueado: false,
              onConfirmar: () => ejecutarToggleAsociacion(asoc, nuevoEstado, true)
            });
            return;
          }
          throw new Error(resJson.error || resJson.message || 'Error al actualizar asociación');
        }
        ok = true;
      } catch (eApi) {
        if (eApi.message && !ok) throw eApi;
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const { error: errUpdate } = await supabase
          .from('associations')
          .update({ status: nuevoEstado, updated_at: new Date().toISOString() })
          .eq('id', asoc.id);

        if (errUpdate) throw errUpdate;
      }

      setModalConfirmacionDesactivar(null);
      await cargarAsociaciones();
    } catch (err) {
      console.error('Error al actualizar estado de asociación:', err);
      avisar('Error: ' + err.message, { tono: 'error' });
    } finally {
      setEjecutandoDesactivacion(false);
    }
  };

  // Toggle estado de asociación afiliada con validación preventiva de dependencias (RF-AUD-002)
  const toggleEstadoAsociacion = async (asoc) => {
    const vaASuspender = asoc.status === 'AFILIADA';
    const nuevoEstado = vaASuspender ? 'SUSPENDIDA' : 'AFILIADA';

    if (vaASuspender && (asoc.dependency_count || 0) > 0) {
      const detalles = [
        asoc.teams_count > 0 && { conteo: asoc.teams_count, etiqueta: 'equipos inscritos' },
        asoc.persons_count > 0 && { conteo: asoc.persons_count, etiqueta: 'personas afiliadas' },
        asoc.board_count > 0 && { conteo: asoc.board_count, etiqueta: 'miembros de junta directiva' },
        asoc.profiles_count > 0 && { conteo: asoc.profiles_count, etiqueta: 'cuentas de usuario vinculadas' }
      ].filter(Boolean);

      setModalConfirmacionDesactivar({
        tipo: 'asociacion',
        nombre: asoc.name,
        totalDependencias: asoc.dependency_count,
        detalles: detalles.length > 0 ? detalles : [{ conteo: asoc.dependency_count, etiqueta: 'registros dependientes' }],
        bloqueado: false,
        onConfirmar: () => ejecutarToggleAsociacion(asoc, nuevoEstado, true)
      });
      return;
    }

    const confirmar = await pedirConfirmacion({
      titulo: 'Cambiar estado de la asociación',
      texto: `¿Desea cambiar el estado de la asociación "${asoc.name}" a "${nuevoEstado}"?`,
      textoAccion: 'Cambiar estado',
      peligro: nuevoEstado !== 'ACTIVA'
    });
    if (!confirmar) return;

    await ejecutarToggleAsociacion(asoc, nuevoEstado, false);
  };

  // Crear nueva asociación (tabla associations)
  const handleCrearAsociacion = async (e) => {
    e.preventDefault();
    if (!nuevaAsociacion.name.trim() || !nuevaAsociacion.tax_id.trim()) {
      avisar('El nombre y la cédula jurídica son obligatorios.', { tono: 'error' });
      return;
    }

    setGuardandoAsoc(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API backend
      try {
        const res = await fetch(`${backendUrl}/api/associations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            name: nuevaAsociacion.name.trim(),
            short_name: nuevaAsociacion.short_name?.trim() || null,
            tax_id: nuevaAsociacion.tax_id.trim(),
            province: nuevaAsociacion.province,
            canton: nuevaAsociacion.canton?.trim() || null,
            address: nuevaAsociacion.address?.trim() || null,
            email: nuevaAsociacion.email?.trim() || null,
            phone: nuevaAsociacion.phone?.trim() || null,
            home_venue: nuevaAsociacion.home_venue?.trim() || null,
            status: nuevaAsociacion.status || 'AFILIADA'
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al registrar la asociación');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al registrar asociación, usando Supabase directo:', errApi);
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const { error: insErr } = await supabase
          .from('associations')
          .insert({
            name: nuevaAsociacion.name.trim(),
            short_name: nuevaAsociacion.short_name?.trim() || null,
            tax_id: nuevaAsociacion.tax_id.trim(),
            province: nuevaAsociacion.province,
            canton: nuevaAsociacion.canton?.trim() || null,
            address: nuevaAsociacion.address?.trim() || null,
            email: nuevaAsociacion.email?.trim() || null,
            phone: nuevaAsociacion.phone?.trim() || null,
            home_venue: nuevaAsociacion.home_venue?.trim() || null,
            status: nuevaAsociacion.status || 'AFILIADA'
          });

        if (insErr) throw insErr;
      }

      setMostrarModalCrearAsoc(false);
      setNuevaAsociacion({
        name: '',
        short_name: '',
        tax_id: '',
        province: 'San José',
        canton: '',
        email: '',
        phone: '',
        address: '',
        home_venue: '',
        status: 'AFILIADA'
      });
      await cargarAsociaciones();
      avisar('Asociación registrada con éxito.', { tono: 'ok' });
    } catch (err) {
      console.error('Error al crear asociación:', err);
      avisar('Error al registrar asociación: ' + (err.message || 'Cédula jurídica duplicada o error de servidor'), { tono: 'error' });
    } finally {
      setGuardandoAsoc(false);
    }
  };

  // Guardar edición de asociación existente (con validaciones RF-AUD-002)
  const handleGuardarEdicionAsoc = async (e) => {
    e.preventDefault();
    if (!asociacionEditando || !asociacionEditando.name.trim() || !asociacionEditando.tax_id.trim()) {
      avisar('El nombre y la cédula jurídica son obligatorios.', { tono: 'error' });
      return;
    }

    // Advertencia de consistencia histórica si se suspende teniendo dependencias activas (RF-AUD-002)
    if (asociacionEditando.status === 'SUSPENDIDA' && asociacionEditando.estadoAnteriorActivo && (asociacionEditando.dependency_count || 0) > 0) {
      const confirmar = await pedirConfirmacion({
        titulo: 'Consistencia histórica',
        texto: `¿Desea confirmar la actualización?\n\nEsta asociación cuenta con ${asociacionEditando.dependency_count} registros dependientes (${asociacionEditando.teams_count || 0} equipos, ${asociacionEditando.persons_count || 0} personas afiliadas). Al suspenderla, los registros históricos se conservarán, pero no podrá inscribir nuevos equipos ni realizar trámites oficiales.`,
        textoAccion: 'Guardar cambios',
        peligro: true
      });
      if (!confirmar) return;
    }

    setGuardandoEdicionAsoc(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = false;

      // 1. Intentar vía API backend
      try {
        const res = await fetch(`${backendUrl}/api/associations/${asociacionEditando.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user?.email || ''
          },
          body: JSON.stringify({
            name: asociacionEditando.name.trim(),
            short_name: asociacionEditando.short_name?.trim() || null,
            tax_id: asociacionEditando.tax_id.trim(),
            province: asociacionEditando.province,
            canton: asociacionEditando.canton?.trim() || null,
            address: asociacionEditando.address?.trim() || null,
            email: asociacionEditando.email?.trim() || null,
            phone: asociacionEditando.phone?.trim() || null,
            home_venue: asociacionEditando.home_venue?.trim() || null,
            status: asociacionEditando.status
          })
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al actualizar asociación');
        ok = true;
      } catch (errApi) {
        console.warn('API backend falló al actualizar asociación, usando Supabase directo:', errApi);
      }

      // 2. Fallback Supabase directo
      if (!ok) {
        const { error: updErr } = await supabase
          .from('associations')
          .update({
            name: asociacionEditando.name.trim(),
            short_name: asociacionEditando.short_name?.trim() || null,
            tax_id: asociacionEditando.tax_id.trim(),
            province: asociacionEditando.province,
            canton: asociacionEditando.canton?.trim() || null,
            address: asociacionEditando.address?.trim() || null,
            email: asociacionEditando.email?.trim() || null,
            phone: asociacionEditando.phone?.trim() || null,
            home_venue: asociacionEditando.home_venue?.trim() || null,
            status: asociacionEditando.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', asociacionEditando.id);

        if (updErr) throw updErr;
      }

      setAsociacionEditando(null);
      await cargarAsociaciones();
      avisar('Asociación actualizada con éxito.', { tono: 'ok' });
    } catch (err) {
      console.error('Error al editar asociación:', err);
      avisar('Error al actualizar asociación: ' + (err.message || 'Cédula jurídica duplicada o error de servidor'), { tono: 'error' });
    } finally {
      setGuardandoEdicionAsoc(false);
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
            {tipoVista === 'roles' && `${rolesList.length} roles configurados · Permisos por pantallas`}
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
          {tipoVista === 'asociaciones' && (
            <button 
              type="button" 
              className="admin-btn admin-btn--primary"
              onClick={() => {
                setNuevaAsociacion({
                  name: '',
                  short_name: '',
                  tax_id: '',
                  province: 'San José',
                  canton: '',
                  email: '',
                  phone: '',
                  address: '',
                  home_venue: '',
                  status: 'AFILIADA'
                });
                setMostrarModalCrearAsoc(true);
              }}
              title="Registrar una nueva asociación afiliada en FECOVOL"
            >
              + Agregar asociación
            </button>
          )}
          {tipoVista === 'catalogo' && (
            <button 
              type="button" 
              className="admin-btn admin-btn--primary"
              onClick={() => {
                setNuevoCatalogo({ name: '', description: '' });
                setMostrarModalCatalogo(true);
              }}
              title="Crear un nuevo catálogo o lista en el sistema"
            >
              + Agregar catálogo
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
                                  {esSuper ? 'Acceso total (todas las pantallas)' : `${totalPerms} de ${PANTALLAS_SISTEMA.length} pantallas`}
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
                    Órganos y clubes vinculados a FECOVOL ({asociacionesList.length} registradas)
                  </span>
                </div>
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setNuevaAsociacion({
                      name: '',
                      short_name: '',
                      tax_id: '',
                      province: 'San José',
                      canton: '',
                      email: '',
                      phone: '',
                      address: '',
                      home_venue: '',
                      status: 'AFILIADA'
                    });
                    setMostrarModalCrearAsoc(true);
                  }}
                  title="Registrar una nueva asociación afiliada en FECOVOL"
                >
                  + Agregar asociación
                </button>
              </div>

              {/* Barra de búsqueda de asociaciones */}
              {asociacionesList.length > 0 && (
                <div style={{ padding: '12px 18px 6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="campo__input"
                    placeholder="Buscar asociación por nombre, sigla, cédula o cantón..."
                    value={busquedaAsoc}
                    onChange={(e) => {
                      setBusquedaAsoc(e.target.value);
                      setPaginaAsociaciones(1);
                    }}
                    style={{ maxWidth: '360px', fontSize: '0.82rem', padding: '6px 10px' }}
                  />
                  {busquedaAsoc && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => {
                        setBusquedaAsoc('');
                        setPaginaAsociaciones(1);
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              )}

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
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asociacionesPaginadas.map((asoc) => (
                        <tr key={asoc.id}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: 'var(--texto)' }}>{asoc.name}</strong>
                              <span style={{ fontSize: '0.74rem', color: 'var(--texto-mudo)' }}>
                                {asoc.affiliation_date ? `Afiliada el: ${new Date(asoc.affiliation_date).toLocaleDateString('es-CR')}` : (asoc.email || 'Sin contacto')}
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span 
                                className={`badge-status ${(asoc.dependency_count || 0) > 0 ? 'badge-status--activa' : 'badge-status--inactivo'}`}
                                style={{
                                  alignSelf: 'flex-start',
                                  backgroundColor: (asoc.dependency_count || 0) > 0 ? '#eff6ff' : '#f3f4f6',
                                  color: (asoc.dependency_count || 0) > 0 ? '#1d4ed8' : '#6b7280',
                                  borderColor: (asoc.dependency_count || 0) > 0 ? '#bfdbfe' : '#e5e7eb',
                                  fontWeight: 600
                                }}
                              >
                                {asoc.dependency_count === 1 ? '1 dependiente' : `${asoc.dependency_count || 0} dependientes`}
                              </span>
                              <span style={{ fontSize: '0.73rem', color: 'var(--texto-mudo)' }}>
                                {[
                                  asoc.teams_count > 0 && `${asoc.teams_count} equipos`,
                                  asoc.persons_count > 0 && `${asoc.persons_count} afiliados`,
                                  asoc.board_count > 0 && `${asoc.board_count} directivos`,
                                  asoc.profiles_count > 0 && `${asoc.profiles_count} usuarios`
                                ].filter(Boolean).join(' · ') || 'Sin registros vinculados'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge-status ${asoc.status === 'AFILIADA' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                              {asoc.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="admin-btn admin-btn--secondary"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                onClick={() => setAsociacionEditando({
                                  id: asoc.id,
                                  name: asoc.name,
                                  short_name: asoc.short_name || '',
                                  tax_id: asoc.tax_id || '',
                                  province: asoc.province || 'San José',
                                  canton: asoc.canton || '',
                                  address: asoc.address || '',
                                  email: asoc.email || '',
                                  phone: asoc.phone || '',
                                  home_venue: asoc.home_venue || '',
                                  status: asoc.status || 'AFILIADA',
                                  dependency_count: asoc.dependency_count || 0,
                                  teams_count: asoc.teams_count || 0,
                                  persons_count: asoc.persons_count || 0,
                                  board_count: asoc.board_count || 0,
                                  profiles_count: asoc.profiles_count || 0,
                                  estadoAnteriorActivo: asoc.status === 'AFILIADA'
                                })}
                                title="Editar datos de esta asociación"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn--secondary"
                                style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                onClick={() => navigate(`/admin/auditoria?tabla=associations&registroId=${asoc.id}`)}
                                title="Ver historial de esta asociación en la bitácora"
                              >
                                Bitácora
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn--secondary"
                                style={{ 
                                  padding: '4px 10px', 
                                  fontSize: '0.78rem',
                                  color: asoc.status === 'AFILIADA' ? '#dc2626' : '#166534',
                                  borderColor: asoc.status === 'AFILIADA' ? '#fca5a5' : '#86efac'
                                }}
                                onClick={() => toggleEstadoAsociacion(asoc)}
                              >
                                {asoc.status === 'AFILIADA' ? 'Suspender' : 'Afiliar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {asociacionesPaginadas.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                            {busquedaAsoc ? `No se encontraron asociaciones para "${busquedaAsoc}".` : 'No hay asociaciones registradas en la base de datos.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Paginación Asociaciones */}
                  <div className="admin-table-footer">
                    <span>
                      Mostrando {asociacionesPaginadas.length} de {asociacionesFiltradas.length} asociaciones
                      {busquedaAsoc && ` (filtradas de ${asociacionesList.length})`}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 className="admin-card__title">{catalogoSeleccionado?.nombre || 'Seleccione un catálogo'}</h2>
                    {catalogoSeleccionado && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#0e3b6b', borderColor: '#93c5fd' }}
                        onClick={() => setCatalogoEditando({
                          id: catalogoSeleccionado.id,
                          name: catalogoSeleccionado.nombre,
                          description: catalogoSeleccionado.descripcion || ''
                        })}
                        title="Editar nombre o descripción de esta lista"
                      >
                        Editar lista
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>
                    {valores.length} valores · {valores.filter(v => v.is_active).length} activos
                    {catalogoSeleccionado?.descripcion && ` · ${catalogoSeleccionado.descripcion}`}
                  </span>
                </div>
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setNuevoValor({ codigo: '', valor: '', descripcion: '', estado: 'ACTIVO' });
                    setMostrarModalValor(true);
                  }}
                  disabled={!catalogoSeleccionado}
                  title={`Agregar nuevo valor a ${catalogoSeleccionado?.nombre || 'este catálogo'}`}
                >
                  + Agregar valor
                </button>
              </div>

              {/* Barra de búsqueda y filtrado de valores (RF-AUD-001) */}
              {catalogoSeleccionado && valores.length > 0 && (
                <div style={{ padding: '12px 18px 6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="campo__input"
                    placeholder={`Buscar en ${catalogoSeleccionado.nombre} por código o valor...`}
                    value={busquedaValor}
                    onChange={(e) => {
                      setBusquedaValor(e.target.value);
                      setPaginaValores(1);
                    }}
                    style={{ maxWidth: '320px', fontSize: '0.82rem', padding: '6px 10px' }}
                  />
                  {busquedaValor && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => {
                        setBusquedaValor('');
                        setPaginaValores(1);
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              )}

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
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {valoresPaginados.map((v) => (
                        <tr key={v.id}>
                          <td><strong>{v.codigo}</strong></td>
                          <td style={{ color: 'var(--texto)', fontWeight: 600 }}>{v.valor}</td>
                          <td>{v.descripcion}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span 
                                className={`badge-status ${(v.dependency_count || 0) > 0 ? 'badge-status--activa' : 'badge-status--inactivo'}`}
                                style={{
                                  alignSelf: 'flex-start',
                                  backgroundColor: (v.dependency_count || 0) > 0 ? '#eff6ff' : '#f3f4f6',
                                  color: (v.dependency_count || 0) > 0 ? '#1d4ed8' : '#6b7280',
                                  borderColor: (v.dependency_count || 0) > 0 ? '#bfdbfe' : '#e5e7eb',
                                  fontWeight: 600
                                }}
                              >
                                {v.dependency_count === 1 ? '1 registro' : `${v.dependency_count || 0} registros`}
                              </span>
                              {(v.dependency_count || 0) > 0 && (
                                <span style={{ fontSize: '0.73rem', color: 'var(--texto-mudo)' }}>
                                  {[
                                    v.dependencies?.teams > 0 && `${v.dependencies.teams} equipos`,
                                    v.dependencies?.persons > 0 && `${v.dependencies.persons} personas`,
                                    v.dependencies?.members > 0 && `${v.dependencies.members} miembros`,
                                    v.dependencies?.documents > 0 && `${v.dependencies.documents} docs`,
                                    v.dependencies?.referees > 0 && `${v.dependencies.referees} arbitrajes`
                                  ].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`badge-status ${v.is_active ? 'badge-status--activa' : 'badge-status--inactivo'}`}>
                              {v.estado}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button 
                                type="button" 
                                className="admin-btn admin-btn--secondary"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                onClick={() => setValorEditando({ 
                                  id: v.id,
                                  codigo: v.codigo,
                                  valor: v.valor,
                                  descripcion: v.descripcion === '—' ? '' : v.descripcion,
                                  is_active: v.is_active,
                                  estado: v.is_active ? 'ACTIVO' : 'INACTIVO',
                                  dependency_count: v.dependency_count || 0,
                                  dependencies: v.dependencies || {},
                                  is_last_active: Boolean(v.is_last_active),
                                  estadoAnteriorActivo: v.is_active
                                })}
                                title="Editar código, valor y descripción"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn--secondary"
                                style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                onClick={() => navigate(`/admin/auditoria?tabla=catalog_values&registroId=${v.id}`)}
                                title="Ver historial de este valor en la bitácora"
                              >
                                Bitácora
                              </button>
                              <button 
                                type="button" 
                                className="admin-btn admin-btn--secondary"
                                style={{ 
                                  padding: '4px 10px', 
                                  fontSize: '0.78rem',
                                  color: v.is_active ? '#dc2626' : '#166534',
                                  borderColor: v.is_active ? '#fca5a5' : '#86efac'
                                }}
                                onClick={() => toggleEstadoValor(v)}
                                title={v.is_active ? 'Desactivar este valor' : 'Activar este valor'}
                              >
                                {v.is_active ? 'Desactivar' : 'Activar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {valoresPaginados.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>
                            {busquedaValor 
                              ? `No se encontraron valores que coincidan con "${busquedaValor}".` 
                              : 'No hay valores registrados en este catálogo.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Paginación Catálogo General */}
                  <div className="admin-table-footer">
                    <span>
                      Mostrando {valoresPaginados.length} de {valoresFiltrados.length} valores
                      {busquedaValor && ` (filtrados de ${valores.length})`}
                      {totalPaginasValores > 1 && ` · Página ${paginaValores} de ${totalPaginasValores}`}
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
                    <Icono nombre="estrella" tam={14} /> Acceso total
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
                        <Icono nombre="estrella" tam={14} /> Acceso total
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

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CREAR NUEVO CATÁLOGO / LISTA (RF-AUD-001 Nota 2)
          ══════════════════════════════════════════════════════════════ */}
      {mostrarModalCatalogo && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Crear nuevo catálogo</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModalCatalogo(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAgregarCatalogo}>
              <div className="admin-modal__body">
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '16px' }}>
                  Crea una nueva lista clasificatoria en el sistema. Podrás agregarle valores de inmediato.
                </p>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre del catálogo *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    placeholder="Ej. Tipos de Cancha, Sedes, Categorías Especiales"
                    value={nuevoCatalogo.name}
                    onChange={(e) => setNuevoCatalogo({ ...nuevoCatalogo, name: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Descripción</label>
                  <textarea 
                    className="campo__input" 
                    rows="3"
                    placeholder="Propósito de este catálogo en la plataforma"
                    value={nuevoCatalogo.description}
                    onChange={(e) => setNuevoCatalogo({ ...nuevoCatalogo, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModalCatalogo(false)}
                  disabled={guardandoCatalogo}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoCatalogo}>
                  {guardandoCatalogo ? 'Creando catálogo…' : 'Crear catálogo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR CATÁLOGO / LISTA (RF-AUD-001)
          ══════════════════════════════════════════════════════════════ */}
      {catalogoEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar catálogo: {catalogoEditando.name}</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setCatalogoEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicionCatalogo}>
              <div className="admin-modal__body">
                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre del catálogo *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    value={catalogoEditando.name}
                    onChange={(e) => setCatalogoEditando({ ...catalogoEditando, name: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Descripción</label>
                  <textarea 
                    className="campo__input" 
                    rows="3"
                    value={catalogoEditando.description}
                    onChange={(e) => setCatalogoEditando({ ...catalogoEditando, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setCatalogoEditando(null)}
                  disabled={guardandoEdicionCatalogo}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoEdicionCatalogo}>
                  {guardandoEdicionCatalogo ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR VALOR DE CATÁLOGO (RF-AUD-001 Nota 1)
          ══════════════════════════════════════════════════════════════ */}
      {valorEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar valor: {valorEditando.codigo}</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setValorEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicionValor}>
              <div className="admin-modal__body">
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '18px' }}>
                  Modifique la información o vigencia de este valor en la lista <strong>{catalogoSeleccionado?.nombre}</strong>.
                </p>

                {/* Resumen de Dependencias y Consistencia Histórica (RF-AUD-002) */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '0.82rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--texto)' }}>Registros dependientes:</strong>
                    <span 
                      className={`badge-status ${(valorEditando.dependency_count || 0) > 0 ? 'badge-status--activa' : 'badge-status--inactivo'}`}
                      style={{
                        backgroundColor: (valorEditando.dependency_count || 0) > 0 ? '#eff6ff' : '#f3f4f6',
                        color: (valorEditando.dependency_count || 0) > 0 ? '#1d4ed8' : '#6b7280',
                        fontSize: '0.74rem'
                      }}
                    >
                      {valorEditando.dependency_count || 0} registros
                    </span>
                  </div>
                  {(valorEditando.dependency_count || 0) > 0 ? (
                    <div style={{ color: '#1e40af', fontSize: '0.76rem', lineHeight: '1.4' }}>
                      En uso por: {[
                        valorEditando.dependencies?.teams > 0 && `${valorEditando.dependencies.teams} equipos`,
                        valorEditando.dependencies?.persons > 0 && `${valorEditando.dependencies.persons} personas`,
                        valorEditando.dependencies?.members > 0 && `${valorEditando.dependencies.members} miembros`,
                        valorEditando.dependencies?.documents > 0 && `${valorEditando.dependencies.documents} documentos`,
                        valorEditando.dependencies?.referees > 0 && `${valorEditando.dependencies.referees} arbitrajes`
                      ].filter(Boolean).join(', ')}.
                      <br />
                      <span style={{ color: 'var(--texto-mudo)' }}>
                        La consistencia histórica de estos registros se preservará de forma íntegra.
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--texto-mudo)', fontSize: '0.76rem' }}>
                      No hay registros vinculados a este valor en el sistema.
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Código *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      value={valorEditando.codigo}
                      onChange={(e) => setValorEditando({ ...valorEditando, codigo: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Valor / Etiqueta *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      value={valorEditando.valor}
                      onChange={(e) => setValorEditando({ ...valorEditando, valor: e.target.value })}
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Descripción</label>
                  <input 
                    type="text" 
                    className="campo__input" 
                    placeholder="Descripción o restricción"
                    value={valorEditando.descripcion || ''}
                    onChange={(e) => setValorEditando({ ...valorEditando, descripcion: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Estado</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={valorEditando.is_active ? 'ACTIVO' : 'INACTIVO'}
                    onChange={(e) => setValorEditando({ ...valorEditando, is_active: e.target.value === 'ACTIVO' })}
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
                  onClick={() => setValorEditando(null)}
                  disabled={guardandoEdicionValor}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoEdicionValor}>
                  {guardandoEdicionValor ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: REGISTRAR NUEVA ASOCIACIÓN (public.associations)
          ══════════════════════════════════════════════════════════════ */}
      {mostrarModalCrearAsoc && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '620px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Registrar nueva asociación</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setMostrarModalCrearAsoc(false)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCrearAsociacion}>
              <div className="admin-modal__body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)', marginTop: 0, marginBottom: '16px' }}>
                  Ingrese los datos institucionales del club o comité afiliado a FECOVOL.
                </p>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre oficial de la asociación *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    placeholder="Ej. Asociación de Voleibol de Cartago"
                    value={nuevaAsociacion.name}
                    onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Siglas / Nombre corto</label>
                    <input 
                      type="text" 
                      className="campo__input" 
                      placeholder="Ej. ASVO-CAR"
                      value={nuevaAsociacion.short_name}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, short_name: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Cédula Jurídica *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      placeholder="Ej. 3-002-123456"
                      value={nuevaAsociacion.tax_id}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, tax_id: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Provincia</label>
                    <select 
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={nuevaAsociacion.province}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, province: e.target.value })}
                    >
                      {PROVINCIAS_CR.map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Cantón</label>
                    <input 
                      type="text" 
                      className="campo__input" 
                      placeholder="Ej. Central, Paraíso, Turrialba"
                      value={nuevaAsociacion.canton}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, canton: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Correo electrónico</label>
                    <input 
                      type="email" 
                      className="campo__input" 
                      placeholder="correo@asociacion.cr"
                      value={nuevaAsociacion.email}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, email: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Teléfono</label>
                    <input 
                      type="tel" 
                      className="campo__input" 
                      placeholder="2551-0000"
                      value={nuevaAsociacion.phone}
                      onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, phone: soloCaracteresDeTelefono(e.target.value) })}
                      onBlur={() => setNuevaAsociacion({ ...nuevaAsociacion, phone: normalizarTelefono(nuevaAsociacion.phone).valor || nuevaAsociacion.phone })}
                      maxLength={25}
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Gimnasio o Sede deportiva principal</label>
                  <input 
                    type="text" 
                    className="campo__input" 
                    placeholder="Ej. Gimnasio Polideportivo de Cartago"
                    value={nuevaAsociacion.home_venue}
                    onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, home_venue: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Dirección exacta</label>
                  <textarea 
                    className="campo__input" 
                    rows="2"
                    placeholder="Ubicación física de la sede"
                    value={nuevaAsociacion.address}
                    onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, address: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Estado de afiliación inicial</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={nuevaAsociacion.status}
                    onChange={(e) => setNuevaAsociacion({ ...nuevaAsociacion, status: e.target.value })}
                  >
                    <option value="AFILIADA">AFILIADA</option>
                    <option value="PROVISIONAL">PROVISIONAL</option>
                    <option value="SUSPENDIDA">SUSPENDIDA</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setMostrarModalCrearAsoc(false)}
                  disabled={guardandoAsoc}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoAsoc}>
                  {guardandoAsoc ? 'Registrando…' : 'Registrar asociación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR ASOCIACIÓN (public.associations)
          ══════════════════════════════════════════════════════════════ */}
      {asociacionEditando && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '620px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Editar asociación: {asociacionEditando.name}</h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setAsociacionEditando(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleGuardarEdicionAsoc}>
              <div className="admin-modal__body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                
                {/* Resumen de Dependencias y Consistencia Histórica (RF-AUD-002) */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '0.82rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--texto)' }}>Registros dependientes vinculados:</strong>
                    <span 
                      className={`badge-status ${(asociacionEditando.dependency_count || 0) > 0 ? 'badge-status--activa' : 'badge-status--inactivo'}`}
                      style={{
                        backgroundColor: (asociacionEditando.dependency_count || 0) > 0 ? '#eff6ff' : '#f3f4f6',
                        color: (asociacionEditando.dependency_count || 0) > 0 ? '#1d4ed8' : '#6b7280',
                        fontSize: '0.74rem'
                      }}
                    >
                      {asociacionEditando.dependency_count || 0} dependientes
                    </span>
                  </div>
                  <div style={{ color: '#1e40af', fontSize: '0.76rem', lineHeight: '1.4' }}>
                    {[
                      asociacionEditando.teams_count > 0 && `${asociacionEditando.teams_count} equipos registrados`,
                      asociacionEditando.persons_count > 0 && `${asociacionEditando.persons_count} personas afiliadas`,
                      asociacionEditando.board_count > 0 && `${asociacionEditando.board_count} miembros directivos`,
                      asociacionEditando.profiles_count > 0 && `${asociacionEditando.profiles_count} cuentas de usuario`
                    ].filter(Boolean).join(' · ') || 'Sin registros dependientes vinculados'}.
                    <br />
                    <span style={{ color: 'var(--texto-mudo)' }}>
                      Preservación histórica: Las relaciones con estos registros se conservan de forma íntegra.
                    </span>
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Nombre oficial de la asociación *</label>
                  <input 
                    type="text" 
                    required 
                    className="campo__input" 
                    value={asociacionEditando.name}
                    onChange={(e) => setAsociacionEditando({ ...asociacionEditando, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Siglas / Nombre corto</label>
                    <input 
                      type="text" 
                      className="campo__input" 
                      value={asociacionEditando.short_name}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, short_name: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Cédula Jurídica *</label>
                    <input 
                      type="text" 
                      required 
                      className="campo__input" 
                      value={asociacionEditando.tax_id}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, tax_id: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Provincia</label>
                    <select 
                      className="admin-select"
                      style={{ width: '100%' }}
                      value={asociacionEditando.province || 'San José'}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, province: e.target.value })}
                    >
                      {PROVINCIAS_CR.map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Cantón</label>
                    <input 
                      type="text" 
                      className="campo__input" 
                      value={asociacionEditando.canton || ''}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, canton: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div className="campo">
                    <label className="campo__etiqueta">Correo electrónico</label>
                    <input 
                      type="email" 
                      className="campo__input" 
                      value={asociacionEditando.email || ''}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, email: e.target.value })}
                    />
                  </div>
                  <div className="campo">
                    <label className="campo__etiqueta">Teléfono</label>
                    <input 
                      type="tel" 
                      className="campo__input" 
                      value={asociacionEditando.phone || ''}
                      onChange={(e) => setAsociacionEditando({ ...asociacionEditando, phone: soloCaracteresDeTelefono(e.target.value) })}
                      onBlur={() => setAsociacionEditando({ ...asociacionEditando, phone: normalizarTelefono(asociacionEditando.phone).valor || asociacionEditando.phone })}
                      maxLength={25}
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Gimnasio o Sede deportiva principal</label>
                  <input 
                    type="text" 
                    className="campo__input" 
                    value={asociacionEditando.home_venue || ''}
                    onChange={(e) => setAsociacionEditando({ ...asociacionEditando, home_venue: e.target.value })}
                  />
                </div>

                <div className="campo" style={{ marginBottom: '14px' }}>
                  <label className="campo__etiqueta">Dirección exacta</label>
                  <textarea 
                    className="campo__input" 
                    rows="2"
                    value={asociacionEditando.address || ''}
                    onChange={(e) => setAsociacionEditando({ ...asociacionEditando, address: e.target.value })}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta">Estado de afiliación</label>
                  <select 
                    className="admin-select"
                    style={{ width: '100%' }}
                    value={asociacionEditando.status}
                    onChange={(e) => setAsociacionEditando({ ...asociacionEditando, status: e.target.value })}
                  >
                    <option value="AFILIADA">AFILIADA</option>
                    <option value="PROVISIONAL">PROVISIONAL</option>
                    <option value="SUSPENDIDA">SUSPENDIDA</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal__footer">
                <button 
                  type="button" 
                  className="admin-btn admin-btn--secondary"
                  onClick={() => setAsociacionEditando(null)}
                  disabled={guardandoEdicionAsoc}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={guardandoEdicionAsoc}>
                  {guardandoEdicionAsoc ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════
          MODAL: CONFIRMACIÓN Y ADVERTENCIA DE DEPENDENCIAS (RF-AUD-002)
          ══════════════════════════════════════════════════════════════ */}
      {modalConfirmacionDesactivar && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {modalConfirmacionDesactivar.bloqueado
                  ? <><Icono nombre="prohibido" tam={20} /> Operación bloqueada</>
                  : <><Icono nombre="alerta" tam={20} /> Advertencia de consistencia histórica</>}
              </h3>
              <button 
                type="button" 
                className="admin-modal__close" 
                onClick={() => setModalConfirmacionDesactivar(null)}
              >
                &times;
              </button>
            </div>
            <div className="admin-modal__body">
              {modalConfirmacionDesactivar.bloqueado ? (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', color: '#991b1b' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.92rem', fontWeight: 700 }}>
                    No se puede desactivar este valor
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: '1.45' }}>
                    {modalConfirmacionDesactivar.mensajeBloqueo}
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '0.88rem', color: 'var(--texto)', marginTop: 0, lineHeight: 1.5 }}>
                    Está a punto de desactivar o suspender <strong>«{modalConfirmacionDesactivar.nombre}»</strong>.
                  </p>

                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#92400e', fontWeight: 700, fontSize: '0.88rem' }}>
                      <span>Registros en el sistema que dependen de este elemento ({modalConfirmacionDesactivar.totalDependencias}):</span>
                    </div>
                    <ul style={{ margin: '0 0 0 16px', padding: 0, fontSize: '0.84rem', color: '#78350f', lineHeight: 1.6 }}>
                      {modalConfirmacionDesactivar.detalles.map((d, idx) => (
                        <li key={idx}><strong>{d.conteo}</strong> {d.etiqueta}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '0.8rem',
                    color: 'var(--texto-mudo)',
                    lineHeight: 1.45
                  }}>
                    <strong style={{ color: 'var(--texto)' }}>Preservación de Consistencia Histórica:</strong>
                    <br />
                    Las referencias y relaciones de los registros existentes permanecerán intactas para garantizar la integridad histórica y trazabilidad en bitácoras. Sin embargo, este registro ya no podrá seleccionarse para nuevas transacciones ni formularios.
                  </div>
                </>
              )}
            </div>
            <div className="admin-modal__footer">
              <button 
                type="button" 
                className="admin-btn admin-btn--secondary"
                onClick={() => setModalConfirmacionDesactivar(null)}
              >
                {modalConfirmacionDesactivar.bloqueado ? 'Entendido' : 'Cancelar'}
              </button>
              {!modalConfirmacionDesactivar.bloqueado && (
                <button 
                  type="button" 
                  className="admin-btn"
                  style={{ backgroundColor: '#dc2626', color: '#fff', borderColor: '#b91c1c' }}
                  onClick={modalConfirmacionDesactivar.onConfirmar}
                  disabled={ejecutandoDesactivacion}
                >
                  {ejecutandoDesactivacion ? 'Procesando…' : 'Confirmar desactivación'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
