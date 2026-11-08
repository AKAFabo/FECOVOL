// Pruebas de la API del frente Asociaciones y Arbitraje.
// No necesitan conexion: reemplazan el cliente de Supabase por uno falso.
// Ejecutar con: npm test
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const { limpiarCache } = require('../src/middleware/authenticate');
const { ASO_PROPIA, ADMIN, REPRE, ARBITRO, registrarUsuarios, encabezadosDe } = require('./usuarios');

const UUID = '11111111-1111-4111-8111-111111111111';
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => {
  fake.reset();
  limpiarCache();
  registrarUsuarios(fake);
});

// `quien`: un usuario de prueba (se manda su token), null (sin sesión) o un objeto de encabezados.
async function call(method, ruta, body, quien = ADMIN) {
  const headers = { 'Content-Type': 'application/json', ...encabezadosDe(quien) };
  const res = await fetch(base + ruta, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

// Las consultas que hacen los middlewares (perfil, roles, bitácora) no son de la ruta.
const deRuta = () => fake.llamadas.filter((l) => !['user_profiles', 'user_roles', 'audit_logs'].includes(l.tabla));

const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');

test('la raiz responde con la lista de endpoints', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.ok(r.json.endpoints.includes('/api/associations'));
});

test('crear asociacion sin cedula juridica da 400 y no toca la base de datos', async () => {
  const r = await call('POST', '/api/associations', { name: 'Sin cedula' });
  assert.equal(r.status, 400);
  assert.equal(deRuta().length, 0);
});

test('crear asociacion llama al procedimiento con el usuario de la sesion', async () => {
  fake.alResponderRpc('sp_create_association', { data: UUID, error: null });
  fake.alResponderTabla('associations', { data: { id: UUID, name: 'AD Grecia' }, error: null });

  const r = await call('POST', '/api/associations', { name: 'AD Grecia', tax_id: '3-002-1' });

  assert.equal(r.status, 201);
  assert.equal(r.json.data.id, UUID);
  const [llamada] = rpcs();
  assert.equal(llamada.nombre, 'sp_create_association');
  assert.equal(llamada.params.p_admin_user, ADMIN.email);
  assert.equal(llamada.params.p_status, 'AFILIADA');
});

test('un RAISE EXCEPTION de "ya existe" se convierte en 409', async () => {
  fake.alResponderRpc('sp_create_association', {
    data: null,
    error: { code: 'P0001', message: 'Ya existe una asociacion con la cedula juridica 3-002-1' }
  });
  const r = await call('POST', '/api/associations', { name: 'X', tax_id: '3-002-1' });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Ya existe/);
});

test('un RAISE EXCEPTION de "no existe" se convierte en 404', async () => {
  fake.alResponderRpc('sp_update_association', {
    data: null,
    error: { code: 'P0001', message: `No existe la asociacion ${UUID}` }
  });
  const r = await call('PATCH', `/api/associations/${UUID}`, { phone: '2222-2222' });
  assert.equal(r.status, 404);
});

test('una violacion de llave unica (23505) se convierte en 409', async () => {
  fake.alResponderRpc('sp_add_team_member', {
    data: null,
    error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_team_members_active"' }
  });
  const r = await call('POST', `/api/teams/${UUID}/members`, { person_id: UUID, member_type: 'JUGADOR' });
  assert.equal(r.status, 409);
});

test('un id que no es UUID da 400 antes de consultar', async () => {
  const r = await call('GET', '/api/teams/no-es-un-uuid');
  assert.equal(r.status, 400);
  assert.equal(deRuta().length, 0);
});

test('detalle inexistente (PGRST116) da 404', async () => {
  fake.alResponderTabla('associations', { data: null, error: { code: 'PGRST116', message: 'no rows' } });
  const r = await call('GET', `/api/associations/${UUID}`);
  assert.equal(r.status, 404);
  assert.match(r.json.error, /Asociacion no encontrado/);
});

