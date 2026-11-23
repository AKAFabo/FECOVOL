// Punto de entrada para Vercel: la app de Express se exporta como una función serverless.
// En local se sigue usando src/server.js (npm run dev / npm start), que sí llama a app.listen().
// Las variables de entorno vienen del panel de Vercel; config/supabase.js carga .env solo si existe.
module.exports = require('../src/app');
