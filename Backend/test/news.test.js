// Pruebas de las rutas de noticias (/api/news). No necesitan conexion a la base de datos.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');
const { ADMIN: USUARIO_ADMIN, ARBITRO, registrarUsuarios } = require('./usuarios');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');

const UUID = '11111111-1111-4111-8111-111111111111';
// Id del administrador de prueba (autor de las noticias que crea).
const ADMIN = USUARIO_ADMIN.id;
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
  registrarUsuarios(fake);
});

async function call(method, ruta, body, token = USUARIO_ADMIN.token) {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

// La sesión de administrador ya queda registrada en beforeEach.
function comoAdmin() {}

const pasosDe = (tabla, metodo) =>
  fake.llamadas.filter((l) => l.tabla === tabla).flatMap((l) => l.pasos.filter((p) => p[0] === metodo));

test('sin token responde 401 y no consulta noticias', async () => {
  const r = await call('GET', '/api/news', null, null);
  assert.equal(r.status, 401);
  assert.equal(fake.llamadas.length, 0);
});

test('un usuario que no es administrador recibe 403', async () => {
  const r = await call('GET', '/api/news', null, ARBITRO.token);
  assert.equal(r.status, 403);
  assert.equal(fake.llamadas.filter((l) => l.tabla === 'news').length, 0);
});

test('listar con status PROGRAMADA filtra publicadas con fecha futura', async () => {
  comoAdmin();
  fake.alResponderTabla('news', { data: [{ id: UUID, title: 'Circuito de playa' }], error: null, count: 1 });

  const r = await call('GET', '/api/news?status=PROGRAMADA&q=playa');
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 1);
  assert.deepEqual(pasosDe('news', 'eq'), [['eq', 'status', 'PUBLICADA']]);
  assert.equal(pasosDe('news', 'gt')[0][1], 'published_at');
  assert.deepEqual(pasosDe('news', 'ilike'), [['ilike', 'title', '%playa%']]);
});

test('crear sin titulo da 400 y no inserta', async () => {
  comoAdmin();
  const r = await call('POST', '/api/news', { content: '<p>Hola</p>' });
  assert.equal(r.status, 400);
  assert.equal(pasosDe('news', 'insert').length, 0);
});

test('crear borrador genera slug unico y usa al usuario en sesion como autor', async () => {
  comoAdmin();
  fake.alResponderTabla(
    'news',
    { data: [{ slug: 'clasico-en-sarchi' }], error: null },
    { data: { id: UUID }, error: null },
    { data: { id: UUID, title: 'Clásico en Sarchí' }, error: null }
  );

  const r = await call('POST', '/api/news', { title: 'Clásico en Sarchí', author_id: UUID });
  assert.equal(r.status, 201);

  const [[, fila]] = pasosDe('news', 'insert');
  assert.equal(fila.slug, 'clasico-en-sarchi-2');
  assert.equal(fila.author_id, ADMIN);
  assert.equal(fila.status, 'BORRADOR');
  assert.equal(fila.published_at, null);
});

test('publicar sin imagen ni cuerpo da 400 y no inserta', async () => {
  comoAdmin();
  fake.alResponderTabla('news', { data: [], error: null });

  const r = await call('POST', '/api/news', { title: 'Sin imagen', status: 'PUBLICADA', content: '<p><br></p>' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /imagen destacada/);
  assert.equal(pasosDe('news', 'insert').length, 0);
});

test('publicar una noticia completa le pone fecha y quita las otras destacadas', async () => {
  comoAdmin();
  const borrador = {
    id: UUID, title: 'Lista', content: '<p>Texto</p>', cover_image_url: 'https://x/a.jpg',
    cover_image_alt: 'Foto', status: 'BORRADOR', published_at: null, is_featured: false
  };
  fake.alResponderTabla(
    'news',
    { data: borrador, error: null },
    { data: null, error: null },
    { data: null, error: null },
    { data: { ...borrador, status: 'PUBLICADA' }, error: null }
  );

  const r = await call('PATCH', `/api/news/${UUID}`, { status: 'PUBLICADA', is_featured: true });
  assert.equal(r.status, 200);

  const actualizaciones = pasosDe('news', 'update');
  assert.equal(actualizaciones[0][1].status, 'PUBLICADA');
  assert.ok(actualizaciones[0][1].published_at);
  assert.equal(actualizaciones[0][1].updated_by, ADMIN);
  assert.deepEqual(actualizaciones[1][1], { is_featured: false });
});

test('retirar es un borrado logico con el usuario que lo hizo', async () => {
  comoAdmin();
  fake.alResponderTabla('news', { data: { id: UUID, title: 'Vieja' }, error: null }, { data: null, error: null });

  const r = await call('DELETE', `/api/news/${UUID}`);
  assert.equal(r.status, 200);

  const [[, cambios]] = pasosDe('news', 'update');
  assert.equal(cambios.deleted_by, ADMIN);
  assert.ok(cambios.deleted_at);
});

test('una noticia inexistente da 404', async () => {
  comoAdmin();
  fake.alResponderTabla('news', { data: null, error: null });

  const r = await call('GET', `/api/news/${UUID}`);
  assert.equal(r.status, 404);
});
