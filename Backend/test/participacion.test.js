// Pruebas de RF-ASO-007 (participación en competencias) y RF-ASO-008 (reportes de la asociación).
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

const OTRA_ASO = '44444444-4444-4444-8444-444444444444';
const EQUIPO = '55555555-5555-4555-8555-555555555555';
const OTRO_EQUIPO = '66666666-6666-4666-8666-666666666666';
const RIVAL = '77777777-7777-4777-8777-777777777777';
const COMP = '88888888-8888-4888-8888-888888888888';

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

async function call(method, ruta, body, quien = REPRE) {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...encabezadosDe(quien) },
    body: body ? JSON.stringify(body) : undefined
  });
  const tipo = res.headers.get('content-type') || '';
  return { status: res.status, tipo, json: tipo.includes('json') ? await res.json() : null, bytes: tipo.includes('json') ? null : Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

const denegaciones = () => fake.llamadas.filter((l) => l.tabla === 'audit_logs' && l.pasos.some((p) => p[0] === 'insert' && p[1][0].accion === 'ACCESO_DENEGADO'));
const exportaciones = () => fake.llamadas.filter((l) => l.tabla === 'audit_logs' && l.pasos.some((p) => p[0] === 'insert' && p[1][0].accion === 'EXPORTACION'));
const pasosDe = (tabla) => fake.llamadas.filter((l) => l.tabla === tabla).flatMap((l) => l.pasos);

const equipo = (id, nombre, aso = ASO_PROPIA) => ({ id, name: nombre, short_name: nombre, association_id: aso, status: 'ACTIVO' });
const competencia = (status = 'EN_CURSO') => ({ id: COMP, name: 'Liga Superior', season: '2026', status, categoria: { value: 'Mayor' }, rama: { value: 'Femenina' }, modalidad: { value: 'Sala' } });

/* ─── Alcance ───────────────────────────────────────────────────────────────────────────────── */

test('la participación exige sesión y es solo de representantes y FECOVOL', async () => {
  assert.equal((await call('GET', '/api/participacion', null, null)).status, 401);
  assert.equal((await call('GET', '/api/participacion', null, ARBITRO)).status, 403);
  assert.equal(denegaciones().length, 1);
});

test('un representante no consulta otra asociación aunque la pida', async () => {
  const r = await call('GET', `/api/participacion?association_id=${OTRA_ASO}`);
  assert.equal(r.status, 403);
  assert.equal(denegaciones().length, 1);
  assert.equal(pasosDe('teams').length, 0);
});

test('FECOVOL tiene que indicar la asociación', async () => {
  assert.equal((await call('GET', '/api/participacion', null, ADMIN)).status, 400);
});

test('el representante consulta con su propia asociación', async () => {
  fake.alResponderTabla('teams', { data: [], error: null });
  const r = await call('GET', '/api/participacion');
  assert.equal(r.status, 200);
  assert.ok(pasosDe('teams').some((p) => p[0] === 'eq' && p[1] === 'association_id' && p[2] === ASO_PROPIA));
});

/* ─── Inscripciones ─────────────────────────────────────────────────────────────────────────── */

test('la lista trae posición y próximo partido, y oculta competencias en planificación', async () => {
  fake.alResponderTabla('teams', { data: [equipo(EQUIPO, 'AD Grecia F')], error: null });
  fake.alResponderTabla('competition_teams',
    {
      data: [
        { id: 'i1', team_id: EQUIPO, status: 'INSCRITO', created_at: '2026-01-10T00:00:00Z', competencia: competencia() },
        { id: 'i2', team_id: EQUIPO, status: 'PENDIENTE', created_at: '2026-01-11T00:00:00Z', competencia: { ...competencia('PLANIFICACION'), id: 'otra' } }
      ],
      error: null
    },
    { data: [{ competition_id: COMP, equipo: { id: EQUIPO, name: 'AD Grecia F' } }, { competition_id: COMP, equipo: { id: RIVAL, name: 'Rival' } }], error: null }
  );
  fake.alResponderTabla('v_standings', { data: [{ competition_id: COMP, team_id: RIVAL, matches_played: 1, matches_won: 1, total_points: 3 }], error: null });
  fake.alResponderTabla('matches', { data: [{ id: 'm1', competition_id: COMP, scheduled_date: '2099-01-01', scheduled_time: '19:00:00', home_team_id: RIVAL, away_team_id: EQUIPO, local: { id: RIVAL, name: 'Rival' }, visitante: { id: EQUIPO, name: 'AD Grecia F' } }], error: null });

  const r = await call('GET', '/api/participacion');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.length, 1);
  const [i] = r.json.data;
  assert.deepEqual(i.standing, { position: 2, teams: 2, points: 0, played: 0, won: 0, lost: 0 });
  assert.equal(i.next_match.condition, 'VISITA');
  assert.equal(i.next_match.rival.id, RIVAL);
  assert.equal(i.next_match.time, '19:00');
});

