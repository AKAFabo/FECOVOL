// Campo de teléfono: no deja escribir letras y, al salir del campo, deja el número con el formato
// que se guarda (8888-0000 o +internacional). La validación al guardar usa normalizarTelefono.
import { normalizarTelefono, soloCaracteresDeTelefono } from '../utils/telefono.js';

/**
 * @param {object} props  Se pasan tal cual al <input> (id, aria-*, className…), salvo:
 * @param {string} props.value
 * @param {(valor: string) => void} props.onCambiar
 */
export default function EntradaTelefono({ value, onCambiar, ...resto }) {
  return (
    <input
      {...resto}
      type="tel"
      inputMode="tel"
      autoComplete={resto.autoComplete || 'tel'}
      maxLength={25}
      placeholder={resto.placeholder || '8888-0000'}
      value={value}
      onChange={(e) => onCambiar(soloCaracteresDeTelefono(e.target.value))}
      onBlur={() => onCambiar(normalizarTelefono(value).valor || value)}
    />
  );
}
