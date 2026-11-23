// Cierre de sesión común a todos los entornos (RF-SEG-002 y RF-SEG-003).
//
// Registra el cierre en la bitácora a través del backend, con el token de la sesión: el servidor
// toma el usuario del token, no de lo que mande el navegador. El navegador nunca escribe en la
// bitácora directamente. Si el registro falla (por ejemplo, sin conexión), la sesión se cierra igual.
import { supabase } from '../supabaseClient.js';
import { api } from './apiInterna.js';

export const CLAVE_ACTIVIDAD = 'fecovol_last_activity';

/**
 * @param {{ razon?: string, nombre?: string }} [opciones]
 *   razon: motivo que queda en la bitácora (por defecto, cierre manual).
 */
export async function cerrarSesionAuditada({ razon = 'Cierre de sesión manual voluntario', nombre } = {}) {
  try {
    await api.post('/users/logout-audit', { razon, full_name: nombre || undefined }, { timeoutMs: 8000 });
  } catch {
    /* sin registro: la sesión se cierra de todos modos */
  }
  try {
    localStorage.removeItem(CLAVE_ACTIVIDAD);
    sessionStorage.removeItem('fecovol_password_changed_locally');
  } catch {
    /* almacenamiento no disponible */
  }
  await supabase.auth.signOut();
}
