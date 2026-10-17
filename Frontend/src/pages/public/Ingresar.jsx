import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import './Ingresar.css';
import { supabase } from '../../supabaseClient.js';

/* ── Ícono ojo (mostrar/ocultar contraseña) ─────────────────────── */
function IconoOjo({ visible }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/* ── Panel izquierdo compartido ─────────────────────────────────── */
function PanelIzquierdo() {
  return (
    <aside className="ingresar__panel" aria-hidden="true">
      <Logo claro />
      <div className="ingresar__eslogan">
        <h2>Una sola fuente de información para el voleibol nacional</h2>
        <p>
          Asociaciones, equipos, personas federadas, competencias, árbitros y resultados oficiales de la Federación Costarricense de Voleibol.
        </p>
      </div>
      <p className="ingresar__pie-panel">
        ¿Tiene consultas?{' '}
        <a href="mailto:fecovol@gmail.com">fecovol@gmail.com</a>
        {' '}·{' '}(506) 2233-0414
      </p>
    </aside>
  );
}

/** Mapeo de nombre de rol → ruta del dashboard correspondiente. */
const RUTA_POR_ROL = {
  'Administrador': '/admin',
  'Personal':      '/personal',
  'Representante': '/asociacion',
  'Arbitro':       '/arbitro',
};

/* ═══════════════════════════════════════════════════════════════════
   Vista de LOGIN
   ═══════════════════════════════════════════════════════════════════ */
function FormularioLogin({ onRecuperar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [correo, setCorreo]         = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verPass, setVerPass]       = useState(false);
  const [recordar, setRecordar]     = useState(false);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState('');
  const [errores, setErrores]       = useState({});

  function validar() {
    const e = {};
    if (!correo.trim()) e.correo     = 'Ingrese su correo electrónico.';
    if (!contrasena)    e.contrasena = 'Ingrese su contraseña.';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) return;

    setCargando(true);
    try {
      // 1. Autenticar con Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: correo,
        password: contrasena,
      });

      if (authError) {
        setError('Credenciales incorrectas. Verifique e intente de nuevo.');
        return;
      }

      // 2. Consultar perfil y rol desde la base de datos
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('status, roles(name)')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        setError('No se encontró el perfil de usuario. Contacte a FECOVOL.');
        await supabase.auth.signOut();
        return;
      }

      // 3. Verificar que la cuenta esté activa
      if (profile.status === 'SUSPENDIDA') {
        setError('Su cuenta está suspendida. Contacte a FECOVOL para más información.');
        await supabase.auth.signOut();
        return;
      }

      // 4. Actualizar last_login (esto dispara el trigger de auditoría)
      await supabase
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      // 5. Redirigir según el rol o hacia la ruta que intentaba acceder
      const rol = Array.isArray(profile.roles) ? profile.roles[0]?.name : profile.roles?.name;
      const destinoPrevio = location.state?.from?.pathname;
      let ruta = RUTA_POR_ROL[rol] ?? '/';

      if (destinoPrevio && destinoPrevio !== '/ingresar') {
        if (rol === 'Administrador' && destinoPrevio.startsWith('/admin')) {
          ruta = destinoPrevio;
        } else if (rol === 'Personal' && destinoPrevio.startsWith('/personal')) {
          ruta = destinoPrevio;
        } else if (rol === 'Representante' && destinoPrevio.startsWith('/asociacion')) {
          ruta = destinoPrevio;
        } else if (rol === 'Arbitro' && destinoPrevio.startsWith('/arbitro')) {
          ruta = destinoPrevio;
        }
      }

      navigate(ruta, { replace: true });

    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="ingresar__titulo">Ingresar al sistema</h1>
      <p className="ingresar__subtitulo">
        Use las credenciales de su cuenta de la federación.
      </p>

      {error && <div className="alerta alerta--error" role="alert">{error}</div>}

      {/* Correo */}
      <div className="campo">
        <label htmlFor="correo" className="campo__etiqueta">Correo electrónico</label>
        <input
          id="correo"
          type="email"
          autoComplete="email"
          placeholder="usuario@correo.com"
          className={`campo__input${errores.correo ? ' campo__input--error' : ''}`}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          aria-describedby={errores.correo ? 'correo-error' : undefined}
        />
        {errores.correo && (
          <span id="correo-error" className="campo__error" role="alert">
            {errores.correo}
          </span>
        )}
      </div>

      {/* Contraseña */}
      <div className="campo">
        <label htmlFor="contrasena" className="campo__etiqueta">Contraseña</label>
        <div className="campo__input-wrap">
          <input
            id="contrasena"
            type={verPass ? 'text' : 'password'}
            autoComplete="current-password"
            className={`campo__input${errores.contrasena ? ' campo__input--error' : ''}`}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            aria-describedby={errores.contrasena ? 'pass-error' : undefined}
          />
          <button
            type="button"
            className="campo__ojo"
            onClick={() => setVerPass((v) => !v)}
            aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <IconoOjo visible={verPass} />
          </button>
        </div>
        {errores.contrasena && (
          <span id="pass-error" className="campo__error" role="alert">
            {errores.contrasena}
          </span>
        )}
      </div>

      {/* Recordar / Recuperar */}
      <div className="ingresar__opciones">
        <label className="ingresar__recordar">
          <input
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
          />
          Mantener la sesión abierta
        </label>
        <button type="button" className="ingresar__recuperar" onClick={onRecuperar}>
          ¿Olvidó su contraseña?
        </button>
      </div>

      <button type="submit" className="btn-primario" disabled={cargando}>
        {cargando ? 'Ingresando…' : 'Ingresar'}
      </button>

      <p className="ingresar__separador">
        <Link to="/">Consultar resultados sin cuenta</Link>
      </p>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Vista de RECUPERAR ACCESO
   ═══════════════════════════════════════════════════════════════════ */
