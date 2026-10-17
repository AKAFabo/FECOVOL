const path = require('path');
// Intentar cargar .env desde Backend/.env y desde Backend/src/.env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
