// Usuarios de prueba compartidos por los archivos de pruebas. El token es lo que viaja en
// Authorization; el backend lo valida con supabase.auth.getUser (falso) y luego busca el perfil
// por el correo verificado.
const ASO_PROPIA = '33333333-3333-4333-8333-333333333333';

const ADMIN = { token: 'token-admin-0000000000000', id: '00000000-0000-4000-8000-0000000000a1', email: 'admin@fecovol.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Administrador' } };
const REPRE = { token: 'token-repre-0000000000000', id: '00000000-0000-4000-8000-0000000000b2', email: 'rep@grecia.cr', status: 'ACTIVA', organization_id: ASO_PROPIA, roles: { name: 'Representante' } };
const ARBITRO = { token: 'token-arbitro-00000000000', id: '00000000-0000-4000-8000-0000000000c3', email: 'arbitro@fecovol.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Árbitro' } };

function registrarUsuarios(fake) {
  for (const u of [ADMIN, REPRE, ARBITRO]) {
    const { token, ...perfil } = u;
    fake.conSesion(token, perfil);
  }
}

// Encabezados para `quien`: un usuario de prueba (manda su token), null (sin sesión) o un objeto
// de encabezados escritos a mano.
function encabezadosDe(quien) {
  if (quien?.token) return { Authorization: `Bearer ${quien.token}` };
  return quien ? { ...quien } : {};
}

module.exports = { ASO_PROPIA, ADMIN, REPRE, ARBITRO, registrarUsuarios, encabezadosDe };
