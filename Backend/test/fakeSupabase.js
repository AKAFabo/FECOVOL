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
    for (const m of ['select', 'eq', 'ilike', 'or', 'order', 'limit', 'lte', 'insert', 'upsert', 'single', 'range']) {
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

  return {
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
    from: builder,
    rpc(nombre, params) {
      llamadas.push({ tipo: 'rpc', nombre, params });
      return Promise.resolve(respuestasRpc[nombre] || { data: null, error: null });
    }
  };
}

module.exports = crearFake;
