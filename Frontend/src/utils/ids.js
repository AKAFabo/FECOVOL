// Validación de identificadores que llegan en la URL, antes de usarlos en una solicitud.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdValido(id) {
  return typeof id === 'string' && UUID.test(id);
}
