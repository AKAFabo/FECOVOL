// Pruebas de la API pública del portal (/api/public). No necesitan conexión: usan el cliente falso.
// Ejecutar con: npm test
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const rateLimit = require('../src/middleware/rateLimit');
const { armarPosiciones, aPartido } = require('../src/public/competitionsDto');

const COMP = '22222222-2222-4222-8222-222222222222';
const EQ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EQ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EQ_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => fake.reset());

async function get(ruta, opciones = {}) {
  const res = await fetch(base + ruta, opciones);
  return { status: res.status, headers: res.headers, json: await res.json() };
}

const pasos = (tabla) => fake.llamadas.find((l) => l.tabla === tabla)?.pasos || [];
const paso = (tabla, metodo) => pasos(tabla).find((p) => p[0] === metodo);

const filaCompetencia = {
  id: COMP,
  name: 'Liga Superior Femenina 2026',
  season: '2026',
  status: 'EN_CURSO',
  start_date: '2026-01-15',
  end_date: '2026-11-30',
  points_win_3_0: 3,
  creada_por: 'admin@fecovol.cr',
  categoria: { code: 'MAYOR', value: 'Mayor' },
  rama: { code: 'FEM', value: 'Femenina' },
  modalidad: { code: 'SALA', value: 'Sala' }
};

test('el listado solo pide estados públicos y devuelve únicamente los campos de la lista blanca', async () => {
  fake.alResponderTabla('competitions', { data: [filaCompetencia], error: null });

  const r = await get('/api/public/competitions');

  assert.equal(r.status, 200);
  assert.deepEqual(paso('competitions', 'in'), ['in', 'status', ['INSCRIPCIONES', 'EN_CURSO', 'FINALIZADA', 'CERRADA']]);
  assert.deepEqual(r.json.data[0], {
    id: COMP,
    name: 'Liga Superior Femenina 2026',
    season: '2026',
    status: 'EN_CURSO',
    start_date: '2026-01-15',
    end_date: '2026-11-30',
    category: 'Mayor',
    branch: 'Femenina',
    modality: 'Sala'
  });
  assert.match(r.headers.get('cache-control'), /max-age=60/);
});

test('pedir competencias en planificación (borradores) da 400 sin consultar la base', async () => {
  const r = await get('/api/public/competitions?status=PLANIFICACION');
  assert.equal(r.status, 400);
  assert.equal(fake.llamadas.length, 0);
});

test('una temporada que no es un año da 400 sin consultar la base', async () => {
  for (const q of ['season=2026)', 'season=20', 'season[]=2026', 'status=EN_CURSO&status=FINALIZADA']) {
    const r = await get(`/api/public/competitions?${q}`);
    assert.equal(r.status, 400, q);
  }
  assert.equal(fake.llamadas.length, 0);
});

test('filtrar por estado y temporada válidos pasa los filtros a la consulta', async () => {
  fake.alResponderTabla('competitions', { data: [], error: null });
  const r = await get('/api/public/competitions?status=FINALIZADA&season=2025');
  assert.equal(r.status, 200);
  assert.deepEqual(paso('competitions', 'in'), ['in', 'status', ['FINALIZADA']]);
  assert.deepEqual(paso('competitions', 'eq'), ['eq', 'season', '2025']);
});

test('un id que no es UUID da 400 sin consultar la base', async () => {
  const r = await get('/api/public/competitions/1%20or%201=1');
  assert.equal(r.status, 400);
  assert.equal(fake.llamadas.length, 0);
});

test('una competencia inexistente o en borrador da el mismo 404', async () => {
  fake.alResponderTabla('competitions', { data: null, error: null });
  const r = await get(`/api/public/competitions/${COMP}`);
  assert.equal(r.status, 404);
  assert.deepEqual(paso('competitions', 'in'), ['in', 'status', ['INSCRIPCIONES', 'EN_CURSO', 'FINALIZADA', 'CERRADA']]);
});

