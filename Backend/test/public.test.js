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
    modality: 'Sala',
    team_count: 0,
    matchdays_total: 0,
    matchday_current: 0,
    matches_total: 0,
    matches_played: 0,
    leader: null
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
        id: M1, match_number: 1, matchday: 1, sede: { value: 'Gimnasio Nacional' }, scheduled_date: '2026-09-12',
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

/* ------------------------------------------------------------------------------------------------
   Asociaciones
   ------------------------------------------------------------------------------------------------ */
const { sitioWeb } = require('../src/public/associationsDto');
const ASO = '55555555-5555-4555-8555-555555555555';

const filaAsociacion = {
  id: ASO,
  name: 'Asociación Deportiva de Cartago',
  short_name: 'AD Cartago',
  province: 'Cartago',
  canton: 'Central',
  home_venue: 'Gimnasio Municipal de Cartago',
  website: 'adcartago.cr',
  affiliation_date: '2019-03-01',
  // Campos que la base podría devolver y que nunca deben salir:
  tax_id: '3-002-123456',
  email: 'presidencia@adcartago.cr',
  phone: '2551-0000',
  address: '200 m norte de la basílica'
};

test('el listado de asociaciones solo pide afiliadas y cuenta los equipos activos', async () => {
  fake.alResponderTabla('associations', { data: [filaAsociacion], error: null });
  fake.alResponderTabla('teams', { data: [{ association_id: ASO }, { association_id: ASO }], error: null });

  const r = await get('/api/public/associations');

  assert.equal(r.status, 200);
  assert.deepEqual(paso('associations', 'eq'), ['eq', 'status', 'AFILIADA']);
  assert.doesNotMatch(paso('associations', 'select')[1], /tax_id|email|phone|address|\*/);
  assert.deepEqual(r.json.data, [{
    id: ASO,
    name: 'Asociación Deportiva de Cartago',
    short_name: 'AD Cartago',
    province: 'Cartago',
    canton: 'Central',
    home_venue: 'Gimnasio Municipal de Cartago',
    team_count: 2
  }]);
  const pasosEquipos = pasos('teams');
  assert.deepEqual(pasosEquipos.find((p) => p[0] === 'in'), ['in', 'association_id', [ASO]]);
  assert.deepEqual(pasosEquipos.find((p) => p[0] === 'eq'), ['eq', 'status', 'ACTIVO']);
});

test('sin asociaciones afiliadas no se consulta la tabla de equipos', async () => {
  fake.alResponderTabla('associations', { data: [], error: null });
  const r = await get('/api/public/associations');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, []);
  assert.equal(pasos('teams').length, 0);
});

test('el detalle de una asociación no afiliada o inexistente da 404', async () => {
  fake.alResponderTabla('associations', { data: null, error: null });
  const r = await get(`/api/public/associations/${ASO}`);
  assert.equal(r.status, 404);
  assert.equal(pasos('teams').length, 0);
});

