// Rutas de las pantallas de arbitraje en Administración.
const enc = encodeURIComponent;

export const RUTA_ARBITRAJE = {
  inicio: '/admin/arbitraje',
  acreditar: (personaId) => (personaId ? `/admin/arbitraje/acreditar?persona=${enc(personaId)}` : '/admin/arbitraje/acreditar'),
  ficha: (personaId) => `/admin/arbitraje/${enc(personaId)}`,
  cursos: '/admin/arbitraje/cursos',
  curso: (id) => `/admin/arbitraje/cursos/${enc(id)}`,
  nuevoCurso: '/admin/arbitraje/cursos/nuevo',
  designaciones: '/admin/arbitraje/designaciones',
  personaPadron: (personaId) => `/admin/personas/${enc(personaId)}`
};
