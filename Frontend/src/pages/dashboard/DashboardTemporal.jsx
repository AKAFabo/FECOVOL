import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';

/**
 * Página temporal de bienvenida para un rol específico.
 * Muestra el nombre del rol y el correo del usuario autenticado.
 * Reemplazar con el dashboard real de cada módulo cuando esté listo.
 */
export default function DashboardTemporal({ rol, colorRol = '#0e3b6b' }) {
  const navigate = useNavigate();

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
      gap: '16px',
      padding: '24px',
    }}>
      {/* Badge de rol */}
      <span style={{
        background: colorRol,
        color: '#fff',
        borderRadius: '999px',
        padding: '4px 16px',
        fontSize: '0.8rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        {rol}
      </span>

      {/* Mensaje */}
      <h1 style={{
        fontFamily: "'Archivo', system-ui, sans-serif",
        fontSize: '1.75rem',
        color: '#17212b',
        margin: 0,
        textAlign: 'center',
      }}>
        Bienvenido al sistema FECOVOL
      </h1>
      <p style={{ color: '#5d6b7a', margin: 0, textAlign: 'center', maxWidth: 400 }}>
        El panel de <strong>{rol}</strong> está en construcción. Esta pantalla confirma
        que el inicio de sesión y la redirección por rol funcionan correctamente.
      </p>

      <button
        onClick={cerrarSesion}
        style={{
          marginTop: '8px',
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
