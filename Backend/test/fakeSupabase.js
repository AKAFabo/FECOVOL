// Cliente falso de Supabase para probar las rutas sin conexion a la base de datos.
// Registra cada llamada y devuelve la respuesta que la prueba haya configurado.
function crearFake() {
  const llamadas = [];
  const respuestasTabla = {};
  const respuestasRpc = {};
  // Sesiones válidas (token -> usuario de Supabase Auth) y perfiles por correo (user_profiles).
  const sesiones = {};
  const perfiles = {};

  function builder(tabla) {
    const registro = { tipo: 'from', tabla, pasos: [] };
    llamadas.push(registro);
    const b = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'ilike', 'or', 'order', 'limit', 'lte', 'gte', 'insert', 'upsert', 'update', 'delete', 'single', 'maybeSingle', 'range', 'gt', 'lt', 'like', 'filter']) {
      b[m] = (...args) => {
        registro.pasos.push([m, ...args]);
        return b;
      };
    }
    b.then = (resolve, reject) => {
      const cola = respuestasTabla[tabla];
      let r = cola && cola.length ? cola.shift() : null;
      if (!r && tabla === 'user_profiles') r = perfilSegun(registro.pasos);
      if (!r && tabla === 'user_roles') r = { data: [], error: null };
      r = r || { data: [], error: null, count: 0 };
      return Promise.resolve(r).then(resolve, reject);
    };
    return b;
  }

<<<<<<< Updated upstream
  // Los middlewares buscan el perfil con .eq('id', id) o .eq('email', correo); la vinculación de
  // árbitros, con .ilike('email', correo) (sin distinguir mayúsculas).
  function perfilSegun(pasos) {
    const porCorreo = pasos.find((p) => p[0] === 'eq' && p[1] === 'email');
    const porCorreoSinMayus = pasos.find((p) => p[0] === 'ilike' && p[1] === 'email');
    const porId = pasos.find((p) => p[0] === 'eq' && p[1] === 'id');
    let perfil = null;
    if (porCorreo) perfil = perfiles[porCorreo[2]] || null;
    else if (porCorreoSinMayus) {
      const buscado = String(porCorreoSinMayus[2]).replace(/\\(.)/g, '$1').toLowerCase();
      perfil = Object.values(perfiles).find((x) => String(x.email).toLowerCase() === buscado) || null;
    }
    else if (porId) perfil = Object.values(perfiles).find((x) => x.id === porId[2]) || null;
    else return null;
=======
  // Los middlewares buscan el perfil con .eq('email', correo), .ilike('email', correo) o .eq('id', id).
  function perfilSegun(pasos) {
    const porCorreo = pasos.find((p) => (p[0] === 'eq' || p[0] === 'ilike') && p[1] === 'email');
    const porId = pasos.find((p) => p[0] === 'eq' && p[1] === 'id');
    let perfil = null;
    if (porCorreo) {
      const buscado = String(porCorreo[2] || '').toLowerCase();
      perfil = perfiles[buscado] || Object.values(perfiles).find((x) => String(x.email || '').toLowerCase() === buscado) || null;
    } else if (porId) {
      perfil = Object.values(perfiles).find((x) => x.id === porId[2]) || null;
    } else {
      return null;
    }
>>>>>>> Stashed changes
    return { data: perfil, error: null };
  }

  return {
    llamadas,
    /**
     * Registra un usuario con sesión: `token` es lo que mandará la prueba en Authorization y
     * `perfil` lo que devolverá user_profiles (id, email, status, organization_id, roles).
     */
    conSesion(token, perfil) {
      sesiones[token] = { id: perfil.id, email: perfil.email };
      perfiles[perfil.email] = perfil;
    },
    // Storage: registra subidas, borrados y enlaces firmados. `fallarSubida` simula una caída.
    storage: {
      fallarSubida: false,
      from(bucket) {
        const st = this;
        return {
          async upload(ruta, contenido, opciones) {
            llamadas.push({ tipo: 'storage', accion: 'upload', bucket, ruta, opciones, bytes: contenido.length });
            return st.fallarSubida ? { data: null, error: { message: 'caida' } } : { data: { path: ruta }, error: null };
          },
          async remove(rutas) {
            llamadas.push({ tipo: 'storage', accion: 'remove', bucket, rutas });
            return { data: [], error: null };
          },
          async createSignedUrl(ruta, segundos, opciones) {
            llamadas.push({ tipo: 'storage', accion: 'firmar', bucket, ruta, segundos, opciones });
            return { data: { signedUrl: `https://firmado.test/${bucket}/${ruta}?token=x` }, error: null };
          }
        };
      }
    },
    auth: {
      // Invitaciones: registra el correo y devuelve un usuario nuevo (o el error configurado).
      admin: {
        errorInvitacion: null,
        async inviteUserByEmail(correo, opciones) {
          llamadas.push({ tipo: 'invitacion', correo, opciones });
          return this.errorInvitacion
            ? { data: null, error: this.errorInvitacion }
            : { data: { user: { id: '99999999-9999-4999-8999-999999999999', email: correo } }, error: null };
        }
      },
      async getUser(token) {
        const user = sesiones[token];
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } };
      }
    },
    alResponderTabla(tabla, ...respuestas) {
      respuestasTabla[tabla] = respuestas;
    },
    alResponderRpc(nombre, respuesta) {
      respuestasRpc[nombre] = respuesta;
    },
    reset() {
      llamadas.length = 0;
      for (const k of Object.keys(respuestasTabla)) delete respuestasTabla[k];
      for (const k of Object.keys(respuestasRpc)) delete respuestasRpc[k];
      for (const k of Object.keys(sesiones)) delete sesiones[k];
      for (const k of Object.keys(perfiles)) delete perfiles[k];
      this.storage.fallarSubida = false;
      this.auth.admin.errorInvitacion = null;
    },
    from: builder,
    rpc(nombre, params) {
      llamadas.push({ tipo: 'rpc', nombre, params });
      return Promise.resolve(respuestasRpc[nombre] || { data: null, error: null });
    }
  };
}

module.exports = crearFake;
