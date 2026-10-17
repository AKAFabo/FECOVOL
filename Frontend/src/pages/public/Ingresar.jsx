import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

      // 5. Redirigir según el rol
      const rol = profile.roles?.name;
      const ruta = RUTA_POR_ROL[rol] ?? '/';
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
      // Por seguridad (RF-SEG-008), siempre mostramos el mensaje de éxito
      // para no revelar si el correo existe o no en el sistema.
      await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: `${window.location.origin}/restablecer-contrasena`,
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
   Página principal – alterna entre Login y Recuperar
   ═══════════════════════════════════════════════════════════════════ */
export default function Ingresar() {
  const [vista, setVista] = useState('login'); // 'login' | 'recuperar'

  return (
    <div className="ingresar">
      <PanelIzquierdo />

      <div className="ingresar__form-wrap">
        {/* Logo solo visible en móvil */}
        <div className="ingresar__logo-movil">
          <Logo />
        </div>

        <div className="ingresar__caja">
          {vista === 'login' ? (
            <FormularioLogin onRecuperar={() => setVista('recuperar')} />
          ) : (
            <FormularioRecuperar onVolver={() => setVista('login')} />
          )}
        </div>
      </div>
    </div>
  );
}
