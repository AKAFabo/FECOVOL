/**
 * Utilidades para validación de la política de contraseñas (RF-SEG-007, RF-SEG-008).
 * Criterios ERS:
 * - Mínimo 8 caracteres
 * - Al menos una letra mayúscula
 * - Al menos un número
 * - Al menos un símbolo o carácter especial
 */

export const POLITICA_PASSWORD = {
  MIN_CARACTERES: 8,
  REGEX_MINUSCULA: /[a-z]/,
  REGEX_MAYUSCULA: /[A-Z]/,
  REGEX_NUMERO: /[0-9]/,
  REGEX_SIMBOLO: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/,
};

export function evaluarPoliticaPassword(password = '') {
  const longitudOk = password.length >= POLITICA_PASSWORD.MIN_CARACTERES;
  const minusculaOk = POLITICA_PASSWORD.REGEX_MINUSCULA.test(password);
  const mayusculaOk = POLITICA_PASSWORD.REGEX_MAYUSCULA.test(password);
  const numeroOk = POLITICA_PASSWORD.REGEX_NUMERO.test(password);
  const simboloOk = POLITICA_PASSWORD.REGEX_SIMBOLO.test(password);

  const esValida = longitudOk && minusculaOk && mayusculaOk && numeroOk && simboloOk;

  const reglas = [
    {
      id: 'longitud',
      texto: `Mínimo ${POLITICA_PASSWORD.MIN_CARACTERES} caracteres`,
      cumplida: longitudOk
    },
    {
      id: 'minuscula',
      texto: 'Al menos una letra minúscula (a-z)',
      cumplida: minusculaOk
    },
    {
      id: 'mayuscula',
      texto: 'Al menos una letra mayúscula (A-Z)',
      cumplida: mayusculaOk
    },
    {
      id: 'numero',
      texto: 'Al menos un número (0-9)',
      cumplida: numeroOk
    },
    {
      id: 'simbolo',
      texto: 'Al menos un símbolo o carácter especial (!@#$%...)',
      cumplida: simboloOk
    }
  ];

  const errores = [];
  if (!longitudOk) errores.push(`Debe tener al menos ${POLITICA_PASSWORD.MIN_CARACTERES} caracteres.`);
  if (!minusculaOk) errores.push('Debe incluir al menos una letra minúscula.');
  if (!mayusculaOk) errores.push('Debe incluir al menos una letra mayúscula.');
  if (!numeroOk) errores.push('Debe incluir al menos un número.');
  if (!simboloOk) errores.push('Debe incluir al menos un símbolo especial.');

  return {
    esValida,
    reglas,
    errores
  };
}
