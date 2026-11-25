import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import './Ingresar.css';
import { supabase } from '../../supabaseClient.js';
import { URL_BACKEND } from '../../services/backend.js';
import { evaluarPoliticaPassword } from '../../utils/passwordPolicy.js';
import IndicadorPoliticaPassword from '../../components/IndicadorPoliticaPassword.jsx';
import { api } from '../../services/apiInterna.js';

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
function FormularioLogin({ onRecuperar, onContrasenaPendiente, correoInicial = '', avisoInicial = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [correo, setCorreo]         = useState(correoInicial);
  const [contrasena, setContrasena] = useState('');
  const [verPass, setVerPass]       = useState(false);
  const [recordar, setRecordar]     = useState(false);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState('');
  const [errores, setErrores]       = useState({});
  const [aviso, setAviso]           = useState(avisoInicial);

  useEffect(() => {
    if (correoInicial) setCorreo(correoInicial);
  }, [correoInicial]);

  useEffect(() => {
    if (avisoInicial) setAviso(avisoInicial);
  }, [avisoInicial]);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');
    const emailLimpio = correo.trim();

    if (!emailLimpio) {
      setErrores({ correo: 'Ingrese su correo electrónico.' });
      return;
    }

    if (!contrasena) {
      setErrores({ contrasena: 'Ingrese su contraseña.' });
      return;
    }

    setErrores({});
    setCargando(true);

    try {
      // 0. Comprobar bloqueo temporal tras 5 intentos fallidos consecutivos (RF-SEG-001)
      try {
        const resLock = await fetch(`${URL_BACKEND}/api/users/check-lockout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailLimpio })
        });
        const lockData = await resLock.json();
        if (lockData?.isLocked) {
          setError(lockData.message || 'Acceso restringido temporalmente por seguridad tras 5 intentos fallidos.');
          return;
        }
      } catch (e) {
        console.warn('Aviso al verificar bloqueo:', e);
      }

      // 1. Intentar autenticar con Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailLimpio,
        password: contrasena,
      });

      if (authError) {
        // Registrar intento fallido en Backend (RF-SEG-001)
        let msgBloqueo = null;
        try {
          const resFail = await fetch(`${URL_BACKEND}/api/users/record-failed-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailLimpio })
          });
          const failData = await resFail.json();
          if (failData?.isLocked) {
            msgBloqueo = 'Acceso bloqueado temporalmente por 30 minutos tras 5 intentos fallidos consecutivos.';
          } else if (failData?.remainingAttempts === 1) {
            msgBloqueo = 'Credenciales incorrectas. Advertencia: Su acceso se bloqueará por 30 minutos al próximo intento fallido.';
          }
        } catch (chkFail) {
          console.warn('Aviso al registrar intento fallido:', chkFail);
        }

        if (msgBloqueo) {
          setError(msgBloqueo);
          return;
        }

        // Si la cuenta tiene contraseña pendiente de activación, informar al usuario
        try {
          const res = await fetch(`${URL_BACKEND}/api/users/check-pending`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailLimpio })
          });
          const json = await res.json();
          if (json?.isPending) {
            setError('Su cuenta tiene una activación o cambio de contraseña pendiente. Utilice el enlace seguro enviado a su correo electrónico para definir su contraseña.');
            return;
          }
        } catch (chkErr) {
          console.error('Error al verificar estado pendiente tras fallo de login:', chkErr);
        }

        // Mensaje genérico conforme al requerimiento RF-SEG-001
        setError('Credenciales incorrectas o cuenta inhabilitada. Verifique sus datos o contacte a FECOVOL.');
        return;
      }

      // Reiniciar contador de intentos fallidos al tener éxito
      try {
        await fetch(`${URL_BACKEND}/api/users/record-successful-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailLimpio })
        });
      } catch (e) {
        // Silencioso
      }

      // 2. Consultar perfil, rol y asociación desde la base de datos
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('status, roles!user_profiles_role_id_fkey(name)')
        .select(`
          id,
          status,
          organization_id,
          roles:roles!user_profiles_role_id_fkey ( name ),
          associations:organization_id ( id, name, status )
        `)
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        console.error('Error al cargar perfil:', profileError);
        setError('No se encontró el perfil de usuario. Contacte a FECOVOL.');
        setError('Credenciales incorrectas o cuenta inhabilitada. Verifique sus datos o contacte a FECOVOL.');
        await supabase.auth.signOut();
        return;
      }

      // 3. Verificar que la cuenta no esté suspendida (mensaje genérico)
      if (profile.status === 'SUSPENDIDA') {
        setError('Credenciales incorrectas o cuenta inhabilitada. Verifique sus datos o contacte a FECOVOL.');
        await supabase.auth.signOut();
        return;
      }

      // 4. Verificar si la asociación vinculada está activa o inactiva
      if (profile.organization_id && profile.associations) {
        const estadoAsoc = (profile.associations.status || '').toUpperCase();
        if (estadoAsoc === 'SUSPENDIDA' || estadoAsoc === 'DESAFILIADA' || estadoAsoc === 'INACTIVA') {
          setError('Credenciales incorrectas o cuenta inhabilitada. Verifique sus datos o contacte a FECOVOL.');
          await supabase.auth.signOut();
          return;
        }
      }

      // 5. Verificar si tiene contraseña pendiente (debe definir contraseña antes de acceder)
      if (profile.status === 'PENDIENTE_CONTRASENA' || profile.status === 'PENDIENTE') {
        if (onContrasenaPendiente) {
          onContrasenaPendiente(emailLimpio, 'Su cuenta requiere definir una nueva contraseña antes de ingresar al sistema.');
        }
        return;
      }

      // 6. Actualizar last_login (esto dispara el trigger de auditoría)
      await supabase
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      // 7. Redirigir según el rol o hacia la ruta que intentaba acceder (RF-SEG-006)
      let rol = Array.isArray(profile.roles) ? profile.roles[0]?.name : profile.roles?.name;
      try {
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_id')
          .eq('user_id', data.user.id);

        if (userRoles && userRoles.length > 0) {
          const uRoleIds = userRoles.map(ur => ur.role_id);
          const { data: rList } = await supabase
            .from('roles')
            .select('id, name')
            .in('id', uRoleIds);

          if (rList && rList.length > 0) {
            const adminRole = rList.find(r => r.name === 'Administrador');
            rol = adminRole ? 'Administrador' : (rList[0].name || rol);
          }
        }
      } catch (e) {}

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

      {aviso && !error && (
        <div className="alerta" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', marginBottom: '18px' }} role="status">
          {aviso}
        </div>
      )}
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
function FormularioRecuperar({ onVolver, onContrasenaPendiente }) {
  const [correo, setCorreo]       = useState('');
  const [enviado, setEnviado]     = useState(false);
  const [mensajeRespuesta, setMensajeRespuesta] = useState('');
  const [cargando, setCargando]   = useState(false);
  const [errCorreo, setErrCorreo] = useState('');

  async function handleSubmit(ev) {
    ev.preventDefault();
    setErrCorreo('');
    const emailLimpio = correo.trim();
    if (!emailLimpio) {
      setErrCorreo('Ingrese su correo electrónico.');
      return;
    }
    setCargando(true);
    try {
      // 1. Llamar al backend para validar estado (no permite reactivar suspendidos) y actualizar a PENDIENTE_CONTRASENA
      const res = await fetch(`${URL_BACKEND}/api/users/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailLimpio })
      });

      const resData = await res.json();
      setMensajeRespuesta(resData?.message || 'Si el correo está registrado y activo, se ha generado la solicitud.');
      setEnviado(true);
    } catch (err) {
      console.error('Error al solicitar recuperación en backend, usando fallback Supabase:', err);
      try {
        await supabase.auth.resetPasswordForEmail(emailLimpio, {
          redirectTo: `${window.location.origin}/restablecer-contrasena`,
        });
      } catch (sbErr) {
        console.warn('Aviso Supabase fallback:', sbErr);
      }
      setMensajeRespuesta('Si el correo está registrado y activo, se ha enviado el enlace de restablecimiento.');
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
        Si su cuenta existe y se encuentra activa, podrá restablecer su contraseña.
      </p>

      {enviado ? (
        <div>
          <div className="alerta alerta--aviso" role="status" style={{ marginBottom: '24px' }}>
            {mensajeRespuesta}
          </div>
          <button 
            type="button" 
            className="btn-primario"
            onClick={onVolver}
          >
            Volver al inicio de sesión
          </button>
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
          Le llegará un correo con un enlace seguro válido por 15 minutos.
        </li>
        <li>
          <span className="ingresar__paso-icono ingresar__paso-icono--2">2</span>
          Haga clic en el enlace recibido en su correo para validar su identidad.
        </li>
        <li>
          <span className="ingresar__paso-icono ingresar__paso-icono--3">3</span>
          Defina su nueva contraseña y acceda inmediatamente al sistema.
        </li>
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Vista de ESTABLECER / CAMBIAR CONTRASEÑA (Para Invitaciones y Recuperación)
   ═══════════════════════════════════════════════════════════════════ */
function FormularioEstablecerContrasena({ correoPrellenado = '', mensajeAviso = '', onVolver, onSolicitarNuevoEnlace }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [correo, setCorreo]               = useState(correoPrellenado || location.state?.email || '');
  const aviso                             = mensajeAviso || location.state?.mensaje;
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [verPass, setVerPass]             = useState(false);
  const [cargando, setCargando]           = useState(false);
  const [error, setError]                 = useState('');
  const [exito, setExito]                 = useState(false);
  const [tieneToken, setTieneToken]       = useState(false);
  const [verificandoToken, setVerificandoToken] = useState(true);
  const [errorToken, setErrorToken]       = useState('');

  // Verificar obligatoriamente si el usuario llegó con un token firmado válido en la URL o sesión
  useEffect(() => {
    async function cargarSesion() {
      setVerificandoToken(true);
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const errorParam = hashParams.get('error') || hashParams.get('error_code');
      const errorDesc = hashParams.get('error_description');

      // Si Supabase devuelve un error en el hash (ej. otp_expired o access_denied)
      if (errorParam || errorDesc) {
        if (errorParam === 'otp_expired' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
          setErrorToken('El enlace de recuperación es inválido o ha expirado. Por motivos de seguridad, los enlaces son de un solo uso y tienen una vigencia limitada.');
        } else {
          setErrorToken(errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'El enlace de acceso es inválido o no está autorizado.');
        }
        setTieneToken(false);
        setVerificandoToken(false);
        return;
      }

      const hayTokenHash = hash && (hash.includes('access_token') || hash.includes('type=recovery') || hash.includes('type=invite'));
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.email) {
        setCorreo(session.user.email);
        setTieneToken(true);
      } else if (hayTokenHash) {
        setTieneToken(true);
      } else {
        setTieneToken(false);
      }
      setVerificandoToken(false);
    }
    cargarSesion();
  }, []);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');

    const evaluacion = evaluarPoliticaPassword(nuevaPassword);
    if (!evaluacion.esValida) {
      setError(evaluacion.errores[0]);
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      // 1. REGLA DE SEGURIDAD ESTRICTA:
      // Debe existir sesión activa proveniente del token del correo electrónico
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setError('Acceso denegado: Debe utilizar el enlace seguro enviado a su correo electrónico para definir su contraseña.');
        return;
      }

      const userId = session.user.id;

      // 2. REGLA DE SEGURIDAD CRÍTICA:
      // Si la cuenta está SUSPENDIDA, NO permitir cambio de contraseña bajo ninguna circunstancia.
      const { data: profileCheck } = await supabase
        .from('user_profiles')
        .select('id, status')
        .eq('id', userId)
        .single();

      if (profileCheck?.status === 'SUSPENDIDA') {
        setError('Acceso denegado: Esta cuenta se encuentra suspendida. No está autorizada para definir contraseñas ni acceder al sistema.');
        await supabase.auth.signOut();
        return;
      }

      // 3. Actualizar contraseña en Supabase Auth
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: nuevaPassword
      });
      if (updateError) throw updateError;

      // 4. El backend activa la cuenta (si la contraseña estaba pendiente) y lo registra en la
      //    bitácora a nombre del usuario del token. El navegador no modifica el estado de la cuenta.
      await api.post('/users/me/contrasena-actualizada', { motivo: 'ESTABLECIDA' });

      // 5. Limpiar cualquier bloqueo temporal por intentos fallidos previos (Bypass seguro por correo)
      try {
        await fetch(`${URL_BACKEND}/api/users/record-successful-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: session.user.email })
        });
      } catch (e) {
        // Silencioso
      }

      // 6. Validar si la asociación vinculada está inactiva o suspendida
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          status,
          organization_id,
          roles:roles!user_profiles_role_id_fkey ( name ),
          associations:organization_id ( id, name, status )
        `)
        .eq('id', userId)
        .single();

      if (profile?.organization_id && profile?.associations) {
        const estadoAsoc = (profile.associations.status || '').toUpperCase();
        if (estadoAsoc === 'SUSPENDIDA' || estadoAsoc === 'DESAFILIADA' || estadoAsoc === 'INACTIVA') {
          setError(`Contraseña guardada con éxito. Sin embargo, su acceso está denegado porque su asociación (${profile.associations.name}) se encuentra inactiva o suspendida en FECOVOL.`);
          await supabase.auth.signOut();
          return;
        }
      }

      setExito(true);

      setTimeout(() => {
        const rol = Array.isArray(profile?.roles) ? profile?.roles[0]?.name : profile?.roles?.name;
        const ruta = RUTA_POR_ROL[rol] ?? '/admin';
        navigate(ruta, { replace: true });
      }, 1500);

    } catch (err) {
      console.error('Error al actualizar contraseña:', err);
      setError(err.message || 'No se pudo establecer la contraseña');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      {onVolver && (
        <button type="button" className="ingresar__volver" onClick={onVolver}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Volver al inicio de sesión
        </button>
      )}

      <h1 className="ingresar__titulo">Definir contraseña</h1>
      <p className="ingresar__subtitulo">
        Cree una contraseña para completar el acceso a su cuenta de FECOVOL.
      </p>

      {/* Si no tiene token y ya terminó de verificar, bloquear formulario para prevenir Account Takeover */}
      {!verificandoToken && !tieneToken ? (
        <div style={{ marginTop: '16px' }}>
          <div className="alerta alerta--error" role="alert" style={{ marginBottom: '20px' }}>
            {errorToken || 'Acceso no autorizado: Para definir o cambiar una contraseña debe ingresar al sistema utilizando el enlace seguro enviado a su correo electrónico.'}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {errorToken && onSolicitarNuevoEnlace && (
              <button type="button" className="btn-primario" onClick={onSolicitarNuevoEnlace}>
                Solicitar nuevo enlace de recuperación
              </button>
            )}
            <button type="button" className={errorToken ? 'btn-secundario' : 'btn-primario'} onClick={onVolver}>
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      ) : (
        <>
          {aviso && !exito && (
            <div className="alerta" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', marginBottom: '18px' }} role="status">
              {aviso}
            </div>
          )}

          {error && <div className="alerta alerta--error" role="alert">{error}</div>}
          {exito && (
            <div className="alerta" style={{ background: 'var(--ok-fondo)', color: 'var(--ok)', border: '1px solid #bbf7d0', marginBottom: '18px' }} role="status">
              Contraseña establecida con éxito. Redirigiendo al sistema...
            </div>
          )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Correo electrónico */}
        <div className="campo">
          <label htmlFor="correo-est" className="campo__etiqueta">Correo electrónico</label>
          <input
            id="correo-est"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="usuario@correo.com"
            className="campo__input"
            required
            readOnly={Boolean(correoPrellenado)}
            style={correoPrellenado ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
          />
        </div>

        {/* Nueva Contraseña */}
        <div className="campo">
          <label htmlFor="nueva-pass" className="campo__etiqueta">Nueva contraseña</label>
          <div className="campo__input-wrap">
            <input
              id="nueva-pass"
              type={verPass ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres (a-z, A-Z, 0-9, símbolos)"
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
          <IndicadorPoliticaPassword password={nuevaPassword} />
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
      </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Página principal – alterna entre Login, Recuperar y Establecer Contraseña
   ═══════════════════════════════════════════════════════════════════ */
export default function Ingresar() {
  const location = useLocation();
  const [vista, setVista] = useState(
    location.state?.vista || 
    (location.pathname === '/restablecer-contrasena' ? 'establecer' : 'login')
  );
  const [mensajeAviso, setMensajeAviso] = useState(location.state?.mensaje || '');
  const [correoPendiente, setCorreoPendiente] = useState(location.state?.email || '');

  // Detectar si el enlace trae un token de invitacion o recuperacion o estado previo
  useEffect(() => {
    if (location.state?.vista) {
      setVista(location.state.vista);
      if (location.state.mensaje) {
        setMensajeAviso(location.state.mensaje);
      }
      if (location.state.email) {
        setCorreoPendiente(location.state.email);
      }
    }

    if (location.pathname === '/restablecer-contrasena') {
      setVista('establecer');
      if (!mensajeAviso) {
        setMensajeAviso('Ingrese su nueva contraseña para restablecer su acceso.');
      }
    }

    // 1. Escuchar eventos de cambio de estado de autenticación (ej. PASSWORD_RECOVERY o USER_UPDATED)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setVista('establecer');
        setMensajeAviso('Por favor, defina una nueva contraseña para restablecer su acceso.');
        if (session?.user?.email) {
          setCorreoPendiente(session.user.email);
        }
      }
    });

    // 2. Comprobar si el hash de la URL contiene type=invite o type=recovery
    const hash = window.location.hash;
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      setVista('establecer');
      setMensajeAviso('Complete la configuración de su contraseña para activar su cuenta en FECOVOL.');
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, [location.state, location.pathname]);

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
            <FormularioLogin 
              correoInicial={correoPendiente}
              avisoInicial={mensajeAviso}
              onRecuperar={() => setVista('recuperar')} 
              onContrasenaPendiente={(email, msg) => {
                setCorreoPendiente(email);
                setMensajeAviso(msg);
                setVista('establecer');
              }}
            />
          )}
          {vista === 'recuperar' && (
            <FormularioRecuperar 
              onVolver={() => setVista('login')} 
              onContrasenaPendiente={(email, msg) => {
                setCorreoPendiente(email);
                setMensajeAviso(msg);
                setVista('establecer');
              }}
            />
          )}
          {vista === 'establecer' && (
            <FormularioEstablecerContrasena 
              correoPrellenado={correoPendiente} 
              mensajeAviso={mensajeAviso} 
              onVolver={() => setVista('login')} 
              onSolicitarNuevoEnlace={() => setVista('recuperar')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
