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

const UUID = '11111111-1111-4111-8111-111111111111';
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => fake.reset());

async function call(method, ruta, body, usuario = 'prueba@fecovol.cr') {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-email': usuario },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');

test('la raiz responde con la lista de endpoints', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.ok(r.json.endpoints.includes('/api/associations'));
});

test('crear asociacion sin cedula juridica da 400 y no toca la base de datos', async () => {
  const r = await call('POST', '/api/associations', { name: 'Sin cedula' });
  assert.equal(r.status, 400);
  assert.equal(fake.llamadas.length, 0);
});

test('crear asociacion llama al procedimiento con el usuario del encabezado', async () => {
  fake.alResponderRpc('sp_create_association', { data: UUID, error: null });
  fake.alResponderTabla('associations', { data: { id: UUID, name: 'AD Grecia' }, error: null });

  const r = await call('POST', '/api/associations', { name: 'AD Grecia', tax_id: '3-002-1' }, 'rep@grecia.cr');

  assert.equal(r.status, 201);
  assert.equal(r.json.data.id, UUID);
  const [llamada] = rpcs();
  assert.equal(llamada.nombre, 'sp_create_association');
  assert.equal(llamada.params.p_admin_user, 'rep@grecia.cr');
  assert.equal(llamada.params.p_status, 'PROVISIONAL');
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
  assert.equal(fake.llamadas.length, 0);
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

test('un documento con dos duenos da 400', async () => {
  const r = await call('POST', '/api/documents', {
    document_type_code: 'MED', file_url: 'https://x/y.pdf', person_id: UUID, team_id: UUID
  });
  assert.equal(r.status, 400);
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