function FormularioRecuperar({ onVolver }) {
  const [correo, setCorreo]       = useState('');
  const [enviado, setEnviado]     = useState(false);
  const [cargando, setCargando]   = useState(false);
  const [errCorreo, setErrCorreo] = useState('');

  async function handleSubmit(ev) {
    ev.preventDefault();
    setErrCorreo('');
    if (!correo.trim()) {
      setErrCorreo('Ingrese su correo electrónico.');
      return;
    }
    setCargando(true);
    try {
      await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: `${window.location.origin}/ingresar`,
      });
      setEnviado(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button type="button" className="ingresar__volver" onClick={onVolver}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Volver al inicio de sesión
      </button>

      <h1 className="ingresar__titulo">Recuperar el acceso</h1>
      <p className="ingresar__subtitulo">
        Si su cuenta existe, le enviaremos un enlace para crear una contraseña nueva.
      </p>

      {enviado ? (
        <div className="alerta alerta--aviso" role="status">
          Si el correo <strong>{correo}</strong> está registrado, recibirá el
          enlace en los próximos minutos. Revise también su carpeta de spam.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="campo">
            <label htmlFor="correo-rec" className="campo__etiqueta">
              Correo electrónico
            </label>
            <input
              id="correo-rec"
              type="email"
              autoComplete="email"
              placeholder="usuario@correo.com"
              className={`campo__input${errCorreo ? ' campo__input--error' : ''}`}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              aria-describedby={errCorreo ? 'correo-rec-error' : undefined}
            />
            {errCorreo && (
              <span id="correo-rec-error" className="campo__error" role="alert">
                {errCorreo}
              </span>
            )}
          </div>

          <button type="submit" className="btn-primario" disabled={cargando}
            style={{ marginTop: 4 }}>
            {cargando ? 'Enviando…' : 'Enviar enlace de recuperación'}
          </button>
        </form>
      )}

      <ul className="ingresar__pasos" aria-label="Qué esperar">
        <li>
          <span className="ingresar__paso-icono ingresar__paso-icono--1">1</span>
          Le llegará un correo válido por 15 minutos.
        </li>
        <li>
          <span className="ingresar__paso-icono ingresar__paso-icono--2">2</span>
          Desde ese correo defina una contraseña nueva.
        </li>
        <li>
          <span className="ingresar__paso-icono ingresar__paso-icono--3">3</span>
          Vuelva a ingresar con su correo y la contraseña nueva.
        </li>
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Vista de ESTABLECER / CAMBIAR CONTRASEÑA (Para Invitaciones y Recuperación)
   ═══════════════════════════════════════════════════════════════════ */
function FormularioEstablecerContrasena() {
  const navigate = useNavigate();
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');

    if (nuevaPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      // 1. Actualizar la contraseña del usuario en Supabase Auth
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: nuevaPassword
      });

      if (updateError) throw updateError;

      // 2. Consultar perfil para redirigir
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('status, roles(name)')
        .eq('id', data.user.id)
        .single();

      // 3. Actualizar last_login
      await supabase
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      setExito(true);

      setTimeout(() => {
        const rol = profile?.roles?.name;
        const ruta = RUTA_POR_ROL[rol] ?? '/admin';
        navigate(ruta, { replace: true });
      }, 1500);

    } catch (err) {
      console.error('Error al actualizar contraseña:', err);
      setError('No se pudo establecer la contraseña: ' + (err.message || 'Error de sesión'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <h1 className="ingresar__titulo">Definir contraseña</h1>
      <p className="ingresar__subtitulo">
        Cree una contraseña para completar el acceso a su cuenta de FECOVOL.
      </p>

      {error && <div className="alerta alerta--error" role="alert">{error}</div>}
      {exito && (
        <div className="alerta" style={{ background: 'var(--ok-fondo)', color: 'var(--ok)', border: '1px solid #bbf7d0', marginBottom: '18px' }} role="status">
          ✓ Contraseña establecida con éxito. Redirigiendo al sistema...
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Nueva Contraseña */}
        <div className="campo">
          <label htmlFor="nueva-pass" className="campo__etiqueta">Nueva contraseña</label>
          <div className="campo__input-wrap">
            <input
              id="nueva-pass"
              type={verPass ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              className="campo__input"
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="campo__ojo"
              onClick={() => setVerPass((v) => !v)}
              aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <IconoOjo visible={verPass} />
            </button>
          </div>
        </div>

        {/* Confirmar Contraseña */}
        <div className="campo" style={{ marginBottom: '24px' }}>
          <label htmlFor="confirm-pass" className="campo__etiqueta">Confirmar nueva contraseña</label>
          <input
            id="confirm-pass"
            type={verPass ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repita la contraseña"
            className="campo__input"
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primario" disabled={cargando || exito}>
          {cargando ? 'Guardando contraseña…' : 'Establecer contraseña y acceder'}
        </button>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Página principal – alterna entre Login, Recuperar y Establecer Contraseña
   ═══════════════════════════════════════════════════════════════════ */
export default function Ingresar() {
  const [vista, setVista] = useState('login'); // 'login' | 'recuperar' | 'establecer'

  // Detectar si el enlace trae un token de invitacion o recuperacion
  useEffect(() => {
    // 1. Escuchar eventos de cambio de estado de autenticación (ej. PASSWORD_RECOVERY o USER_UPDATED)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setVista('establecer');
      }
    });

    // 2. Comprobar si el hash de la URL contiene type=invite o type=recovery
    const hash = window.location.hash;
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      setVista('establecer');
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <div className="ingresar">
      <PanelIzquierdo />

      <div className="ingresar__form-wrap">
        {/* Logo solo visible en móvil */}
        <div className="ingresar__logo-movil">
          <Logo />
        </div>

        <div className="ingresar__caja">
          {vista === 'login' && (
            <FormularioLogin onRecuperar={() => setVista('recuperar')} />
          )}
          {vista === 'recuperar' && (
            <FormularioRecuperar onVolver={() => setVista('login')} />
          )}
          {vista === 'establecer' && (
            <FormularioEstablecerContrasena />
          )}
        </div>
      </div>
    </div>
  );
}
