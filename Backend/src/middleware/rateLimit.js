// Límite de solicitudes por IP con ventana fija, en memoria.
//
// Sirve para las rutas públicas, que cualquiera puede llamar sin iniciar sesión: evita que un solo
// cliente sature la API (y con ella la base de datos) a punta de solicitudes.
//
// Limitaciones conocidas:
// - El conteo vive en la memoria del proceso. Si la API se levanta con varias instancias, cada una
//   cuenta por su lado; en ese caso hay que pasar a un almacén compartido (por ejemplo Redis).
// - Detrás de un proxy o balanceador, Express necesita `app.set('trust proxy', ...)` para que
//   req.ip sea la IP real del cliente y no la del proxy.
module.exports = function rateLimit({ ventanaMs = 60_000, maximo = 120 } = {}) {
  const contadores = new Map();
  let proximaLimpieza = Date.now() + ventanaMs;

  function limpiar(ahora) {
    for (const [clave, c] of contadores) {
      if (c.reinicio <= ahora) contadores.delete(clave);
    }
    proximaLimpieza = ahora + ventanaMs;
  }

  return function limitarSolicitudes(req, res, next) {
    const ahora = Date.now();
    if (ahora >= proximaLimpieza) limpiar(ahora);

    const clave = req.ip || 'desconocida';
    let c = contadores.get(clave);
    if (!c || c.reinicio <= ahora) {
      c = { cuenta: 0, reinicio: ahora + ventanaMs };
      contadores.set(clave, c);
    }
    c.cuenta += 1;

    const restantes = Math.max(0, maximo - c.cuenta);
    res.set('RateLimit-Limit', String(maximo));
    res.set('RateLimit-Remaining', String(restantes));

    if (c.cuenta > maximo) {
      res.set('Retry-After', String(Math.ceil((c.reinicio - ahora) / 1000)));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intente de nuevo en un momento.' });
    }
    next();
  };
};
