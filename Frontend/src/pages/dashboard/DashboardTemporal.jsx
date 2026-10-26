import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';

/**
 * Página temporal de bienvenida para un rol específico.
 * Muestra el nombre del rol, correo y dropdown para cambiar de visualización de rol (RF-SEG-006).
 */
export default function DashboardTemporal({ rol, colorRol = '#0e3b6b' }) {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState({ id: null, email: '', roleId: null });
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [cambiandoRol, setCambiandoRol] = useState(false);

  useEffect(() => {
    async function cargarRolesUsuario() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_id, full_name, roles:roles!user_profiles_role_id_fkey(id, name)')
          .eq('id', user.id)
          .single();

        setUsuario({
          id: user.id,
          email: user.email || '',
          roleId: profile?.role_id
        });

        // Obtener roles desde user_roles (N * M) (RF-SEG-006)
        let lista = [];
        try {
          const { data: userRoles } = await supabase
            .from('user_roles')
            .select('role_id, roles(id, name)')
            .eq('user_id', user.id);

          if (userRoles && userRoles.length > 0) {
            lista = userRoles.map(ur => ur.roles).filter(Boolean);
          }
        } catch (e) {}

        if (lista.length === 0 && profile?.roles) {
          lista = [{ id: profile.roles.id, name: profile.roles.name }];
        }

        setRolesDisponibles(lista);
      } catch (e) {
        console.warn('Aviso al cargar roles en DashboardTemporal:', e);
      }
    }

    cargarRolesUsuario();
  }, []);

  const handleCambiarRolActivo = async (nuevoRoleId) => {
    if (!usuario.id || nuevoRoleId === usuario.roleId) return;
    const rolObj = rolesDisponibles.find(r => r.id === nuevoRoleId);
    if (!rolObj) return;

    setCambiandoRol(true);
    try {
      sessionStorage.setItem('fecovol_role_switched_locally', 'true');

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      await fetch(`${backendUrl}/api/users/switch-active-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: usuario.id,
          role_id: nuevoRoleId
        })
      });

      const RUTA_POR_ROL = {
        'Administrador': '/admin/panel',
        'Personal':      '/personal',
        'Representante': '/asociacion',
        'Arbitro':       '/arbitro',
      };
      navigate(RUTA_POR_ROL[rolObj.name] || '/admin/panel');
    } catch (err) {
      console.error('Error al cambiar de rol activo:', err);
    } finally {
      setCambiandoRol(false);
    }
  };

  async function cerrarSesion() {
    await supabase.auth.signOut();
    navigate('/ingresar');
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f6f8',
      fontFamily: "'Source Sans 3', system-ui, sans-serif",
      gap: '20px',
      padding: '24px',
    }}>
      {/* Badge de rol actual */}
      <span style={{
        background: colorRol,
        color: '#fff',
        borderRadius: '999px',
        padding: '6px 20px',
        fontSize: '0.85rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        {rol}
      </span>

      {/* Mensaje principal */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Archivo', system-ui, sans-serif",
          fontSize: '1.75rem',
          color: '#17212b',
          margin: '0 0 8px 0',
        }}>
          Bienvenido al sistema FECOVOL
        </h1>
        {usuario.email && (
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 10px 0' }}>
            Sesión activa: <strong>{usuario.email}</strong>
          </p>
        )}
        <p style={{ color: '#5d6b7a', margin: 0, maxWidth: 440, lineHeight: 1.4, fontSize: '0.92rem' }}>
          El módulo de <strong>{rol}</strong> está en construcción. Esta pantalla confirma
          que el acceso y las credenciales funcionan correctamente.
        </p>
      </div>

      {/* Dropdown para cambiar de visualización de rol (RF-SEG-006) */}
      {rolesDisponibles.length > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '8px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <label htmlFor="select-rol-dashboard" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
            Cambiar visualización:
          </label>
          <select
            id="select-rol-dashboard"
            value={usuario.roleId || ''}
            onChange={(e) => handleCambiarRolActivo(e.target.value)}
            disabled={cambiandoRol}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #94a3b8',
              background: '#f8fafc',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer'
            }}
          >
            {rolesDisponibles.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={cerrarSesion}
        style={{
          padding: '10px 24px',
          background: '#0e3b6b',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontFamily: "'Archivo', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: '0.9375rem',
          cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
