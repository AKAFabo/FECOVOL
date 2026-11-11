// Acceso a los datos públicos de asociaciones afiliadas (GET /api/public/associations...).
import { obtener } from './apiPublica.js';
import { esIdValido } from '../utils/ids.js';

export { esIdValido };

export function listarAsociaciones(opciones) {
  return obtener('/associations', opciones);
}

export function obtenerAsociacion(id, opciones) {
  if (!esIdValido(id)) throw new Error('Identificador de asociación inválido');
  return obtener(`/associations/${encodeURIComponent(id)}`, opciones);
}