test('un error de la base devuelve 503 con un mensaje genérico y sin caché', async () => {
  fake.alResponderTabla('competitions', {
    data: null,
    error: { code: '42P01', message: 'relation "public.competitions" does not exist', details: 'secreto' }
  });
  const r = await get('/api/public/competitions');
  assert.equal(r.status, 503);
  assert.doesNotMatch(JSON.stringify(r.json), /relation|secreto|competitions/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('las posiciones incluyen a los equipos inscritos que aún no juegan y quedan ordenadas', async () => {
  fake.alResponderTabla('competitions', { data: filaCompetencia, error: null });
  fake.alResponderTabla('competition_teams', {
    data: [
      { equipo: { id: EQ_A, name: 'AD Turrialba', short_name: 'TUR' } },
      { equipo: { id: EQ_B, name: 'CD Sarchí', short_name: 'SAR' } },
      { equipo: { id: EQ_C, name: 'UCR Voleibol', short_name: 'UCR' } }
    ],
    error: null
  });
  fake.alResponderTabla('v_standings', {
    data: [
      { team_id: EQ_A, matches_played: 2, matches_won: 1, matches_lost: 1, sets_won: 4, sets_lost: 3, total_points: 3 },
      { team_id: EQ_B, matches_played: 2, matches_won: 2, matches_lost: 0, sets_won: 6, sets_lost: 1, total_points: 6 }
    ],
    error: null
  });

  const r = await get(`/api/public/competitions/${COMP}/standings`);

  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.map((f) => [f.position, f.team.name, f.points]), [
    [1, 'CD Sarchí', 6],
    [2, 'AD Turrialba', 3],
    [3, 'UCR Voleibol', 0]
  ]);
  assert.deepEqual(paso('competition_teams', 'eq'), ['eq', 'competition_id', COMP]);
});

test('los partidos traen sets solo si terminaron', async () => {
  const M1 = '33333333-3333-4333-8333-333333333333';
  const M2 = '44444444-4444-4444-8444-444444444444';
  fake.alResponderTabla('competitions', { data: filaCompetencia, error: null });
  fake.alResponderTabla('matches', {
    data: [
      {
        id: M1, match_number: 1, matchday: 1, venue: 'Gimnasio Nacional', scheduled_date: '2026-09-12',
        scheduled_time: '19:00:00', status: 'FINALIZADO', home_sets_won: 3, away_sets_won: 1,
        local: { id: EQ_B, name: 'CD Sarchí', short_name: 'SAR' },
        visitante: { id: EQ_A, name: 'AD Turrialba', short_name: 'TUR' }
      },
      {
        id: M2, match_number: 2, matchday: 2, venue: null, scheduled_date: '2026-09-19',
        scheduled_time: '20:00:00', status: 'PROGRAMADO', home_sets_won: 0, away_sets_won: 0,
        local: { id: EQ_A, name: 'AD Turrialba', short_name: 'TUR' },
        visitante: { id: EQ_C, name: 'UCR Voleibol', short_name: 'UCR' }
      }
    ],
    error: null
  });
  fake.alResponderTabla('match_sets', {
    data: [
      { match_id: M1, set_number: 2, home_points: 23, away_points: 25 },
      { match_id: M1, set_number: 1, home_points: 25, away_points: 20 }
    ],
    error: null
  });

  const r = await get(`/api/public/competitions/${COMP}/matches`);

  assert.equal(r.status, 200);
  const [terminado, programado] = r.json.data;
  assert.equal(terminado.time, '19:00');
  assert.deepEqual(terminado.sets, [{ number: 1, home: 25, away: 20 }, { number: 2, home: 23, away: 25 }]);
  assert.equal(programado.home_sets, null);
  assert.deepEqual(programado.sets, []);
  assert.deepEqual(paso('match_sets', 'in'), ['in', 'match_id', [M1]]);
});

test('la API pública no acepta métodos de escritura', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const r = await get('/api/public/competitions', { method });
    assert.equal(r.status, 404, method);
  }
  assert.equal(fake.llamadas.length, 0);
});

test('el límite de solicitudes responde 429 con Retry-After al pasarse', async () => {
  const mini = express();
  mini.use(rateLimit({ ventanaMs: 60_000, maximo: 2 }));
  mini.get('/', (req, res) => res.json({ ok: true }));
  const s = mini.listen(0);
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/`;
  try {
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const tercero = await fetch(url);
    assert.equal(tercero.status, 429);
    assert.ok(Number(tercero.headers.get('retry-after')) > 0);
  } finally {
    s.close();
  }
});

test('armarPosiciones ignora equipos que ya no están inscritos', () => {
  const filas = armarPosiciones(
    [{ equipo: { id: EQ_A, name: 'A' } }],
    [{ team_id: EQ_B, total_points: 9 }, { team_id: EQ_A, total_points: 1 }]
  );
  assert.equal(filas.length, 1);
  assert.equal(filas[0].team.id, EQ_A);
});

test('aPartido no publica el marcador de un partido que no ha terminado', () => {
  const p = aPartido({ id: 'x', status: 'EN_CURSO', home_sets_won: 2, away_sets_won: 1 }, [
    { set_number: 1, home_points: 25, away_points: 10 }
  ]);
  assert.equal(p.home_sets, null);
  assert.deepEqual(p.sets, []);
});
