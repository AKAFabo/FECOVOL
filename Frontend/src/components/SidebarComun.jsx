import { NavLink } from 'react-router-dom';

/**
 * Caja superior de rol con dropdown normalizado para cambiar de rol activo.
 * Se adapta al color y tema de cada entorno manteniendo la misma estructura (RF-SEG-006).
 */
export function SidebarRoleBox({
  rolesDisponibles = [],
  usuarioActual = {},
  cambiandoRol = false,
  onCambiarRol,
  rolEntornoActual = null
}) {
  // Buscar el rol que calza con el entorno actual (ej: 'Representante' en /asociacion)
  const rolCorrespondiente = rolEntornoActual
    ? rolesDisponibles.find(r => {
        const nombreR = String(r.name || '').trim().toLowerCase();
        const entorno = String(rolEntornoActual || '').trim().toLowerCase();
        return nombreR === entorno || nombreR.includes(entorno) || entorno.includes(nombreR);
      })
    : null;

  // El dropdown selecciona el rol del entorno actual, o el rol activo en sessionStorage, o usuarioActual.roleId
  const storedRoleId = typeof window !== 'undefined' ? sessionStorage.getItem('fecovol_active_role_id') : null;
  const valorSeleccionado = rolCorrespondiente?.id || (rolesDisponibles.some(r => r.id === storedRoleId) ? storedRoleId : null) || usuarioActual.roleId || '';

  return (
    <div className="admin-sidebar__role-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <span className="admin-sidebar__role-label">Rol</span>
        {rolesDisponibles.length > 1 && (
          <span className="admin-sidebar__role-count">
            {rolesDisponibles.length} roles
          </span>
        )}
      </div>
      <select
        className="admin-sidebar__role-select"
        value={valorSeleccionado}
        onChange={(e) => {
          const val = e.target.value;
          if (val && onCambiarRol) {
            onCambiarRol(val);
          }
        }}
        disabled={cambiandoRol || rolesDisponibles.length <= 1}
        aria-label="Cambiar visualización de rol"
        title={rolesDisponibles.length > 1 ? 'Cambiar rol activo' : `Rol activo: ${usuarioActual.rol || rolEntornoActual}`}
      >
        {rolesDisponibles.length > 0 ? (
          rolesDisponibles.map((r) => (
            <option key={r.id} value={r.id} style={{ color: '#0f172a', background: '#fff' }}>
              {r.name}
            </option>
          ))
        ) : (
          <option value={valorSeleccionado} style={{ color: '#0f172a', background: '#fff' }}>
            {usuarioActual.rol || rolEntornoActual || 'Rol'}
          </option>
        )}
      </select>
    </div>
  );
}

/**
 * Pie inferior del sidebar con el enlace a "Mi perfil y seguridad" y botón de "Cerrar sesión" con ícono (RF-SEG-002).
 */
export function SidebarFooter({
  rutaPerfil,
  onCerrarSesion
}) {
  return (
    <div className="admin-sidebar__footer">
      <NavLink
        to={rutaPerfil}
        className={({ isActive }) =>
          `admin-sidebar__profile-btn ${isActive ? 'admin-sidebar__profile-btn--active' : ''}`
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Mi perfil y seguridad</span>
      </NavLink>

      <button
        type="button"
        className="admin-sidebar__logout"
        onClick={onCerrarSesion}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Cerrar sesión</span>
      </button>
    </div>
  );
}
