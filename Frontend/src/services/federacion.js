// Cifras públicas de la Federación (GET /api/public/federation).
import { obtener } from './apiPublica.js';

export function obtenerCifras(opciones) {
  return obtener('/federation', opciones);
}
