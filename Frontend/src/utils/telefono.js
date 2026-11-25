// Teléfonos de contacto (asociaciones, junta directiva, árbitros).
//
// Se aceptan:
//   - Costa Rica: 8 dígitos que empiezan con 2, 4, 5, 6, 7 u 8, con o sin +506, guiones o espacios.
//     Se guardan como 8888-0000.
//   - Internacional: + y de 8 a 15 dígitos (formato E.164). Se guardan como +<dígitos>.
// No se aceptan letras, extensiones ("ext. 12") ni números cortos como una extensión interna.
//
// Copia de Backend/src/utils/telefono.js para avisar al escribir; la validación que cuenta es la
// del backend. Si cambia la regla, cambie las dos.

export const MENSAJE_TELEFONO = 'Escriba un teléfono de 8 dígitos (por ejemplo, 8888-0000) o uno internacional que empiece con +.';

/**
 * @param {unknown} entrada
 * @returns {{ valor: string|null, error: string|null }} valor null si viene vacío.
 */
export function normalizarTelefono(entrada) {
  const t = String(entrada ?? '').trim();
  if (!t) return { valor: null, error: null };
  if (t.length > 25 || /[^0-9+\s()-]/.test(t) || t.indexOf('+') > 0 || (t.match(/\+/g) || []).length > 1) {
    return { valor: null, error: MENSAJE_TELEFONO };
  }
  let digitos = t.replace(/\D/g, '');
  const internacional = t.startsWith('+');
  if ((internacional || digitos.length === 11) && digitos.startsWith('506') && digitos.length === 11) digitos = digitos.slice(3);
  else if (internacional) {
    return digitos.length >= 8 && digitos.length <= 15 && digitos[0] !== '0'
      ? { valor: `+${digitos}`, error: null }
      : { valor: null, error: MENSAJE_TELEFONO };
  }
  if (digitos.length === 8 && /^[245678]/.test(digitos)) return { valor: `${digitos.slice(0, 4)}-${digitos.slice(4)}`, error: null };
  return { valor: null, error: MENSAJE_TELEFONO };
}

/** Quita al escribir lo que nunca puede ir en un teléfono (letras y otros símbolos). */
export const soloCaracteresDeTelefono = (texto) => texto.replace(/[^0-9+\s()-]/g, '');