/* ─── Detalle de equipo en competencia ──────────────────────────────────────────────────────── */

test('el detalle de un equipo de otra asociación se deniega', async () => {
  fake.alResponderTabla('teams', { data: equipo(OTRO_EQUIPO, 'Ajeno', OTRA_ASO), error: null });
  const r = await call('GET', `/api/participacion/competencias/${COMP}/equipos/${OTRO_EQUIPO}`);
  assert.equal(r.status, 403);
  assert.equal(denegaciones().length, 1);
  assert.equal(pasosDe('matches').length, 0);
});

test('un equipo que no participa en la competencia da 404', async () => {
  fake.alResponderTabla('teams', { data: equipo(EQUIPO, 'AD Grecia F'), error: null });
  fake.alResponderTabla('competition_teams', { data: null, error: null });
  fake.alResponderTabla('competitions', { data: competencia(), error: null });
  const r = await call('GET', `/api/participacion/competencias/${COMP}/equipos/${EQUIPO}`);
  assert.equal(r.status, 404);
});

test('no se muestran marcadores pendientes de validación; los validados se ven desde el equipo propio', async () => {
  fake.alResponderTabla('teams', { data: equipo(EQUIPO, 'AD Grecia F'), error: null });
  fake.alResponderTabla('competition_teams',
    { data: { id: 'i1', status: 'INSCRITO', created_at: '2026-01-10T00:00:00Z' }, error: null },
    { data: [], error: null }
  );
  fake.alResponderTabla('competitions', { data: competencia(), error: null });
  const local = { id: RIVAL, name: 'Rival' };
  const propio = { id: EQUIPO, name: 'AD Grecia F' };
  fake.alResponderTabla('matches', {
    data: [
      { id: 'p1', status: 'FINALIZADO', acta_status: 'VALIDADA', home_team_id: RIVAL, away_team_id: EQUIPO, home_sets_won: 1, away_sets_won: 3, local, visitante: propio, scheduled_date: '2026-09-01', updated_at: '2026-09-02T00:00:00Z' },
      { id: 'p2', status: 'FINALIZADO', acta_status: 'BORRADOR', home_team_id: EQUIPO, away_team_id: RIVAL, home_sets_won: 3, away_sets_won: 0, local: propio, visitante: local, scheduled_date: '2026-09-08' }
    ],
    error: null
  });
  fake.alResponderTabla('competition_rosters', { data: [{ jersey_number: 7, roster_role: 'JUGADOR', is_habilitated: true, persona: { first_name: 'Ana', last_name: 'Mora' } }], error: null });
  fake.alResponderTabla('match_sets', { data: [{ match_id: 'p1', set_number: 1, home_points: 25, away_points: 20 }], error: null });

  const r = await call('GET', `/api/participacion/competencias/${COMP}/equipos/${EQUIPO}`);
  assert.equal(r.status, 200);
  const [validado, pendiente] = r.json.data.matches;
  assert.equal(validado.condition, 'VISITA');
  assert.deepEqual({ own: validado.result.own_sets, rival: validado.result.rival_sets }, { own: 3, rival: 1 });
  assert.deepEqual(validado.result.sets[0], { number: 1, own: 20, rival: 25 });
  assert.equal(pendiente.result, null);
  assert.equal(pendiente.pending_validation, true);
  assert.equal(r.json.data.roster[0].name, 'Ana Mora');
  assert.equal('document_number' in r.json.data.roster[0], false);
  assert.equal(r.json.data.actualizado, '2026-09-02T00:00:00Z');
  // Los sets solo se piden para los partidos validados.
  assert.ok(pasosDe('match_sets').some((p) => p[0] === 'in' && p[2].length === 1 && p[2][0] === 'p1'));
});

