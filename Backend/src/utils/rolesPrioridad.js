/**
 * Módulo de jerarquía y prioridad de roles (RF-SEG-006).
 * Regla de negocio:
 * Un usuario.role_id debe contener el rol con mayor prioridad en todo momento:
 * 1. Administrador -> 2. Representante -> 3. Personal -> 4. Árbitro
 */

const PRIORIDAD_ROLES = {
  'administrador': 1,
  'admin': 1,
  'representante': 2,
  'personal': 3,
  'arbitro': 4,
  'árbitro': 4
};

function normalizarNombreRol(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function obtenerPuntuacionRol(name) {
  const norm = normalizarNombreRol(name);
  return PRIORIDAD_ROLES[norm] || 99;
}

/**
 * Retorna el role_id con mayor prioridad de una lista de IDs.
 *
 * @param {Array<string>} roleIds Lista de UUIDs de roles
 * @param {object} supabase Instancia de Supabase
 * @returns {Promise<string|null>} El ID del rol con mayor prioridad
 */
async function obtenerRolMayorPrioridad(roleIds, supabase) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return null;
  const idsLimpios = [...new Set(roleIds.filter(Boolean))];
  if (idsLimpios.length === 0) return null;
  if (idsLimpios.length === 1) return idsLimpios[0];

  try {
    const { data: rolesData, error } = await supabase
      .from('roles')
      .select('id, name')
      .in('id', idsLimpios);

    if (error || !Array.isArray(rolesData) || rolesData.length === 0) {
      return idsLimpios[0];
    }

    rolesData.sort((a, b) => {
      const prioA = obtenerPuntuacionRol(a.name);
      const prioB = obtenerPuntuacionRol(b.name);
      return prioA - prioB;
    });

    return rolesData[0].id;
  } catch (err) {
    return idsLimpios[0];
  }
}

/**
 * Verifica y auto-repara el role_id de un usuario en user_profiles
 * para garantizar que siempre guarde el rol de mayor prioridad asignado en user_roles.
 *
 * @param {string} userId UUID del usuario
 * @param {object} supabase Instancia de Supabase
 * @returns {Promise<string|null>} El role_id de mayor prioridad asignado
 */
async function asegurarRolMayorPrioridadUsuario(userId, supabase) {
  if (!userId || !supabase) return null;

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, role_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return null;

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);

    const allRoleIds = [profile.role_id, ...(userRoles || []).map(r => r.role_id)].filter(Boolean);
    if (allRoleIds.length === 0) return null;

    const mayorPrioId = await obtenerRolMayorPrioridad(allRoleIds, supabase);

    if (mayorPrioId && mayorPrioId !== profile.role_id) {
      await supabase
        .from('user_profiles')
        .update({ role_id: mayorPrioId, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }

    return mayorPrioId;
  } catch (err) {
    console.warn('Aviso en asegurarRolMayorPrioridadUsuario:', err.message);
    return null;
  }
}

module.exports = {
  PRIORIDAD_ROLES,
  normalizarNombreRol,
  obtenerPuntuacionRol,
  obtenerRolMayorPrioridad,
  asegurarRolMayorPrioridadUsuario
};