test('el detalle no publica contactos ni cédula, y oculta competencias en borrador', async () => {
  const EQ = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  fake.alResponderTabla('associations', { data: filaAsociacion, error: null });
  fake.alResponderTabla('teams', {
    data: [{
      id: EQ, name: 'AD Cartago Mayor F', short_name: 'CAR', home_venue: null,
      categoria: { value: 'Mayor' }, rama: { value: 'Femenina' }, modalidad: { value: 'Sala' },
      primary_color: '#123456'
    }],
    error: null
  });
  fake.alResponderTabla('competition_teams', {
    data: [
      { team_id: EQ, competencia: { id: COMP, name: 'Liga Superior Femenina 2026', status: 'EN_CURSO' } },
      { team_id: EQ, competencia: { id: 'x', name: 'Copa en preparación', status: 'PLANIFICACION' } }
    ],
    error: null
  });

  const r = await get(`/api/public/associations/${ASO}`);

  assert.equal(r.status, 200);
  const texto = JSON.stringify(r.json);
  assert.doesNotMatch(texto, /3-002|presidencia@|2551|basílica|#123456|preparación/);
  assert.equal(r.json.data.website, 'https://adcartago.cr/');
  assert.deepEqual(r.json.data.teams[0], {
    id: EQ,
    name: 'AD Cartago Mayor F',
    short_name: 'CAR',
    category: 'Mayor',
    branch: 'Femenina',
    modality: 'Sala',
    home_venue: null,
    competitions: [{ id: COMP, name: 'Liga Superior Femenina 2026', status: 'EN_CURSO' }]
  });
  assert.deepEqual(paso('competition_teams', 'in'), ['in', 'team_id', [EQ]]);
});

test('sitioWeb solo acepta direcciones http(s)', () => {
  assert.equal(sitioWeb('https://fecovol.cr'), 'https://fecovol.cr/');
  assert.equal(sitioWeb('www.club.cr'), 'https://www.club.cr/');
  assert.equal(sitioWeb('javascript:alert(1)'), null);
  assert.equal(sitioWeb('data:text/html,hola'), null);
  assert.equal(sitioWeb('   '), null);
  assert.equal(sitioWeb(null), null);
});

/* ------------------------------------------------------------------------------------------------
   Noticias
   ------------------------------------------------------------------------------------------------ */
const { limpiarHtml } = require('../src/public/htmlSeguro');
const NOT = '66666666-6666-4666-8666-666666666666';

const filaNoticia = {
  id: NOT,
  slug: 'sarchi-toma-la-punta',
  title: 'CD Sarchí toma la punta',
  summary: 'Resumen de la jornada.',
  cover_image_url: 'https://bwfvqtevenwgyfjcngae.supabase.co/storage/v1/object/public/noticias/portada.jpg',
  cover_image_alt: 'Jugadoras celebrando',
  is_featured: true,
  published_at: '2026-10-20T15:00:00+00:00',
  competencia: { id: COMP, name: 'Liga Superior Femenina 2026', status: 'EN_CURSO' },
  author_id: 'secreto-autor',
  updated_by: 'secreto-editor',
  content: '<p>Hola</p><script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">x</a>'
};

test('el listado de noticias solo pide publicadas, no borradas y con fecha ya cumplida', async () => {
  fake.alResponderTabla('news', { data: [filaNoticia], error: null, count: 13 });

  const r = await get('/api/public/news?page=2');

  assert.equal(r.status, 200);
  const p = pasos('news');
  assert.deepEqual(p.find((x) => x[0] === 'eq'), ['eq', 'status', 'PUBLICADA']);
  assert.deepEqual(p.find((x) => x[0] === 'is'), ['is', 'deleted_at', null]);
  assert.deepEqual(p.find((x) => x[0] === 'not'), ['not', 'published_at', 'is', null]);
  const lte = p.find((x) => x[0] === 'lte');
  assert.equal(lte[1], 'published_at');
  assert.ok(Math.abs(new Date(lte[2]) - Date.now()) < 5000);
  assert.deepEqual(p.find((x) => x[0] === 'range'), ['range', 12, 23]);
  assert.doesNotMatch(p.find((x) => x[0] === 'select')[1], /content|author|updated_by/);

  assert.deepEqual(r.json.data.items[0], {
    id: NOT,
    slug: 'sarchi-toma-la-punta',
    title: 'CD Sarchí toma la punta',
    summary: 'Resumen de la jornada.',
    cover: { url: filaNoticia.cover_image_url, alt: 'Jugadoras celebrando' },
    featured: true,
    published_at: '2026-10-20T15:00:00+00:00',
    competition: { id: COMP, name: 'Liga Superior Femenina 2026' }
  });
  assert.deepEqual([r.json.data.page, r.json.data.page_size, r.json.data.total], [2, 12, 13]);
});

test('una página inválida da 400 sin consultar la base', async () => {
  for (const q of ['page=0', 'page=-1', 'page=abc', 'page=1e3', 'page=9999', 'page[]=1']) {
    const r = await get(`/api/public/news?${q}`);
    assert.equal(r.status, 400, q);
  }
  assert.equal(fake.llamadas.length, 0);
});

test('el detalle devuelve el cuerpo sin scripts, eventos ni enlaces javascript', async () => {
  fake.alResponderTabla('news', { data: filaNoticia, error: null });

  const r = await get(`/api/public/news/${NOT}`);

  assert.equal(r.status, 200);
  const html = r.json.data.content_html;
  assert.equal(html.includes('<p>Hola</p>'), true);
  assert.doesNotMatch(html, /script|onerror|javascript:|alert/i);
  assert.doesNotMatch(JSON.stringify(r.json), /secreto/);
});

test('la portada usa la destacada aunque sea antigua y no la repite entre las recientes', async () => {
  const otra = (id, fecha) => ({ ...filaNoticia, id, is_featured: false, published_at: fecha });
  const A = '77777777-7777-4777-8777-777777777771';
  const B = '77777777-7777-4777-8777-777777777772';
  fake.alResponderTabla(
    'news',
    { data: [{ ...filaNoticia, published_at: '2026-01-05T15:00:00+00:00' }], error: null },
    { data: [otra(A, '2026-10-22T15:00:00+00:00'), { ...filaNoticia }, otra(B, '2026-10-19T15:00:00+00:00')], error: null }
  );

  const r = await get('/api/public/news/portada');

  assert.equal(r.status, 200);
  assert.equal(r.json.data.featured.id, NOT);
  assert.deepEqual(r.json.data.recent.map((n) => n.id), [A, B]);
  for (const consulta of fake.llamadas.filter((l) => l.tabla === 'news')) {
    assert.ok(consulta.pasos.some((x) => x[0] === 'eq' && x[1] === 'status' && x[2] === 'PUBLICADA'));
    assert.ok(consulta.pasos.some((x) => x[0] === 'lte' && x[1] === 'published_at'));
  }
  assert.doesNotMatch(JSON.stringify(r.json), /secreto/);
});

test('sin destacada, la portada usa la más reciente', async () => {
  const A = '77777777-7777-4777-8777-777777777771';
  fake.alResponderTabla(
    'news',
    { data: [], error: null },
    { data: [{ ...filaNoticia, id: A, is_featured: false }, { ...filaNoticia, is_featured: false }], error: null }
  );

  const r = await get('/api/public/news/portada');

  assert.equal(r.json.data.featured.id, A);
  assert.deepEqual(r.json.data.recent.map((n) => n.id), [NOT]);
});

test('una noticia en borrador, archivada, borrada o programada da 404', async () => {
  fake.alResponderTabla('news', { data: null, error: null });
  const r = await get(`/api/public/news/${NOT}`);
  assert.equal(r.status, 404);
});

test('una portada que no es https y una competencia en borrador no se publican', async () => {
  fake.alResponderTabla('news', {
    data: [{ ...filaNoticia, cover_image_url: 'javascript:alert(1)', competencia: { id: COMP, name: 'Borrador', status: 'PLANIFICACION' } }],
    error: null,
    count: 1
  });
  const r = await get('/api/public/news');
  assert.equal(r.json.data.items[0].cover, null);
  assert.equal(r.json.data.items[0].competition, null);
});

test('limpiarHtml conserva el formato permitido y elimina lo peligroso', () => {
  assert.equal(limpiarHtml('<h1>T</h1><div>d</div>'), '<h2>T</h2><p>d</p>');
  assert.equal(limpiarHtml('<p style="color:red" onclick="x()">a</p>'), '<p>a</p>');
  assert.equal(limpiarHtml('<iframe src="https://x"></iframe><svg><script>1</script></svg>'), '');
  assert.equal(limpiarHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), '');
  assert.equal(limpiarHtml('<img src="http://sin-cifrar.cr/a.png">'), '');
  assert.equal(limpiarHtml('<img src="https://fecovol.cr/a.png" alt="a">'), '<img src="https://fecovol.cr/a.png" alt="a" />');
  assert.equal(
    limpiarHtml('<a href="https://fecovol.cr" target="_self">ok</a>'),
    '<a href="https://fecovol.cr" target="_blank" rel="noopener noreferrer nofollow">ok</a>'
  );
  assert.doesNotMatch(limpiarHtml('<a href="jav&#x09;ascript:alert(1)">t</a>'), /href/);
  assert.equal(limpiarHtml(null), '');
});

