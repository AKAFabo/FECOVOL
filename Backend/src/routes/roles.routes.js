const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const authorize = require('../middleware/authorize');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

const router = express.Router();
router.param('id', validateUuidParams);

// Lista oficial de subrutas y entornos del sistema administrables (RF-SEG-005)
const TODAS_LAS_SUBRUTAS = [
  '/admin',             // Entorno de Administración FECOVOL
  '/arbitro',           // Entorno de Cuerpo Arbitral
  '/asociacion',        // Entorno de Representante de Asociación
  '/personal',          // Entorno de Personal Técnico
  '/admin/usuarios',    // Subruta interna: Usuarios y permisos
  '/admin/listas-valores', // Subruta interna: Listas de valores y roles
  '/admin/auditoria',   // Subruta interna: Auditoría y respaldos
  '/admin/perfil'       // Subruta interna: Perfil y sesiones
];

// GET /api/roles -> Obtener roles con sus permisos asignados y conteo de usuarios (RF-SEG-005)
router.get('/', asyncHandler(async (req, res) => {
  // 1. Obtener lista de roles
  const { data: roles, error: errRoles } = await supabase
    .from('roles')
    .select('id, name, description')
    .order('name');

  const err = fromSupabase(errRoles, 'Roles');
  if (err) throw err;

  // 2. Obtener permisos de cada rol (con fallback si role_permissions no existe aún)
  let permisosPorRol = {};
  try {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('role_id, screen_key');

    if (rolePerms) {
      rolePerms.forEach(rp => {
        if (!permisosPorRol[rp.role_id]) permisosPorRol[rp.role_id] = [];
        permisosPorRol[rp.role_id].push(rp.screen_key);
      });
    }
  } catch (e) {
    console.warn('Aviso: tabla role_permissions no disponible aún:', e.message);
  }

  // 3. Obtener conteo de usuarios asignados a cada rol
  let conteoUsuarios = {};
  try {
    // A) Desde user_roles (N * M)
    const { data: urData } = await supabase
      .from('user_roles')
      .select('role_id, user_id');

    if (urData) {
      const userRolePairs = new Set();
      urData.forEach(ur => {
        userRolePairs.add(`${ur.role_id}::${ur.user_id}`);
      });
      userRolePairs.forEach(pair => {
        const [rId] = pair.split('::');
        conteoUsuarios[rId] = (conteoUsuarios[rId] || 0) + 1;
      });
    }

    // B) Desde user_profiles.role_id (fallback si no están en user_roles)
    const { data: upData } = await supabase
      .from('user_profiles')
      .select('id, role_id');

    if (upData) {
      upData.forEach(up => {
        if (up.role_id && !conteoUsuarios[up.role_id]) {
          conteoUsuarios[up.role_id] = (conteoUsuarios[up.role_id] || 0) + 1;
        }
      });
    }
  } catch (e) {
    console.warn('Aviso al calcular conteo de usuarios por rol:', e.message);
  }

  // 4. Mapear y normalizar
  const rolesFormateados = (roles || []).map(r => {
    // Si no tiene permisos en BD aún, asignarle subrutas por defecto según su rol
    let perms = permisosPorRol[r.id];
    if (!perms || perms.length === 0) {
      if (r.name === 'Administrador') perms = [...TODAS_LAS_SUBRUTAS];
      else if (r.name === 'Personal') perms = ['/personal'];
      else if (r.name === 'Representante') perms = ['/asociacion'];
      else if (r.name === 'Arbitro') perms = ['/arbitro'];
      else perms = ['/admin'];
    }

    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      permissions: perms,
      assigned_users_count: conteoUsuarios[r.id] || 0,
      is_system_role: ['Administrador', 'Personal', 'Representante', 'Arbitro'].includes(r.name)
    };
  });

  res.json({ data: rolesFormateados });
}));

