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