/* ------------------------------------------------------------------------------------------------
   Competencias: avance, equipos, página de equipo y estadísticas
   ------------------------------------------------------------------------------------------------ */
const { armarEstadisticas, armarNomina, resumirAvance } = require('../src/public/competitionsDto');
const { todasLasFilas } = require('../src/public/paginar');

const partidoFinal = (id, jornada, local, visita, sets, fecha = '2026-09-12') => ({
  id,
  number: Number(id.slice(-1)) || 1,
  matchday: jornada,
  date: fecha,
  time: '19:00',
  venue: null,
  status: 'FINALIZADO',
  home: { id: local },
  away: { id: visita },
  home_sets: sets.filter(([a, b]) => a > b).length,
  away_sets: sets.filter(([a, b]) => b > a).length,
  sets: sets.map(([home, away], i) => ({ number: i + 1, home, away }))
});

test('el listado agrega equipos, jornada actual y primer lugar de cada competencia', async () => {
  fake.alResponderTabla('competitions', { data: [filaCompetencia], error: null });
  fake.alResponderTabla('competition_teams', {
    data: [
      { competition_id: COMP, equipo: { id: EQ_A, name: 'AD Turrialba' } },
      { competition_id: COMP, equipo: { id: EQ_B, name: 'CD Sarchí' } }
    ],
    error: null
  });
  fake.alResponderTabla('matches', {
    data: [
      { competition_id: COMP, matchday: 1, status: 'FINALIZADO' },
      { competition_id: COMP, matchday: 2, status: 'FINALIZADO' },
      { competition_id: COMP, matchday: 3, status: 'PROGRAMADO' },
      { competition_id: COMP, matchday: 9, status: 'CANCELADO' }
    ],
    error: null
  });
  fake.alResponderTabla('v_standings', {
    data: [{ competition_id: COMP, team_id: EQ_B, matches_played: 2, total_points: 6, sets_won: 6 }],
    error: null
  });

  const r = await get('/api/public/competitions');
  const c = r.json.data[0];
  assert.equal(c.team_count, 2);
  assert.equal(c.matchday_current, 2);
  assert.equal(c.matchdays_total, 3);
  assert.equal(c.matches_total, 3);
  assert.equal(c.matches_played, 2);
  assert.equal(c.leader.name, 'CD Sarchí');
  // Las tres consultas de apoyo piden todas las competencias juntas, no una por una.
  assert.deepEqual(paso('matches', 'in'), ['in', 'competition_id', [COMP]]);
});

