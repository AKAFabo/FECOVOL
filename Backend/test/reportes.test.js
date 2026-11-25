// Reportes de Designaciones arbitrales e Incidentes y sanciones: permisos y forma de los datos.
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

const PERSONAL = { token: 'token-personal-reportes-0000', id: '00000000-0000-4000-8000-0000000000d8', email: 'reportes@fecovol.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Personal' } };
const COMP = '11111111-1111-4111-8111-111111111111';
const ARB1 = '22222222-2222-4222-8222-222222222222';
const ARB2 = '33333333-3333-4333-8333-333333333333';

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

async function call(ruta, quien = ADMIN) {
  const res = await fetch(base + ruta, { headers: encabezadosDe(quien) });
  return { status: res.status, json: await res.json() };
}

test('los dos reportes son solo para FECOVOL', async () => {
  assert.equal((await call(`/api/reports/referee-assignments/${COMP}`, REPRE)).status, 403);
  assert.equal((await call(`/api/reports/incidents/${COMP}`, REPRE)).status, 403);
  assert.equal((await call(`/api/reports/incidents/${COMP}`, null)).status, 401);
  assert.equal((await call(`/api/reports/referee-assignments/no-es-uuid`)).status, 400);
});

test('designaciones: partidos por árbitro con la acreditación vigente a la fecha del partido', async () => {
  const partido = (id, fecha, arbitraje) => ({
    id, match_number: 1, matchday: 1, scheduled_date: fecha, scheduled_time: '19:00', status: 'PROGRAMADO',
    local: { name: 'Heredia VC', short_name: 'Heredia' }, visitante: { name: 'San José VC', short_name: null }, arbitraje
  });
  const desig = (personId, nombre, status) => ({ id: `${personId}-${status}`, status, person_id: personId, arbitro: { id: personId, first_name: nombre, last_name: 'Árbitro' }, puesto: { code: 'PRI', value: 'Primer árbitro' } });
  fake.alResponderTabla('matches', { data: [
    partido('m1', '2026-05-10', [desig(ARB1, 'Ana', 'CUMPLIDA'), desig(ARB2, 'Beto', 'ANULADA')]),
    partido('m2', '2026-12-01', [desig(ARB1, 'Ana', 'PROPUESTA'), desig(ARB2, 'Beto', 'CONFIRMADA')])
  ], error: null });
  fake.alResponderTabla('referee_accreditations', { data: [
    { person_id: ARB1, valid_from: '2026-01-01', valid_until: '2026-11-30', status: 'ACTIVA', nivel: { value: 'Nacional' }, funcion: { value: 'Primer árbitro' } }
  ], error: null });

  const r = await call(`/api/reports/referee-assignments/${COMP}`, PERSONAL);
  assert.equal(r.status, 200);
  const { filas, por_arbitro: porArbitro } = r.json.data;
  assert.equal(filas.length, 3);
  assert.equal(filas[0].partido, 'Heredia vs San José VC');
  assert.deepEqual(filas[0].acreditacion, { nivel: 'Nacional', funcion: 'Primer árbitro', hasta: '2026-11-30' });
  assert.equal(filas[1].acreditacion, null);
  assert.ok(filas.every((f) => !('arbitro_id' in f)));
  assert.deepEqual(porArbitro.find((x) => x.arbitro === 'Ana Árbitro'), { arbitro: 'Ana Árbitro', partidos: 2, confirmadas: 1, pendientes: 1, sin_acreditacion: 1 });
  assert.equal(porArbitro.find((x) => x.arbitro === 'Beto Árbitro').partidos, 1);

  const consulta = fake.llamadas.find((l) => l.tabla === 'referee_accreditations');
  assert.ok(consulta.pasos.some((p) => p[0] === 'neq' && p[1] === 'status' && p[2] === 'REVOCADA'));
  const select = fake.llamadas.find((l) => l.tabla === 'matches').pasos.find((p) => p[0] === 'select')[1];
  assert.doesNotMatch(select, /document_number|email|phone/);
});

test('incidentes: estado de cada expediente y sanciones vigentes, cumplidas o anuladas', async () => {
  fake.alResponderTabla('disciplinary_cases', { data: [
    { id: 'c1', case_number: 'EXP-2026-001', title: 'Agresión verbal', status: 'CON_SANCION', occurred_at: '2026-04-02T20:00:00Z', created_at: '2026-04-03T10:00:00Z',
      tipo: { value: 'Conducta antideportiva' }, partido: { match_number: 7, local: { name: 'Heredia VC' }, visita: { name: 'Cartago VC' } },
      case_parties: [{ party_type: 'PERSONA', role_in_case: 'DENUNCIADO', persona: { first_name: 'Karla', last_name: 'Brown' } }, { party_type: 'PERSONA', role_in_case: 'TESTIGO', persona: { first_name: 'Testigo', last_name: 'X' } }],
      sanctions: [{ sanction_type: 'SUSPENSION_PARTIDOS', quantity: 2, start_date: '2026-04-05', end_date: '2099-01-01', status: 'VIGENTE', persona: { first_name: 'Karla', last_name: 'Brown' } }] },
    { id: 'c2', case_number: 'EXP-2026-002', title: 'Retraso', status: 'CON_SANCION', occurred_at: null, created_at: '2026-04-10T10:00:00Z', tipo: null, partido: null,
      case_parties: [{ party_type: 'EQUIPO', role_in_case: 'DENUNCIADO', equipo: { name: 'Cartago VC', short_name: 'Cartago' } }],
      sanctions: [{ sanction_type: 'MULTA', quantity: 50000, start_date: '2026-04-11', end_date: '2026-04-12', status: 'VIGENTE', equipo: { name: 'Cartago VC', short_name: 'Cartago' } },
        { sanction_type: 'AMONESTACION', quantity: null, start_date: '2026-04-11', end_date: null, status: 'ANULADA', equipo: { name: 'Cartago VC', short_name: 'Cartago' } }] },
    { id: 'c3', case_number: 'EXP-2026-003', title: 'Sin mérito', status: 'ARCHIVADO', occurred_at: null, created_at: '2026-05-01T10:00:00Z', case_parties: [], sanctions: [] }
  ], error: null });

  const r = await call(`/api/reports/incidents/${COMP}`, PERSONAL);
  assert.equal(r.status, 200);
  const { expedientes, resumen } = r.json.data;
  assert.equal(expedientes[0].estado, 'CON_SANCION');
  assert.deepEqual(expedientes[0].involucrados, ['Karla Brown']);
  assert.equal(expedientes[0].partido, '#7 Heredia VC vs Cartago VC');
  assert.equal(expedientes[0].sanciones[0].sancion, 'Suspensión de 2 partidos');
  assert.equal(expedientes[1].estado, 'RESUELTO');
  assert.deepEqual(expedientes[1].sanciones.map((s) => s.estado), ['CUMPLIDA', 'ANULADA']);
  assert.deepEqual(resumen, { total: 3, abiertos: 0, en_seguimiento: 0, con_sancion: 1, resueltos: 1, archivados: 1, sanciones_vigentes: 1 });
});
