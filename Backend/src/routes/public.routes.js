// API pública de solo lectura para el portal web (cualquier persona, sin iniciar sesión).
//
// Por qué un router aparte y no las rutas internas (/api/competitions, /api/associations...):
// - Aquí solo hay GET. Nada de lo que se expone puede modificar datos.
// - Cada respuesta pasa por un archivo de src/public/*Dto.js, que arma los objetos con una lista
//   blanca de campos. Las rutas internas devuelven más información (documentos de identidad,
//   contactos, cédulas jurídicas) que no debe llegar al público (RF-DIV-004).
// - Solo se publica lo que está en un estado público: nada de borradores, asociaciones
//   provisionales o equipos inactivos.
// - Tiene su propio límite de solicitudes y su propio manejo de errores, que nunca devuelve el
//   mensaje interno de la base de datos.
const express = require('express');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

router.use(rateLimit({ ventanaMs: 60_000, maximo: 120 }));
router.use((req, res, next) => {
  // Los datos cambian poco durante el día; un minuto de caché alcanza.
  res.set('Cache-Control', 'public, max-age=60');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

router.use('/competitions', require('./public/competitions'));
router.use('/associations', require('./public/associations'));
router.use('/news', require('./public/news'));

// Cualquier otra ruta o método bajo /api/public.
router.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : 503;
  if (status >= 500) console.error('[api pública]', req.method, req.originalUrl, err.causa || err);
  // Las respuestas de error no se guardan en caché.
  res.set('Cache-Control', 'no-store');
  res.status(status).json({ error: status >= 500 ? 'No fue posible obtener la información en este momento.' : err.message });
});

module.exports = router;
