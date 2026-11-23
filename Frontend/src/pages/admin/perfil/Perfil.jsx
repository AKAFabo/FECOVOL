import { useState, useEffect } from 'react';
import '../AdminCommon.css';
import { supabase } from '../../../supabaseClient.js';
import { evaluarPoliticaPassword } from '../../../utils/passwordPolicy.js';
import IndicadorPoliticaPassword from '../../../components/IndicadorPoliticaPassword.jsx';
import { api } from '../../../services/apiInterna.js';

function IconoOjo({ visible }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function Perfil() {
  const [usuario, setUsuario] = useState(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(true);

  // Estados para cambio de contraseña (RF-SEG-007)
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [passConfirmar, setPassConfirmar] = useState('');
  const [verPassActual, setVerPassActual] = useState(false);
  const [verPassNueva, setVerPassNueva] = useState(false);
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [errorPass, setErrorPass] = useState('');
  const [exitoPass, setExitoPass] = useState('');

  // Estados para sesiones activas (RF-SEG-003, RF-SEG-007)
  const [sesiones, setSesiones] = useState([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(true);
  const [cerrandoOtras, setCerrandoOtras] = useState(false);
  const [mensajeSesiones, setMensajeSesiones] = useState('');

  // Cargar perfil del usuario autenticado
  async function cargarPerfil() {
    setCargandoPerfil(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          id,
          email,
          full_name,
          status,
          last_login,
          organization_id,
          roles:roles!user_profiles_role_id_fkey ( name ),
          associations:organization_id ( name )
        `)
        .eq('id', user.id)
        .single();

      setUsuario({
        id: user.id,
        email: user.email,
        nombre: profile?.full_name || user.email?.split('@')[0],
        rol: profile?.roles?.name || 'Administración FECOVOL',
        estado: profile?.status || 'ACTIVA',
        asociacion: profile?.associations?.name || 'FECOVOL Central',
        ultimoIngreso: profile?.last_login ? new Date(profile.last_login).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Esta sesión'
      });
    } catch (err) {
      console.error('Error al cargar perfil:', err);
    } finally {
      setCargandoPerfil(false);
    }
  }

  // Cargar sesiones activas
  async function cargarSesiones(userId) {
    if (!userId) return;
    setCargandoSesiones(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/users/sessions/${userId}`);
      if (res.ok) {
        const json = await res.json();
        setSesiones(json.data || []);
      }
    } catch (err) {
      console.warn('Error al cargar sesiones activas:', err);
    } finally {
      setCargandoSesiones(false);
    }
  }

  useEffect(() => {
    cargarPerfil();
  }, []);

  useEffect(() => {
    if (usuario?.id) {
      cargarSesiones(usuario.id);
    }
  }, [usuario?.id]);

  // Manejo de cambio de contraseña con validación de política y contraseña actual (RF-SEG-007)
  const handleCambiarContrasena = async (e) => {
    e.preventDefault();
    setErrorPass('');
    setExitoPass('');

    // 1. Validar que la contraseña actual fue ingresada
    if (!passActual.trim()) {
      setErrorPass('Por favor ingrese su contraseña actual para verificar su identidad.');
      return;
    }

    // 2. Validar política de seguridad de la nueva contraseña (8 chars, mayúscula, número, símbolo)
    const evaluacion = evaluarPoliticaPassword(passNueva);
    if (!evaluacion.esValida) {
      setErrorPass(evaluacion.errores[0]);
      return;
    }

    // 3. Validar que no sea igual a la actual
    if (passActual === passNueva) {
      setErrorPass('La nueva contraseña debe ser diferente a la contraseña actual.');
      return;
    }

    // 4. Validar confirmación
    if (passNueva !== passConfirmar) {
      setErrorPass('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    setGuardandoPass(true);
    try {
      // Paso 1: Validar la contraseña actual autenticando nuevamente con Supabase
      const { error: errReAuth } = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: passActual
      });

      if (errReAuth) {
        setErrorPass('La contraseña actual ingresada es incorrecta.');
        return;
      }

      // Paso 2: Actualizar la contraseña en Supabase Auth
      const { error: errUpdate } = await supabase.auth.updateUser({
        password: passNueva
      });

      if (errUpdate) throw errUpdate;

      // Paso 3: Registrar marca local para que esta pestaña no se desconecte
      sessionStorage.setItem('fecovol_password_changed_locally', 'true');

      // Paso 4: Registrar el cambio en la bitácora (lo hace el backend con el usuario del token)
      try {
        await api.post('/users/me/contrasena-actualizada', { motivo: 'CAMBIADA' });
      } catch (e) {
        console.warn('No se pudo registrar el cambio de contraseña en la bitácora:', e.message);
      }

      // Paso 5: Cerrar todas las demás sesiones activas (RF-SEG-007)
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
        await fetch(`${backendUrl}/api/users/revoke-other-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: usuario.id,
            email: usuario.email
          })
        });
      } catch (e) {}

      setExitoPass('Su contraseña ha sido cambiada con éxito. Por seguridad, cualquier otra sesión abierta en otros dispositivos ha sido cerrada.');
      setPassActual('');
      setPassNueva('');
      setPassConfirmar('');

      // Recargar sesiones activas
      await cargarSesiones(usuario.id);
    } catch (err) {
      console.error('Error al actualizar contraseña:', err);
      setErrorPass('No se pudo actualizar la contraseña: ' + err.message);
    } finally {
      setGuardandoPass(false);
    }
  };

  // Cerrar otras sesiones manualmente
  const handleCerrarOtrasSesiones = async () => {
    if (!usuario?.id) return;
    setCerrandoOtras(true);
    setMensajeSesiones('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      await fetch(`${backendUrl}/api/users/revoke-other-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: usuario.id,
          email: usuario.email
        })
      });
      setMensajeSesiones('Todas las demás sesiones han sido revocadas con éxito.');
      await cargarSesiones(usuario.id);
    } catch (err) {
      setMensajeSesiones('Error al cerrar otras sesiones: ' + err.message);
    } finally {
      setCerrandoOtras(false);
    }
  };

  if (cargandoPerfil) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
        Cargando perfil de usuario...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Mi perfil y seguridad</h1>
          <p className="admin-page-header__subtitle">
            Administre sus datos personales, políticas de seguridad y sesiones activas.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Columna Izquierda: Datos del Usuario + Sesiones Activas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Tarjeta 1: Información de Perfil */}
          <div className="admin-card">
            <div className="admin-card__header">
              <h2 className="admin-card__title">Información de la cuenta</h2>
              <span className={`badge-status ${usuario?.estado === 'ACTIVA' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                {usuario?.estado}
              </span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--rojo)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.3rem',
                  fontFamily: 'var(--fuente-titulo)'
                }}>
                  {usuario?.nombre?.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--texto)' }}>{usuario?.nombre}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>{usuario?.email}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Rol en el sistema
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--texto)' }}>{usuario?.rol}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Organización
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--texto)' }}>{usuario?.asociacion}</span>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--texto-mudo)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Último acceso registrado
                  </span>
                  <span style={{ color: 'var(--texto-suave)' }}>{usuario?.ultimoIngreso}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta 2: Sesiones Activas (RF-SEG-003, RF-SEG-007) */}
          <div className="admin-card">
            <div className="admin-card__header">
              <h2 className="admin-card__title">Sesiones activas</h2>
              <span className="admin-card__badge">{sesiones.length} sesiones</span>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--texto-mudo)', lineHeight: '1.45' }}>
                Dispositivos y navegadores que tienen una sesión abierta con sus credenciales.
              </p>

              {mensajeSesiones && (
                <div className="alerta" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                  {mensajeSesiones}
                </div>
              )}

              {cargandoSesiones ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--texto-mudo)' }}>Cargando sesiones…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                  {sesiones.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      style={{
                        padding: '12px 14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--texto)' }}>
                            {s.user_agent?.includes('Mozilla') ? 'Navegador Web' : (s.user_agent || 'Sesión Web')}
                          </span>
                          {(s.es_actual || idx === 0) && (
                            <span style={{
                              background: '#dcfce7',
                              color: '#166534',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              ● Esta sesión (Actual)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)', marginTop: '4px' }}>
                          IP: {s.ip || '127.0.0.1'} · Última actividad: {new Date(s.updated_at || s.created_at).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={handleCerrarOtrasSesiones}
                disabled={cerrandoOtras || sesiones.length <= 1}
              >
                {cerrandoOtras ? 'Cerrando sesiones…' : 'Cerrar todas las demás sesiones'}
              </button>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Formulario de Cambiar Contraseña (RF-SEG-007) */}
        <div className="admin-card">
          <div className="admin-card__header">
            <h2 className="admin-card__title">Cambiar mi contraseña</h2>
            <span className="admin-card__badge">Seguridad</span>
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ margin: '0 0 18px 0', fontSize: '0.85rem', color: 'var(--texto-mudo)', lineHeight: '1.45' }}>
              Para actualizar su contraseña debe ingresar su contraseña vigente y definir una nueva clave que cumpla con los estándares de seguridad de FECOVOL.
            </p>

            {errorPass && (
              <div className="alerta alerta--error" role="alert" style={{ marginBottom: '18px' }}>
                {errorPass}
              </div>
            )}

            {exitoPass && (
              <div className="alerta" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', marginBottom: '18px' }} role="status">
                {exitoPass}
              </div>
            )}

            <form onSubmit={handleCambiarContrasena} noValidate>
              {/* Contraseña Actual */}
              <div className="campo" style={{ marginBottom: '16px' }}>
                <label htmlFor="pass-actual" className="campo__etiqueta">
                  Contraseña vigente (actual) <span style={{ color: 'var(--rojo)' }}>*</span>
                </label>
                <div className="campo__input-wrap">
                  <input
                    id="pass-actual"
                    type={verPassActual ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Ingrese su contraseña actual"
                    className="campo__input"
                    value={passActual}
                    onChange={(e) => setPassActual(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="campo__ojo"
                    onClick={() => setVerPassActual((v) => !v)}
                    aria-label={verPassActual ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <IconoOjo visible={verPassActual} />
                  </button>
                </div>
              </div>

              {/* Nueva Contraseña */}
              <div className="campo" style={{ marginBottom: '12px' }}>
                <label htmlFor="pass-nueva" className="campo__etiqueta">
                  Nueva contraseña <span style={{ color: 'var(--rojo)' }}>*</span>
                </label>
                <div className="campo__input-wrap">
                  <input
                    id="pass-nueva"
                    type={verPassNueva ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres (a-z, A-Z, 0-9, símbolos)"
                    className="campo__input"
                    value={passNueva}
                    onChange={(e) => setPassNueva(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="campo__ojo"
                    onClick={() => setVerPassNueva((v) => !v)}
                    aria-label={verPassNueva ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <IconoOjo visible={verPassNueva} />
                  </button>
                </div>
                {/* Checklist interactivo de política de contraseña */}
                <IndicadorPoliticaPassword password={passNueva} />
              </div>

              {/* Confirmar Nueva Contraseña */}
              <div className="campo" style={{ marginBottom: '24px' }}>
                <label htmlFor="pass-confirmar" className="campo__etiqueta">
                  Confirmar nueva contraseña <span style={{ color: 'var(--rojo)' }}>*</span>
                </label>
                <input
                  id="pass-confirmar"
                  type={verPassNueva ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita la nueva contraseña"
                  className="campo__input"
                  value={passConfirmar}
                  onChange={(e) => setPassConfirmar(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                style={{ width: '100%', padding: '10px 16px', fontSize: '0.92rem' }}
                disabled={guardandoPass}
              >
                {guardandoPass ? 'Validando y actualizando…' : 'Actualizar mi contraseña'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
