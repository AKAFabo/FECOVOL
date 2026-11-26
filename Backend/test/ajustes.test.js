// Ajustes de Competencias y padrón: avisos del panel, reincorporar equipos, fechas de partidos que
// no pueden quedar en el pasado y fecha de nacimiento.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const { limpiarCache } = require('../src/middleware/authenticate');
const { ADMIN, REPRE, registrarUsuarios, encabezadosDe } = require('./usuarios');
const { esFutura } = require('../src/utils/fechasPartido');
const { errorFechaNacimiento } = require('../src/utils/fechaNacimiento');
const { hoyCR, sumarDias } = require('../src/utils/arbitraje');

const COMP = '11111111-1111-4111-8111-111111111111';
const EQUIPO = '22222222-2222-4222-8222-222222222222';
const PARTIDO = '33333333-3333-4333-8333-333333333333';
const EQ2 = '44444444-4444-4444-8444-444444444444';

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

async function call(method, ruta, body, quien = ADMIN) {
  const res = await fetch(base + ruta, { method, headers: { 'Content-Type': 'application/json', ...encabezadosDe(quien) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}
const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');
const updates = (tabla) => fake.llamadas.filter((l) => l.tabla === tabla && l.pasos.some((p) => p[0] === 'update'));

/* ─── Avisos del panel ─── */

test('métricas: pendientes = ya jugados sin resultado; sin árbitro = por jugar y sin oficiales', async () => {
  const hoy = hoyCR();
  fake.alResponderTabla('matches', { data: [
    { id: 'a', status: 'PROGRAMADO', scheduled_date: sumarDias(hoy, -3) },
    { id: 'b', status: 'PROGRAMADO', scheduled_date: sumarDias(hoy, 5) },
    { id: 'c', status: 'REPROGRAMADO', scheduled_date: sumarDias(hoy, 6) },
    { id: 'd', status: 'FINALIZADO', scheduled_date: sumarDias(hoy, -10) }
  ], error: null });
  fake.alResponderTabla('match_reschedulings', { data: null, error: null, count: 1 });
  fake.alResponderTabla('referee_assignments', { data: [{ match_id: 'c' }], error: null });

  const r = await call('GET', `/api/competitions/${COMP}/metrics`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, { resultados_pendientes: 1, solicitudes_reprogramacion: 1, partidos_sin_arbitro: 1 });
  const consulta = fake.llamadas.find((l) => l.tabla === 'referee_assignments');
  assert.ok(consulta.pasos.some((p) => p[0] === 'not' && p[1] === 'status' && /RECHAZADA/.test(p[3])));
});

/* ─── Reincorporar un equipo ─── */

test('un equipo retirado se reincorpora si la competencia no terminó y hay cupo', async () => {
  fake.alResponderTabla('competitions', { data: { id: COMP, status: 'EN_CURSO', max_teams: 12 }, error: null });
  fake.alResponderTabla('competition_teams',
    { data: { id: 'ct1', status: 'RETIRADO' }, error: null },
    { data: null, error: null, count: 8 },
    { data: null, error: null });
  const r = await call('POST', `/api/competitions/${COMP}/teams/${EQUIPO}/reincorporar`);
  assert.equal(r.status, 200);
  const u = updates('competition_teams')[0];
  assert.deepEqual(u.pasos.find((p) => p[0] === 'update')[1], { status: 'INSCRITO' });
});

test('no se reincorpora en una competencia finalizada, sin cupo o si el equipo no estaba retirado', async () => {
  fake.alResponderTabla('competitions', { data: { id: COMP, status: 'FINALIZADA', max_teams: 12 }, error: null });
  fake.alResponderTabla('competition_teams', { data: { id: 'ct1', status: 'RETIRADO' }, error: null });
  assert.equal((await call('POST', `/api/competitions/${COMP}/teams/${EQUIPO}/reincorporar`)).status, 409);

  fake.alResponderTabla('competitions', { data: { id: COMP, status: 'INSCRIPCIONES', max_teams: 8 }, error: null });
  fake.alResponderTabla('competition_teams', { data: { id: 'ct1', status: 'RETIRADO' }, error: null }, { data: null, error: null, count: 8 });
  const lleno = await call('POST', `/api/competitions/${COMP}/teams/${EQUIPO}/reincorporar`);
  assert.equal(lleno.status, 409);
  assert.match(lleno.json.error, /cupo/);

  fake.alResponderTabla('competitions', { data: { id: COMP, status: 'INSCRIPCIONES', max_teams: 8 }, error: null });
  fake.alResponderTabla('competition_teams', { data: { id: 'ct1', status: 'INSCRITO' }, error: null });
  assert.equal((await call('POST', `/api/competitions/${COMP}/teams/${EQUIPO}/reincorporar`)).status, 409);
  assert.equal(updates('competition_teams').length, 0);

  assert.equal((await call('POST', `/api/competitions/${COMP}/teams/${EQUIPO}/reincorporar`, null, REPRE)).status, 403);
});

/* ─── Fechas de partidos ─── */

test('esFutura compara con la hora de Costa Rica', () => {
  const ahora = new Date('2026-11-26T20:00:00Z'); // 14:00 en Costa Rica
  assert.equal(esFutura('2026-11-27', null, ahora), true);
  assert.equal(esFutura('2026-11-25', '23:00', ahora), false);
  assert.equal(esFutura('2026-11-26', '15:00', ahora), true);
  assert.equal(esFutura('2026-11-26', '13:59', ahora), false);
  assert.equal(esFutura('2026-11-26', null, ahora), false);
});

test('no se programa ni se reprograma un partido para una fecha que ya pasó', async () => {
  const crear = await call('POST', '/api/matches', { competition_id: COMP, match_number: 1, matchday: 1, home_team_id: EQUIPO, away_team_id: EQ2, scheduled_date: '2020-03-01', scheduled_time: '19:00' });
  assert.equal(crear.status, 400);
  assert.match(crear.json.error, /ya pasó/);
  assert.equal(rpcs().length, 0);

  fake.alResponderTabla('matches', { data: { id: PARTIDO, status: 'PROGRAMADO', scheduled_date: sumarDias(hoyCR(), 10), scheduled_time: '19:00', venue_id: null }, error: null });
  const mover = await call('PATCH', `/api/matches/${PARTIDO}`, { scheduled_date: '2020-03-01' });
  assert.equal(mover.status, 400);
  assert.equal(updates('matches').length, 0);

  const jornada = await call('PATCH', `/api/competitions/${COMP}/matchdays/2`, { scheduled_date: '2020-03-01' });
  assert.equal(jornada.status, 400);

  fake.alResponderTabla('matches', { data: { id: PARTIDO, status: 'PROGRAMADO', scheduled_date: sumarDias(hoyCR(), 10), scheduled_time: '19:00', venue_id: null }, error: null });
  const solicitud = await call('POST', `/api/matches/${PARTIDO}/reschedule-request`, { scheduled_date: '2020-03-01', scheduled_time: '10:00', reason: 'Gimnasio ocupado' });
  assert.equal(solicitud.status, 400);
});

/* ─── Fecha de nacimiento ─── */

test('fecha de nacimiento: real, no futura, desde 1920 y con la edad mínima', () => {
  const ahora = new Date('2026-11-26T18:00:00Z');
  assert.equal(errorFechaNacimiento('2001-05-20', ahora), null);
  assert.match(errorFechaNacimiento('2001-02-30', ahora), /no existe/);
  assert.match(errorFechaNacimiento('2027-01-01', ahora), /futura/);
  assert.match(errorFechaNacimiento('1919-12-31', ahora), /1920/);
  assert.match(errorFechaNacimiento('2024-01-01', ahora), /al menos 4 años/);
  assert.match(errorFechaNacimiento('20/05/2001', ahora), /no es válida/);
});

test('el padrón rechaza una fecha de nacimiento futura', async () => {
  const r = await call('POST', '/api/persons', { first_name: 'Ana', last_name: 'Mora', document_number: '1-1111-1111', document_type_code: 'CED', birth_date: '2099-01-01' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /futura/);
  assert.equal(rpcs().length, 0);
});
