// Autenticación del backend: identifica a quien llama con el token de sesión de Supabase.
//
// El frontend manda `Authorization: Bearer <access_token>` (el mismo token con el que el usuario
// inició sesión). Aquí se valida contra Supabase Auth y, si es válido, queda en `req.auth` el id y
// el correo VERIFICADOS del usuario. El resto del backend (ámbito organizacional, permisos y
// bitácora) usa solo ese dato.
//
// Antes, la identidad salía del encabezado `x-user-email` o de `admin_email` en el cuerpo, que el
// cliente puede escribir a mano: bastaba poner el correo de un administrador para actuar como él.
// Esos valores ya no se usan para identificar a nadie.
//
// Sin encabezado Authorization la solicitud sigue como anónima (req.auth = null): las rutas
// públicas y las del inicio de sesión funcionan igual, y las protegidas responden 401.
const crypto = require('node:crypto');
const supabase = require('../config/supabase');
const { HttpError } = require('../utils/httpError');

// Validar el token con Supabase en cada solicitud costaría un viaje de red por llamada. Se guarda
// el resultado poco tiempo (como máximo hasta que el token vence) y con un tope de entradas.
const VIGENCIA_MS = 60_000;
const MAX_ENTRADAS = 1000;
const cache = new Map(); // huella del token -> { auth, hasta }

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/;

function huella(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Momento en que vence el JWT según su campo `exp`. Solo se usa para no guardar en caché más allá
// del vencimiento; la validez real la decide Supabase en getUser().
function venceEn(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function guardar(clave, auth, token) {
  if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value);
  const hasta = Math.min(Date.now() + VIGENCIA_MS, venceEn(token) || Date.now() + VIGENCIA_MS);
  cache.set(clave, { auth, hasta });
}

function leer(clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.hasta <= Date.now()) {
    cache.delete(clave);
    return null;
  }
  return entrada.auth;
}

async function authenticate(req, res, next) {
  req.auth = null;
  const encabezado = req.get('authorization');
  if (!encabezado) return next();

  const m = BEARER.exec(encabezado.trim());
  if (!m) return next(new HttpError(401, 'El encabezado de autorización no es válido.'));

  const token = m[1];
  const clave = huella(token);
  const enCache = leer(clave);
  if (enCache) {
    req.auth = enCache;
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user?.id || !user.email) {
      return next(new HttpError(401, 'Su sesión venció o no es válida. Ingrese de nuevo.'));
    }
    const auth = Object.freeze({ userId: user.id, email: user.email.trim().toLowerCase() });
    guardar(clave, auth, token);
    req.auth = auth;
    return next();
  } catch (err) {
    console.error('[autenticación] no se pudo validar el token con Supabase:', err?.message || err);
    return next(new HttpError(503, 'No fue posible verificar la sesión en este momento.'));
  }
}

// Para rutas que exigen sesión pero no usan el ámbito organizacional (por ejemplo, las del propio
// usuario: sus sesiones, su rol activo).
function requireSession(req, res, next) {
  if (!req.auth) return next(new HttpError(401, 'Esta operación requiere iniciar sesión.'));
  next();
}

function limpiarCache() {
  cache.clear();
}

module.exports = { authenticate, requireSession, limpiarCache };