// POST /api/roles -> Crear nuevo rol con permisos iniciales (RF-SEG-005 / RF-SEG-010)
router.post('/', authorize({ requiredPermission: '/admin/listas-valores', resourceTable: 'roles' }), asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  // Quién ejecuta la acción sale del token verificado, nunca del cuerpo de la solicitud.
  const admin_email = req.authorizedUser?.email || req.currentUser;

  if (!name || typeof name !== 'string' || !name.trim()) {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'roles',
      motivo: 'Operación denegada: El nombre del rol es obligatorio.',
      endpoint: 'POST /api/roles',
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(400, 'El nombre del rol es obligatorio.');
  }

  const nombreLimpio = name.trim();

  // 1. Verificar si ya existe un rol con ese nombre (case-insensitive)
  const { data: existente } = await supabase
    .from('roles')
    .select('id, name')
    .ilike('name', nombreLimpio)
    .maybeSingle();

  if (existente) {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'roles',
      registroId: existente.id,
      motivo: `Operación denegada: Ya existe un rol con el nombre "${nombreLimpio}".`,
      endpoint: 'POST /api/roles',
      ip: getClientIp(req),
      datosIntentados: req.body
    });
    throw new HttpError(400, `Ya existe un rol con el nombre "${nombreLimpio}".`);
  }

  // 2. Insertar rol en public.roles
  const { data: nuevoRol, error: errInsert } = await supabase
    .from('roles')
    .insert({
      name: nombreLimpio,
      description: description?.trim() || null
    })
    .select('id, name, description')
    .single();

  const err = fromSupabase(errInsert, 'Rol');
  if (err) throw err;

  // 3. Insertar permisos en public.role_permissions
  const pantallasAsignadas = Array.isArray(permissions) ? permissions : ['/admin'];
  if (pantallasAsignadas.length > 0) {
    try {
      const inserts = pantallasAsignadas.map(screen => ({
        role_id: nuevoRol.id,
        screen_key: screen
      }));
      await supabase.from('role_permissions').insert(inserts);
    } catch (ePerms) {
      console.warn('Aviso al insertar permisos del nuevo rol:', ePerms.message);
    }
  }

  // 4. Auditar creación en audit_logs
  try {
    await supabase.from('audit_logs').insert([{
      usuario: admin_email || 'Administrador',
      accion: 'INSERT',
      tabla: 'roles',
      registro_id: nuevoRol.id,
      registro_nuevo: {
        evento: 'Creación de rol y configuración de permisos',
        role_id: nuevoRol.id,
        name: nuevoRol.name,
        description: nuevoRol.description,
        permissions: pantallasAsignadas,
        creado_por: admin_email || 'Administrador',
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (eAudit) {}

  res.status(201).json({
    success: true,
    data: {
      ...nuevoRol,
      permissions: pantallasAsignadas,
      assigned_users_count: 0
    },
    message: `Rol "${nuevoRol.name}" creado con éxito.`
  });
}));

// PUT /api/roles/:id -> Editar información y matriz de permisos de un rol (RF-SEG-005 / RF-SEG-010)
router.put('/:id', authorize({ requiredPermission: '/admin/listas-valores', resourceTable: 'roles' }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, permissions } = req.body;
  // Quién ejecuta la acción sale del token verificado, nunca del cuerpo de la solicitud.
  const admin_email = req.authorizedUser?.email || req.currentUser;

  // 1. Consultar rol actual
  const { data: rolActual, error: errGet } = await supabase
    .from('roles')
    .select('id, name, description')
    .eq('id', id)
    .single();

  const errNotFound = fromSupabase(errGet, 'Rol');
  if (errNotFound || !rolActual) throw new HttpError(404, 'Rol no encontrado');

  // Si intentan renombrar a un nombre ya existente en otro rol
  if (name && name.trim().toLowerCase() !== rolActual.name.toLowerCase()) {
    const { data: otroConMismoNombre } = await supabase
      .from('roles')
      .select('id')
      .ilike('name', name.trim())
      .neq('id', id)
      .maybeSingle();

    if (otroConMismoNombre) {
      await logDeniedAttempt({
        usuario: admin_email || req.authorizedUser?.email || 'Administrador',
        accion: 'OPERACION_INVALIDA',
        tabla: 'roles',
        registroId: id,
        motivo: `Operación denegada: Ya existe otro rol con el nombre "${name.trim()}".`,
        endpoint: `PUT /api/roles/${id}`,
        ip: getClientIp(req),
        datosIntentados: req.body
      });
      throw new HttpError(400, `Ya existe otro rol con el nombre "${name.trim()}".`);
    }
  }

  // Validación de seguridad (RF-SEG-010): El rol Administrador no puede ser despojado del acceso al entorno /admin
  if (rolActual.name === 'Administrador' && Array.isArray(permissions) && !permissions.includes('/admin')) {
    await logDeniedAttempt({
      usuario: admin_email || req.authorizedUser?.email || 'Administrador',
      accion: 'OPERACION_INVALIDA',
      tabla: 'roles',
      registroId: id,
      motivo: 'Operación denegada: El rol Administrador debe conservar el acceso al entorno /admin',
      endpoint: `PUT /api/roles/${id}`,
      ip: getClientIp(req),
      datosIntentados: { permissions }
    });
    throw new HttpError(400, 'Operación no permitida: El rol Administrador debe conservar el acceso al entorno /admin.');
  }

  const nuevoNombre = name?.trim() || rolActual.name;
  const nuevaDescripcion = description !== undefined ? (description?.trim() || null) : rolActual.description;

  // 2. Actualizar registro en public.roles
  const { data: rolActualizado, error: errUpdate } = await supabase
    .from('roles')
    .update({
      name: nuevoNombre,
      description: nuevaDescripcion
    })
    .eq('id', id)
    .select('id, name, description')
    .single();

  const errUp = fromSupabase(errUpdate, 'Rol');
  if (errUp) throw errUp;

  // 3. Actualizar matriz de permisos en public.role_permissions
  let permisosFinales = [];
  if (Array.isArray(permissions)) {
    permisosFinales = permissions;
    try {
      await supabase.from('role_permissions').delete().eq('role_id', id);
      if (permisosFinales.length > 0) {
        const inserts = permisosFinales.map(screen => ({
          role_id: id,
          screen_key: screen
        }));
        await supabase.from('role_permissions').insert(inserts);
      }
    } catch (ePerms) {
      console.warn('Aviso al sincronizar role_permissions:', ePerms.message);
    }
  }

  // 4. Auditar actualización en audit_logs
  try {
    await supabase.from('audit_logs').insert([{
      usuario: admin_email || 'Administrador',
      accion: 'UPDATE',
      tabla: 'roles',
      registro_id: id,
      registro_viejo: {
        name: rolActual.name,
        description: rolActual.description
      },
      registro_nuevo: {
        evento: 'Actualización de rol y matriz de permisos',
        name: nuevoNombre,
        description: nuevaDescripcion,
        permissions: permisosFinales,
        actualizado_por: admin_email || 'Administrador',
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (eAudit) {}

  res.json({
    success: true,
    data: {
      ...rolActualizado,
      permissions: permisosFinales
    },
    message: `Rol "${nuevoNombre}" actualizado con éxito.`
  });
}));

// DELETE /api/roles/:id -> Eliminar rol con validación preventiva de usuarios asignados (RF-SEG-005 / RF-SEG-010)
router.delete('/:id', authorize({ requiredPermission: '/admin/listas-valores', resourceTable: 'roles' }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const admin_email = req.authorizedUser?.email || req.currentUser; // del token verificado

  // 1. Consultar rol
  const { data: rol, error: errRol } = await supabase
    .from('roles')
    .select('id, name')
    .eq('id', id)
    .single();

  const errNotFound = fromSupabase(errRol, 'Rol');
  if (errNotFound || !rol) throw new HttpError(404, 'Rol no encontrado.');

  // Validación preventiva: Impedir eliminar el rol Administrador del sistema
  if (rol.name === 'Administrador') {
    await logDeniedAttempt({
      usuario: admin_email,
      accion: 'OPERACION_INVALIDA',
      tabla: 'roles',
      registroId: id,
      motivo: 'Operación denegada: Intento de eliminar el rol Administrador del sistema',
      endpoint: `DELETE /api/roles/${id}`,
      ip: getClientIp(req),
      datosIntentados: { id, rol: rol.name }
    });

    throw new HttpError(400, 'Operación no permitida: El rol Administrador es fundamental para el sistema y no puede ser eliminado.');
  }

  // 2. Validación RF-SEG-005 (Criterio 5) / RF-SEG-010: Impedir eliminar rol con usuarios asignados
  let totalUsuariosAsignados = 0;

  // A) Verificar en user_roles
  try {
    const { count: countUserRoles } = await supabase
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role_id', id);

    totalUsuariosAsignados += (countUserRoles || 0);
  } catch (e) {}

  // B) Verificar en user_profiles
  try {
    const { count: countUserProfiles } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', id);

    totalUsuariosAsignados += (countUserProfiles || 0);
  } catch (e) {}

  if (totalUsuariosAsignados > 0) {
    // Registrar intento denegado en bitácora
    await logDeniedAttempt({
      usuario: admin_email,
      accion: 'OPERACION_INVALIDA',
      tabla: 'roles',
      registroId: id,
      motivo: `Operación denegada: Intento de eliminar rol "${rol.name}" con ${totalUsuariosAsignados} usuario(s) asignado(s)`,
      endpoint: `DELETE /api/roles/${id}`,
      ip: getClientIp(req),
      datosIntentados: { id, rol_nombre: rol.name, totalUsuariosAsignados }
    });

    throw new HttpError(
      400,
      `Operación no permitida: No se puede eliminar el rol "${rol.name}" porque tiene ${totalUsuariosAsignados} cuenta(s) de usuario asignada(s). Reasigne o desvincule los usuarios antes de eliminar el rol.`
    );
  }

  // 3. Si no tiene usuarios asignados, proceder a eliminar
  const { error: errDelete } = await supabase
    .from('roles')
    .delete()
    .eq('id', id);

  const errDel = fromSupabase(errDelete, 'Rol');
  if (errDel) throw errDel;

  // 4. Auditar eliminación exitosa
  try {
    await supabase.from('audit_logs').insert([{
      usuario: admin_email,
      accion: 'DELETE',
      tabla: 'roles',
      registro_id: id,
      registro_viejo: {
        id: rol.id,
        name: rol.name
      },
      registro_nuevo: {
        evento: 'Eliminación de rol del sistema',
        eliminado_por: admin_email,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (eAudit) {}

  res.json({
    success: true,
    message: `El rol "${rol.name}" ha sido eliminado exitosamente.`
  });
}));

module.exports = router;