test('member_type invalido en la nomina da 400', async () => {
  const r = await call('POST', `/api/teams/${UUID}/members`, { person_id: UUID, member_type: 'DELEGADO' });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('revisar documento con un estado no permitido da 400', async () => {
  const r = await call('PATCH', `/api/documents/${UUID}/review`, { status: 'APROBADO' });
  assert.equal(r.status, 400);
});

test('designacion con estado no permitido da 400', async () => {
  const r = await call('PATCH', `/api/referee-assignments/${UUID}`, { status: 'PENDIENTE' });
  assert.equal(r.status, 400);
});

test('la busqueda de personas limpia caracteres que rompen el filtro', async () => {
  fake.alResponderTabla('persons', { data: [], error: null, count: 0 });
  const r = await call('GET', '/api/persons?q=' + encodeURIComponent('rojas,id.eq.1)'));
  assert.equal(r.status, 200);
  const consulta = fake.llamadas.find((l) => l.tabla === 'persons');
  const [, filtro] = consulta.pasos.find((p) => p[0] === 'or');
  assert.ok(!/[()]/.test(filtro.replace(/ilike/g, '')), 'no deben quedar parentesis');
  assert.equal(filtro.split(',').length, 3, 'solo las tres condiciones de busqueda');
});

test('el filtro por rol se resuelve en la base de datos con un join interno', async () => {
  fake.alResponderTabla('persons', { data: [], error: null, count: 0 });
  await call('GET', '/api/persons?role=ARBITRO');
  const consulta = fake.llamadas.find((l) => l.tabla === 'persons');
  const [, select] = consulta.pasos.find((p) => p[0] === 'select');
  assert.match(select, /person_roles!inner/);
  assert.ok(consulta.pasos.some((p) => p[0] === 'eq' && p[1] === 'person_roles.role_type' && p[2] === 'ARBITRO'));
});

test('agregar cargo de junta directiva pasa por el procedimiento (queda en bitacora)', async () => {
  fake.alResponderRpc('sp_add_board_member', { data: UUID, error: null });
  const r = await call('POST', `/api/associations/${UUID}/board`, { position: 'Presidencia', full_name: 'Ana' });
  assert.equal(r.status, 201);
  assert.equal(rpcs()[0].nombre, 'sp_add_board_member');
});

test('ruta inexistente da 404', async () => {
  const r = await call('GET', '/api/no-existe');
  assert.equal(r.status, 404);
});

/* ----------------------------------------------------------------------------------------------
   Identidad y ámbito: quién llama sale del token verificado, nunca de un encabezado o del cuerpo.
   ---------------------------------------------------------------------------------------------- */

test('un x-user-email escrito a mano sin token no da permisos: se trata como público', async () => {
  const r = await call('POST', '/api/associations', { name: 'AD Falsa', tax_id: '3-002-9' }, { 'x-user-email': ADMIN.email });
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('admin_email en el cuerpo tampoco identifica a nadie', async () => {
  const r = await call('POST', '/api/associations', { name: 'AD Falsa', tax_id: '3-002-9', admin_email: ADMIN.email }, null);
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('un token que Supabase no reconoce da 401', async () => {
  const r = await call('GET', '/api/persons', null, { Authorization: 'Bearer token-inventado-000000000000' });
  assert.equal(r.status, 401);
});

test('un encabezado Authorization mal formado da 401', async () => {
  const r = await call('GET', '/api/persons', null, { Authorization: 'Basic abc' });
  assert.equal(r.status, 401);
});

test('la bitacora registra el correo verificado de la sesion', async () => {
  fake.alResponderRpc('sp_add_board_member', { data: UUID, error: null });
  await call('POST', `/api/associations/${ASO_PROPIA}/board`, { position: 'Tesorería', full_name: 'Luis' }, REPRE);
  assert.equal(rpcs()[0].params.p_admin_user, REPRE.email);
});

test('un arbitro (sin asociacion) no puede crear personas ni equipos', async () => {
  const persona = await call('POST', '/api/persons', { first_name: 'A', last_name: 'B', document_number: '1-1111-1111', document_type_code: 'CEDULA', birth_date: '2000-01-01' }, ARBITRO);
  assert.equal(persona.status, 403);
  const equipo = await call('POST', '/api/teams', { name: 'X', category_code: 'MAYOR', branch_code: 'F', modality_code: 'SALA', association_id: UUID }, ARBITRO);
  assert.equal(equipo.status, 403);
  assert.equal(rpcs().length, 0);
});

test('un representante no puede modificar a una persona sin asociacion', async () => {
  fake.alResponderTabla('persons', { data: { id: UUID, association_id: null, first_name: 'Sin', last_name: 'Asociacion' }, error: null });
  const r = await call('PATCH', `/api/persons/${UUID}`, { phone: '8888-8888' }, REPRE);
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('un representante puede modificar a una persona de su asociacion, pero no su estado', async () => {
  fake.alResponderTabla('persons',
    { data: { id: UUID, association_id: ASO_PROPIA, first_name: 'Ana', last_name: 'Mora' }, error: null },
    { data: { id: UUID }, error: null });
  fake.alResponderRpc('sp_update_person', { data: null, error: null });
  const r = await call('PATCH', `/api/persons/${UUID}`, { phone: '8888-8888', status: 'SUSPENDIDO' }, REPRE);
  assert.equal(r.status, 200);
  const [llamada] = rpcs();
  assert.equal(llamada.params.p_phone, '8888-8888');
  assert.equal(llamada.params.p_status, null);
});

test('un representante no puede cambiar el nombre legal de su asociacion', async () => {
  fake.alResponderRpc('sp_update_association', { data: null, error: null });
  const r = await call('PATCH', `/api/associations/${ASO_PROPIA}`, { name: 'Otro nombre', phone: '2222-0000', status: 'AFILIADA' }, REPRE);
  assert.equal(r.status, 200);
  const [llamada] = rpcs();
  assert.equal(llamada.params.p_name, null);
  assert.equal(llamada.params.p_status, null);
  assert.equal(llamada.params.p_phone, '2222-0000');
});

test('un representante no puede modificar otra asociacion', async () => {
  const r = await call('PATCH', `/api/associations/${UUID}`, { phone: '2222-0000' }, REPRE);
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('si el procedimiento falla no se escribe directo en la tabla', async () => {
  fake.alResponderRpc('sp_update_association', { data: null, error: { code: 'P0001', message: 'Estado no permitido' } });
  const r = await call('PATCH', `/api/associations/${UUID}`, { status: 'X' });
  assert.equal(r.status, 400);
  assert.ok(!fake.llamadas.some((l) => l.tabla === 'associations' && l.pasos.some((p) => ['insert', 'update', 'upsert'].includes(p[0]))));
});

test('el publico no ve documentos', async () => {
  const r = await call('GET', '/api/documents', null, null);
  assert.ok([401, 403].includes(r.status));
  assert.equal(deRuta().length, 0);
});

test('establecer contrasena exige la sesion del enlace del correo', async () => {
  const r = await call('POST', '/api/users/establish-password', { email: ADMIN.email, password: 'Nueva-123456' }, null);
  assert.equal(r.status, 401);
});

test('un parametro del sistema solo lo crea un administrador', async () => {
  const r = await call('POST', '/api/parameters', { name: 'X', value: '1' }, REPRE);
  assert.equal(r.status, 403);
});

test('ver las sesiones de otro usuario da 403', async () => {
  const r = await call('GET', `/api/users/sessions/${ADMIN.id}`, null, REPRE);
  assert.equal(r.status, 403);
});

test('mi perfil devuelve la asociacion del representante y exige sesion', async () => {
  fake.alResponderTabla('associations', { data: { id: ASO_PROPIA, name: 'AD Grecia', short_name: 'Grecia', status: 'AFILIADA' }, error: null });
  const r = await call('GET', '/api/users/me', null, REPRE);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.email, REPRE.email);
  assert.equal(r.json.data.organizacion.id, ASO_PROPIA);
  const anonimo = await call('GET', '/api/users/me', null, null);
  assert.equal(anonimo.status, 401);
});

test('editar un cargo de junta de otra asociacion da 403', async () => {
  fake.alResponderTabla('association_board_members', { data: { id: UUID, association_id: UUID, end_date: null }, error: null });
  const r = await call('PATCH', `/api/associations/board/${UUID}`, { phone: '1' }, REPRE);
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('terminar un cargo propio pasa por el procedimiento', async () => {
  fake.alResponderTabla('association_board_members', { data: { id: UUID, association_id: ASO_PROPIA, end_date: null }, error: null });
  fake.alResponderRpc('sp_end_board_member', { data: null, error: null });
  const r = await call('DELETE', `/api/associations/board/${UUID}`, null, REPRE);
  assert.equal(r.status, 200);
  assert.equal(rpcs()[0].nombre, 'sp_end_board_member');
});

test('mis equipos trae el conteo de integrantes activos', async () => {
  fake.alResponderTabla('teams', { data: [{ id: UUID, name: 'Mayor F', association_id: ASO_PROPIA }], error: null });
  fake.alResponderTabla('team_members', { data: [{ team_id: UUID, member_type: 'JUGADOR' }, { team_id: UUID, member_type: 'JUGADOR' }, { team_id: UUID, member_type: 'TECNICO' }], error: null });
  const r = await call('GET', '/api/teams', null, REPRE);
  assert.equal(r.status, 200);
  assert.equal(r.json.data[0].jugadores, 2);
  assert.equal(r.json.data[0].tecnicos, 1);
});

test('con la identidad verificada, el representante no cambia el nombre ni la fecha de nacimiento', async () => {
  fake.alResponderTabla('persons',
    { data: { id: UUID, association_id: ASO_PROPIA, first_name: 'Ana', last_name: 'Mora', is_verified: true }, error: null },
    { data: { id: UUID }, error: null });
  fake.alResponderRpc('sp_update_person', { data: null, error: null });
  const r = await call('PATCH', `/api/persons/${UUID}`, { first_name: 'Otra', birth_date: '2001-01-01', phone: '8888-0000' }, REPRE);
  assert.equal(r.status, 200);
  const [llamada] = rpcs();
  assert.equal(llamada.params.p_first_name, null);
  assert.equal(llamada.params.p_birth_date, null);
  assert.equal(llamada.params.p_phone, '8888-0000');
});
