// Cliente falso de Supabase para probar las rutas sin conexion a la base de datos.
// Registra cada llamada y devuelve la respuesta que la prueba haya configurado.
function crearFake() {
  const llamadas = [];
  const respuestasTabla = {};
  const respuestasRpc = {};

  function builder(tabla) {
    const registro = { tipo: 'from', tabla, pasos: [] };
    llamadas.push(registro);
    const b = {};
    for (const m of ['select', 'eq', 'ilike', 'or', 'order', 'limit', 'lte', 'insert', 'upsert', 'single', 'range', 'maybeSingle', 'update', 'is', 'neq', 'gt', 'like']) {
      b[m] = (...args) => {
        registro.pasos.push([m, ...args]);
        return b;
      };
    }
    b.then = (resolve, reject) => {
      const cola = respuestasTabla[tabla];
      const r = (cola && cola.length ? cola.shift() : null) || { data: [], error: null, count: 0 };
      return Promise.resolve(r).then(resolve, reject);
    };
    return b;
  }

  const fake = {
    llamadas,
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
    },
    // Sesion falsa: la prueba decide que usuario devuelve el token.
    usuarioAuth: null,
    auth: {
      getUser: async () =>
        fake.usuarioAuth ? { data: { user: fake.usuarioAuth }, error: null } : { data: { user: null }, error: { message: 'invalid' } }
    },
    from: builder,
    rpc(nombre, params) {
      llamadas.push({ tipo: 'rpc', nombre, params });
      return Promise.resolve(respuestasRpc[nombre] || { data: null, error: null });
    }
  };
  return fake;
}

module.exports = crearFake;
