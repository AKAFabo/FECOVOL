const path = require('path');
// Cargar .env de forma segura en caso de que este en ../.env o en .env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.VITA_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITA_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (o VITA_SUPABASE_URL / VITA_SUPABASE_SERVICE_ROLE_KEY). Verifique su archivo .env.'
  );
}

// supabase-js crea su cliente de Realtime al arrancar y exige un WebSocket.
// Node 22 lo trae incorporado; en Node 20 se usa el paquete "ws".
// La API no usa Realtime: esto solo evita que el servidor se caiga al iniciar.
const WebSocketImpl = globalThis.WebSocket || require('ws');

// La llave secreta (service_role) omite RLS: solo se usa desde el servidor, nunca desde el navegador.
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocketImpl }
});

module.exports = supabase;