// Selecciones nacionales: permisos, validaciones y lista blanca del portal público.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const { limpiarCache } = require('../src/middleware/authenticate');
const { aSelecciones } = require('../src/public/nationalTeamsDto');
const { ADMIN, REPRE, registrarUsuarios, encabezadosDe } = require('./usuarios');

const PERSONAL = { token: 'token-personal-selecciones-00', id: '00000000-0000-4000-8000-0000000000d7', email: 'personal@fecovol.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Personal' } };
const CONV = '11111111-1111-4111-8111-111111111111';
const SEL = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';

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
  const { token, ...perfil } = PERSONAL;
  fake.conSesion(token, perfil);
});

async function call(method, ruta, body, quien = ADMIN) {
  const res = await fetch(base + ruta, { method, headers: { 'Content-Type': 'application/json', ...encabezadosDe(quien) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}

const convocatoria = (status = 'BORRADOR') => ({ data: { id: CONV, title: 'Convocatoria', status, national_team_id: SEL, published_at: null }, error: null });

test('una cuenta de asociación no consulta las selecciones y el Personal no las modifica', async () => {
  assert.equal((await call('GET', '/api/national-teams', null, REPRE)).status, 403);
  assert.equal((await call('GET', '/api/national-teams', null, PERSONAL)).status, 200);
  assert.equal((await call('POST', '/api/national-teams', { name: 'Selección Mayor Femenina' }, PERSONAL)).status, 403);
});

test('una selección exige modalidad, rama y categoría válidas', async () => {
  const r = await call('POST', '/api/national-teams', { name: 'Selección Mayor Femenina', modality: 'NIEVE', branch_code: 'FEM', category_code: 'MAYOR' });
  assert.equal(r.status, 400);
});

test('el cuerpo técnico se convoca con su cargo y el número de una jugadora va de 1 a 99', async () => {
  fake.alResponderTabla('national_team_callups', convocatoria(), convocatoria());
  fake.alResponderTabla('persons', { data: { id: PERSONA, status: 'ACTIVA' }, error: null }, { data: { id: PERSONA, status: 'ACTIVA' }, error: null });
  const sinCargo = await call('POST', `/api/national-teams/convocatorias/${CONV}/integrantes`, { person_id: PERSONA, member_type: 'CUERPO_TECNICO' });
  assert.equal(sinCargo.status, 400);
  const numero = await call('POST', `/api/national-teams/convocatorias/${CONV}/integrantes`, { person_id: PERSONA, member_type: 'JUGADOR', jersey_number: 0 });
  assert.equal(numero.status, 400);
});

test('no se publica una convocatoria sin jugadoras', async () => {
  fake.alResponderTabla('national_team_callups', convocatoria());
  fake.alResponderTabla('national_team_callup_members', { data: null, error: null, count: 0 });
  const r = await call('PATCH', `/api/national-teams/convocatorias/${CONV}`, { status: 'PUBLICADA' });
  assert.equal(r.status, 409);
});

test('una convocatoria archivada no admite cambios en sus integrantes', async () => {
  fake.alResponderTabla('national_team_callups', convocatoria('ARCHIVADA'));
  const r = await call('POST', `/api/national-teams/convocatorias/${CONV}/integrantes`, { person_id: PERSONA, member_type: 'JUGADOR' });
  assert.equal(r.status, 409);
});

test('el portal público de selecciones no pide ni devuelve datos personales', async () => {
  const r = await fetch(`${base}/api/public/national-teams`);
  assert.equal(r.status, 200);
  const consultas = fake.llamadas.filter((l) => l.tipo === 'from').map((l) => JSON.stringify(l.pasos)).join(' ');
  assert.ok(!/document_number|birth_date|email|phone/.test(consultas));
});

test('la lista blanca muestra solo nombre, número y posición, la última convocatoria y personas activas', () => {
  const salida = aSelecciones({
    selecciones: [{ id: SEL, name: 'Mayor Femenina', modality: 'SALA', rama: { value: 'Femenina' }, categoria: { value: 'Mayor' } }],
    convocatorias: [
      { id: 'nueva', title: 'Gira', national_team_id: SEL, evento: { id: 'e1', name: 'Copa', start_date: '2099-01-10', end_date: '2099-01-15', venue: 'San José', status: 'PROGRAMADO' },
        integrantes: [
          { member_type: 'JUGADOR', jersey_number: 7, posicion: { value: 'Opuesto(a)' }, persona: { first_name: 'Ana', last_name: 'Mora', status: 'ACTIVA', document_number: '1-1111-1111' } },
          { member_type: 'JUGADOR', jersey_number: 9, persona: { first_name: 'Inactiva', last_name: 'X', status: 'INACTIVA' } },
          { member_type: 'CUERPO_TECNICO', staff_role: 'Entrenador', persona: { first_name: 'Luis', last_name: 'Rojas', status: 'ACTIVA' } }
        ] },
      { id: 'vieja', title: 'Anterior', national_team_id: SEL, evento: null, integrantes: [] }
    ],
    eventos: [{ id: 'e1', name: 'Copa', modality: 'SALA', start_date: '2099-01-10', end_date: '2099-01-15', venue: 'San José', status: 'PROGRAMADO' }]
  }, '2026-11-23');
  assert.equal(salida.national_teams[0].callup_id, 'nueva');
  assert.equal(salida.national_teams[0].next_event.name, 'Copa');
  assert.deepEqual(salida.callups[0].players, [{ number: 7, name: 'Ana Mora', position: 'Opuesto(a)' }]);
  assert.deepEqual(salida.callups[0].staff, [{ name: 'Luis Rojas', role: 'Entrenador' }]);
  assert.deepEqual(salida.events[0].teams, ['Mayor Femenina']);
  assert.ok(!JSON.stringify(salida).includes('1-1111-1111'));
});