test('el calendario no acepta equipos de otra asociación', async () => {
  fake.alResponderTabla('teams', { data: [equipo(EQUIPO, 'AD Grecia F')], error: null });
  const r = await call('GET', `/api/participacion/partidos?team_id=${OTRO_EQUIPO}`);
  assert.equal(r.status, 403);
  assert.equal(pasosDe('matches').length, 0);
});

test('el calendario valida el rango de fechas', async () => {
  assert.equal((await call('GET', '/api/participacion/partidos?desde=2026-12-01&hasta=2026-11-01')).status, 400);
  assert.equal((await call('GET', '/api/participacion/partidos?desde=hoy')).status, 400);
});

/* ─── Reportes ──────────────────────────────────────────────────────────────────────────────── */

const MIEMBROS = [
  { team_id: EQUIPO, member_type: 'TECNICO', technical_role: 'Entrenador', persona: { first_name: 'Luis', last_name: 'Vega', document_number: '1-1111-1111', is_verified: true, status: 'ACTIVA' } },
  { team_id: EQUIPO, member_type: 'JUGADOR', jersey_number: 9, posicion: { value: 'Central' }, persona: { first_name: '=HYPERLINK("x")', last_name: 'Mora', document_number: '2-2222-2222', is_verified: false, status: 'ACTIVA' } }
];

function prepararReporte(miembros = MIEMBROS) {
  fake.alResponderTabla('associations', { data: { id: ASO_PROPIA, name: 'AD Grecia' }, error: null });
  fake.alResponderTabla('teams', { data: [equipo(EQUIPO, 'AD Grecia F')], error: null });
  fake.alResponderTabla('team_members', { data: miembros, error: null });
}

test('el reporte trae la fecha de generación, el aviso de nómina no oficial y ningún dato de contacto', async () => {
  prepararReporte();
  const r = await call('GET', '/api/reportes-asociacion?tipo=EQUIPOS');
  assert.equal(r.status, 200);
  assert.match(r.json.data.report.notice, /No constituye la nómina oficial/);
  assert.ok(r.json.data.report.generated_at);
  const [jugador, tecnico] = r.json.data.teams[0].members;
  assert.equal(jugador.type, 'JUGADOR');
  assert.equal(tecnico.position_or_role, 'Entrenador');
  const seleccion = pasosDe('team_members').find((p) => p[0] === 'select')[1];
  for (const campo of ['phone', 'email', 'birth_date', 'emergency_contact']) assert.equal(seleccion.includes(campo), false, campo);
});

test('el reporte de un equipo de otra asociación se deniega', async () => {
  prepararReporte();
  const r = await call('GET', `/api/reportes-asociacion?tipo=EQUIPO&team_id=${OTRO_EQUIPO}`);
  assert.equal(r.status, 403);
  assert.equal(denegaciones().length, 1);
});

test('exportar a Excel entrega el archivo y queda en la bitácora', async () => {
  prepararReporte();
  const r = await call('POST', '/api/reportes-asociacion/exportacion', { tipo: 'EQUIPOS', formato: 'XLSX' });
  assert.equal(r.status, 200);
  assert.match(r.tipo, /spreadsheetml/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="reporte-equipos-\d{4}-\d{2}-\d{2}\.xlsx"/);
  assert.equal(r.bytes.subarray(0, 2).toString(), 'PK');
  // El texto que parece fórmula se guarda como texto, nunca como fórmula.
  assert.equal(r.bytes.includes(Buffer.from('<f>')), false);
  const [registro] = exportaciones();
  const fila = registro.pasos.find((p) => p[0] === 'insert')[1][0];
  assert.equal(fila.usuario, REPRE.email);
  assert.equal(fila.registro_nuevo.filas, 2);
});

test('sin integrantes no se genera el archivo ni se registra exportación', async () => {
  prepararReporte([]);
  const r = await call('POST', '/api/reportes-asociacion/exportacion', { tipo: 'EQUIPOS', formato: 'XLSX' });
  assert.equal(r.status, 404);
  assert.equal(exportaciones().length, 0);
});

test('la impresión también queda registrada y los formatos desconocidos se rechazan', async () => {
  assert.equal((await call('POST', '/api/reportes-asociacion/exportacion', { tipo: 'EQUIPOS', formato: 'CSV' })).status, 400);
  prepararReporte();
  const r = await call('POST', '/api/reportes-asociacion/exportacion', { tipo: 'EQUIPOS', formato: 'IMPRESION' });
  assert.equal(r.status, 201);
  assert.equal(exportaciones().length, 1);
});