test('resumirAvance no nombra primer lugar si nadie ha jugado', () => {
  const r = resumirAvance({ partidos: [], equipos: 4, posiciones: [{ position: 1, played: 0, team: { id: EQ_A } }] });
  assert.equal(r.leader, null);
  assert.equal(r.team_count, 4);
});

test('todasLasFilas pide por bloques hasta recibir uno incompleto', async () => {
  const rangos = [];
  const respuestas = [Array(1000).fill({}), Array(3).fill({})];
  const filas = await todasLasFilas(() => ({
    range(desde, hasta) {
      rangos.push([desde, hasta]);
      return Promise.resolve({ data: respuestas.shift(), error: null });
    }
  }));
  assert.equal(filas.length, 1003);
  assert.deepEqual(rangos, [[0, 999], [1000, 1999]]);
});

test('los equipos inscritos no publican contactos y solo enlazan asociaciones afiliadas', async () => {
  fake.alResponderTabla('competitions', { data: filaCompetencia, error: null });
  fake.alResponderTabla('competition_teams', {
    data: [
      {
        equipo: {
          id: EQ_A, name: 'AD Turrialba', short_name: 'TUR', primary_color: 'red;background:url(//x)', home_venue: null,
          asociacion: { id: ASO, name: 'AD Turrialba', province: 'Cartago', home_venue: 'Gimnasio de Turrialba', status: 'PROVISIONAL', email: 'x@y.cr', phone: '1' }
        }
      },
      {
        equipo: {
          id: EQ_B, name: 'CD Sarchí', short_name: 'SAR', primary_color: '#0E3B6B', home_venue: 'Gimnasio de Sarchí',
          asociacion: { id: ASO, name: 'CD Sarchí', province: 'Alajuela', home_venue: null, status: 'AFILIADA', tax_id: '3-1' }
        }
      }
    ],
    error: null
  });
  fake.alResponderTabla('competition_rosters', { data: [{ team_id: EQ_B }, { team_id: EQ_B }], error: null });

  const r = await get(`/api/public/competitions/${COMP}/teams`);
  assert.equal(r.status, 200);
  const [turrialba, sarchi] = r.json.data;
  assert.deepEqual(turrialba, {
    id: EQ_A, name: 'AD Turrialba', short_name: 'TUR', color: null,
    association: { id: null, name: 'AD Turrialba' },
    province: 'Cartago', home_venue: 'Gimnasio de Turrialba', players: 0
  });
  assert.equal(sarchi.color, '#0e3b6b');
  assert.equal(sarchi.association.id, ASO);
  assert.equal(sarchi.players, 2);
  assert.doesNotMatch(JSON.stringify(r.json), /x@y\.cr|3-1/);
});

