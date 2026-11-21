import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
// Solo la clave pública (anon/publishable). La service_role nunca va en el frontend: todo lo que
// se compila aquí lo puede leer cualquiera que abra la página.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase en el Frontend (.env).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);