test('un equipo con id inválido da 400 y uno no inscrito da 404', async () => {
  let r = await get(`/api/public/competitions/${COMP}/teams/abc`);
  assert.equal(r.status, 400);
  assert.equal(fake.llamadas.length, 0);

  fake.alResponderTabla('competitions', { data: filaCompetencia, error: null });
  fake.alResponderTabla('competition_teams', { data: null, error: null });
  r = await get(`/api/public/competitions/${COMP}/teams/${EQ_C}`);
  assert.equal(r.status, 404);
  assert.deepEqual(paso('competition_teams', 'eq'), ['eq', 'competition_id', COMP]);
});

test('la página de equipo publica solo nombre, número y posición de los integrantes', async () => {
  const persona = (nombre, extra = {}) => ({
    first_name: nombre, last_name: 'Mora', status: 'ACTIVA',
    birth_date: '2009-05-01', document_number: '1-1111-1111', email: 'p@x.cr', phone: '8888', ...extra
  });
  fake.alResponderTabla('competitions', { data: filaCompetencia, error: null });
  fake.alResponderTabla(
    'competition_teams',
    { data: { equipo: { id: EQ_B, name: 'CD Sarchí', short_name: 'SAR', asociacion: null, categoria: { value: 'Mayor' } } }, error: null },
    { data: [{ equipo: { id: EQ_B, name: 'CD Sarchí' } }, { equipo: { id: EQ_A, name: 'AD Turrialba' } }], error: null }
  );
  fake.alResponderTabla('competition_rosters', {
    data: [
      { person_id: 'p1', jersey_number: 7, roster_role: 'JUGADOR', persona: persona('Ana') },
      { person_id: 'p2', jersey_number: 1, roster_role: 'JUGADOR', persona: persona('Eva') },
      { person_id: 'p3', jersey_number: 3, roster_role: 'JUGADOR', persona: persona('Inés', { status: 'INACTIVA' }) },
      { person_id: 'p4', jersey_number: null, roster_role: 'TECNICO', persona: persona('Luis') }
    ],
    error: null
  });
  fake.alResponderTabla('team_members', {
    data: [
      { person_id: 'p1', member_type: 'JUGADOR', persona: persona('Ana'), posicion: { value: 'Central' } },
      { person_id: 'p4', member_type: 'TECNICO', technical_role: 'Entrenador principal', persona: persona('Luis') }
    ],
    error: null
  });

  const r = await get(`/api/public/competitions/${COMP}/teams/${EQ_B}`);
  assert.equal(r.status, 200);
  const { roster, team, competition } = r.json.data;
  assert.equal(competition.name, 'Liga Superior Femenina 2026');
  assert.equal(team.category, 'Mayor');
  assert.equal(roster.source, 'competencia');
  assert.deepEqual(roster.players, [
    { number: 1, name: 'Eva Mora', position: null },
    { number: 7, name: 'Ana Mora', position: 'Central' }
  ]);
  assert.deepEqual(roster.staff, [{ name: 'Luis Mora', role: 'Entrenador principal' }]);
  const texto = JSON.stringify(r.json);
  for (const prohibido of ['2009', '1-1111-1111', 'p@x.cr', '8888', 'p1', 'Inés', 'habilit']) {
    assert.ok(!texto.includes(prohibido), prohibido);
  }
});

test('sin nómina de la competencia se muestran los integrantes activos del equipo', () => {
  const nomina = armarNomina([], [
    { person_id: 'a', member_type: 'JUGADOR', jersey_number: 0, persona: { first_name: 'Sol', last_name: 'Vega', status: 'ACTIVA' } },
    { person_id: 'b', member_type: 'TECNICO', persona: { first_name: 'Raúl', last_name: 'Solís', status: 'ACTIVA' } }
  ]);
  assert.equal(nomina.source, 'equipo');
  assert.deepEqual(nomina.players, [{ number: null, name: 'Sol Vega', position: null }]);
  assert.deepEqual(nomina.staff, [{ name: 'Raúl Solís', role: 'Cuerpo técnico' }]);
});

test('armarEstadisticas calcula sets, puntos, partidos a cinco sets y rachas', () => {
  const posiciones = [
    { position: 1, team: { id: EQ_A, name: 'A' } },
    { position: 2, team: { id: EQ_B, name: 'B' } }
  ];
  const partidos = [
    partidoFinal('m1', 1, EQ_A, EQ_B, [[25, 20], [25, 20], [25, 20]], '2026-09-01'),
    partidoFinal('m2', 2, EQ_B, EQ_A, [[25, 20], [20, 25], [25, 20], [20, 25], [15, 10]], '2026-09-08'),
    { id: 'm3', matchday: 3, status: 'PROGRAMADO', home: { id: EQ_A }, away: { id: EQ_B }, sets: [] },
    { id: 'm4', matchday: 3, status: 'CANCELADO', home: { id: EQ_A }, away: { id: EQ_B }, sets: [] }
  ];

  const { totals, teams } = armarEstadisticas(posiciones, partidos);
  assert.deepEqual(totals, {
    matches_played: 2, matches_total: 3, matchday_current: 2, sets_played: 8,
    sets_per_match: 4, five_set_matches: 1, points_per_set: 42.5
  });
  const [a, b] = teams;
  assert.equal(a.sets_won, 5);
  assert.equal(a.sets_lost, 3);
  assert.equal(a.sets_ratio, 1.67);
  assert.equal(a.points_for, 75 + 100);
  assert.equal(a.points_against, 60 + 105);
  assert.equal(a.five_set_matches, 1);
  assert.deepEqual(a.streak, { type: 'DERROTAS', count: 1 });
  assert.deepEqual(b.streak, { type: 'VICTORIAS', count: 1 });
});

test('un equipo sin sets perdidos tiene cociente nulo, no infinito', () => {
  const { teams } = armarEstadisticas(
    [{ position: 1, team: { id: EQ_A } }, { position: 2, team: { id: EQ_B } }],
    [partidoFinal('m1', 1, EQ_A, EQ_B, [[25, 1], [25, 1], [25, 1]])]
  );
  assert.equal(teams[0].sets_ratio, null);
  assert.equal(teams[1].sets_ratio, 0);
});

/* ------------------------------------------------------------------------------------------------
   La Federación
   ------------------------------------------------------------------------------------------------ */
test('las cifras de la Federación son solo conteos de registros vigentes', async () => {
  fake.alResponderTabla('associations', { data: null, error: null, count: 12 });
  fake.alResponderTabla('teams', { data: null, error: null, count: 96 });
  fake.alResponderTabla('persons', { data: null, error: null, count: 2340 });
  fake.alResponderTabla('person_roles', { data: null, error: null, count: null });

  const r = await get('/api/public/federation');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, { associations: 12, teams: 96, people: 2340, referees: 0 });
  assert.deepEqual(paso('associations', 'eq'), ['eq', 'status', 'AFILIADA']);
  assert.deepEqual(pasos('teams').filter((p) => p[0] === 'eq'), [
    ['eq', 'status', 'ACTIVO'],
    ['eq', 'asociacion.status', 'AFILIADA']
  ]);
  assert.deepEqual(paso('persons', 'select'), ['select', 'id', { count: 'exact', head: true }]);
});

test('un error al contar devuelve 503 genérico', async () => {
  fake.alResponderTabla('persons', { data: null, error: { message: 'permission denied for table persons' } });
  const r = await get('/api/public/federation');
  assert.equal(r.status, 503);
  assert.doesNotMatch(JSON.stringify(r.json), /permission|persons/);
});

test('el empate en puntos se resuelve por cociente de sets, como en el módulo de competencias', () => {
  const inscritos = [{ equipo: { id: EQ_A, name: 'A' } }, { equipo: { id: EQ_B, name: 'B' } }];
  const vista = [
    { team_id: EQ_A, matches_played: 2, matches_won: 1, matches_lost: 1, sets_won: 4, sets_lost: 3, total_points: 3, ratio_sets: 1.33, ratio_puntos: 1.1 },
    { team_id: EQ_B, matches_played: 2, matches_won: 1, matches_lost: 1, sets_won: 3, sets_lost: 1, total_points: 3, ratio_sets: 3, ratio_puntos: 1.2 }
  ];
  const tabla = armarPosiciones(inscritos, vista);
  assert.equal(tabla[0].team.id, EQ_B);
  assert.equal(tabla[0].ratio_sets, undefined, 'los cocientes no se publican');
});

test('un resultado especial se publica con su texto y uno suspendido no tiene marcador', () => {
  const base = { id: 'p', match_number: 1, matchday: 1, status: 'FINALIZADO', local: null, visitante: null };
  const noPresento = aPartido({ ...base, home_sets_won: 0, away_sets_won: 3, result_type: 'NO_PRESENTADO_LOCAL' });
  assert.equal(noPresento.special_result, 'No presentación del local');
  assert.equal(noPresento.away_sets, 3);
  const suspendido = aPartido({ ...base, home_sets_won: null, away_sets_won: null, result_type: 'SUSPENDIDO_DEFINITIVO' });
  assert.equal(suspendido.special_result, 'Suspendido definitivamente');
  assert.equal(suspendido.home_sets, null);
  const normal = aPartido({ ...base, home_sets_won: 3, away_sets_won: 1, result_type: 'NORMAL', sede: { value: 'Gimnasio Nacional' } });
  assert.equal(normal.special_result, null);
  assert.equal(normal.venue, 'Gimnasio Nacional', 'la sede sale del catálogo');
});
