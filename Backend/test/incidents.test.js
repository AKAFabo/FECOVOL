// Pruebas de Incidentes y sanciones (/api/incidents) y de las reglas de rango de sanción.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');
const { ADMIN: USUARIO_ADMIN, registrarUsuarios } = require('./usuarios');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const reglas = require('../src/utils/sanciones');

const CASO = '11111111-1111-4111-8111-111111111111';
const PARTE = '33333333-3333-4333-8333-333333333333';
const FALTA = '44444444-4444-4444-8444-444444444444';
const EQUIPO = '55555555-5555-4555-8555-555555555555';
const ADMIN = USUARIO_ADMIN.id;

// F-12 del reglamento: conducta antideportiva grave, de 1 a 3 partidos.
const F12 = {
  id: FALTA, code: 'F-12', name: 'Conducta antideportiva grave', applies_to: 'PERSONA', severity: 'GRAVE',
  min_sanction: 'SUSPENSION_PARTIDOS', min_quantity: 1, max_sanction: 'SUSPENSION_PARTIDOS', max_quantity: 3,
  recidivism: 'Duplica', is_active: true
};
const PARTE_PERSONA = {
  id: PARTE, party_type: 'PERSONA', role_in_case: 'DENUNCIADO', participation: 'Entrenador principal',
  person_id: '66666666-6666-4666-8666-666666666666', team_id: EQUIPO,
  persona: { first_name: 'Kevin', last_name: 'Brown Soto' }, equipo: { id: EQUIPO, name: 'Limón VC', short_name: 'Limón' }
};

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
  // El perfil del administrador lleva su nombre: la cronología lo usa como autor de cada movimiento.
  const { token, ...perfil } = USUARIO_ADMIN;
  fake.conSesion(token, { ...perfil, full_name: 'Gabriela Rojas' });
});

async function call(method, ruta, body, token = USUARIO_ADMIN.token) {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const pasosDe = (tabla, metodo) =>
  fake.llamadas.filter((l) => l.tabla === tabla).flatMap((l) => l.pasos.filter((p) => p[0] === metodo));
const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');

// ---------- reglas de rango ----------

test('reglas: una suspension dentro del rango de la falta es valida y fuera de el no', () => {
  assert.equal(reglas.validarSancion(F12, 'PERSONA', 'SUSPENSION_PARTIDOS', 2), null);
  assert.match(reglas.validarSancion(F12, 'PERSONA', 'SUSPENSION_PARTIDOS', 4), /fuera del rango/);
  assert.match(reglas.validarSancion(F12, 'PERSONA', 'AMONESTACION', null), /fuera del rango/);
  assert.match(reglas.validarSancion(F12, 'EQUIPO', 'SUSPENSION_PARTIDOS', 2), /aplica a persona/);
});

test('reglas: un rango de amonestacion a multa permite multas solo hasta el tope', () => {
  const f01 = { ...F12, code: 'F-01', applies_to: 'EQUIPO', min_sanction: 'AMONESTACION', min_quantity: null, max_sanction: 'MULTA', max_quantity: 50000 };
  assert.deepEqual(reglas.opcionesDeFalta(f01).map((o) => o.tipo), ['AMONESTACION', 'MULTA']);
  assert.equal(reglas.validarSancion(f01, 'EQUIPO', 'MULTA', 30000), null);
  assert.match(reglas.validarSancion(f01, 'EQUIPO', 'MULTA', 60000), /fuera del rango/);
  assert.equal(reglas.textoRango(f01), 'Amonestación a multa ₡50 000');
  assert.equal(reglas.textoRango(F12), '1 a 3 partidos');
});

test('reglas: un rango con la minima mas grave que la maxima no es valido', () => {
  const problema = reglas.validarRango({ aplica: 'PERSONA', minTipo: 'EXPULSION', minCantidad: null, maxTipo: 'AMONESTACION', maxCantidad: null });
  assert.match(problema, /mínima no puede ser más grave/);
  assert.match(reglas.validarRango({ aplica: 'SEDE', minTipo: 'AMONESTACION', maxTipo: 'EXPULSION' }), /no aplica a sede/);
});

// ---------- rutas ----------

test('sin token responde 401', async () => {
  const r = await call('GET', '/api/incidents', null, null);
  assert.equal(r.status, 401);
  assert.equal(fake.llamadas.filter((l) => l.tabla === 'disciplinary_cases').length, 0);
});

test('el listado calcula RESUELTO cuando las sanciones ya se cumplieron', async () => {
  fake.alResponderTabla('disciplinary_cases', {
    data: [
      {
        id: CASO, case_number: 'EXP-2026-03', title: 'Uso de jugadora no inscrita', status: 'CON_SANCION', created_at: '2026-08-28T19:22:00Z',
        partido: { local: { name: 'Heredia VC', short_name: 'Heredia' }, visita: { name: 'Limón VC', short_name: 'Limón' } },
        case_parties: [{ party_type: 'EQUIPO', role_in_case: 'DENUNCIADO', equipo: { name: 'Heredia VC' } }],
        sanctions: [{ status: 'VIGENTE', end_date: '2026-09-01' }]
      },
      {
        id: PARTE, case_number: 'EXP-2026-07', title: 'Tarjeta roja al cuerpo técnico', status: 'CON_SANCION', created_at: '2026-09-12T15:30:00Z',
        case_parties: [PARTE_PERSONA], sanctions: [{ status: 'VIGENTE', end_date: null }]
      }
    ],
    error: null,
    count: 2
  });

  const r = await call('GET', '/api/incidents?estado=RESUELTO');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.total, 1);
  const [fila] = r.json.data.items;
  assert.equal(fila.numero, 'EXP-2026-03');
  assert.equal(fila.estado, 'RESUELTO');
  assert.equal(fila.partido, 'Heredia vs Limón');
  assert.equal(fila.involucra, 'Heredia VC');
  assert.deepEqual(pasosDe('disciplinary_cases', 'eq')[0], ['eq', 'status', 'CON_SANCION']);
});

test('abrir un expediente sin involucrados da 400 y no llama al procedimiento', async () => {
  const r = await call('POST', '/api/incidents', {
    competition_id: CASO, match_id: CASO, incident_type_code: 'RECLAMO', title: 'Reclamo por nómina',
    facts: 'San Carlos reclama una alineación indebida.', occurred_at: '2026-09-19T18:40:00-06:00', parties: []
  });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('abrir un expediente llama al procedimiento con los involucrados y el plazo en dias habiles', async () => {
  fake.alResponderTabla('catalog_values', { data: { id: FALTA }, error: null });
  fake.alResponderRpc('sp_open_disciplinary_case', { data: CASO, error: null });
  fake.alResponderTabla('disciplinary_cases', { data: { case_number: 'EXP-2026-08' }, error: null });

  const r = await call('POST', '/api/incidents', {
    competition_id: CASO, match_id: CASO, incident_type_code: 'RECLAMO', title: 'Reclamo por nómina no habilitada',
    facts: 'San Carlos VC reclama que Heredia VC alineó a una jugadora no aprobada.', occurred_at: '2026-09-19T18:40:00-06:00',
    defense_days: 5,
    parties: [
      { party_type: 'EQUIPO', team_id: EQUIPO, role_in_case: 'DENUNCIANTE' },
      { party_type: 'EQUIPO', team_id: CASO, role_in_case: 'DENUNCIADO' }
    ]
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.numero, 'EXP-2026-08');
  const [llamada] = rpcs();
  assert.equal(llamada.nombre, 'sp_open_disciplinary_case');
  assert.equal(llamada.params.p_parties.length, 2);
  assert.equal(llamada.params.p_parties[0].role_in_case, 'DENUNCIANTE');
  assert.equal(llamada.params.p_admin_name, 'Gabriela Rojas');
  assert.equal(llamada.params.p_responsible_user_id, ADMIN);
  // 5 días hábiles nunca caen en fin de semana
  const dia = new Date(`${llamada.params.p_defense_deadline}T00:00:00Z`).getUTCDay();
  assert.ok(dia >= 1 && dia <= 5);
});

test('aplicar una sancion fuera del rango del catalogo da 400 y no la guarda', async () => {
  fake.alResponderTabla('disciplinary_cases', { data: { id: CASO, status: 'EN_SEGUIMIENTO', competition_id: CASO }, error: null });
  fake.alResponderTabla('case_parties', { data: PARTE_PERSONA, error: null });
  fake.alResponderTabla('infractions', { data: F12, error: null });

  const r = await call('POST', `/api/incidents/${CASO}/sanctions`, {
    party_id: PARTE, infraction_id: FALTA, sanction_type: 'SUSPENSION_PARTIDOS', quantity: 5, basis: 'Reincidencia'
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /fuera del rango/);
  assert.equal(pasosDe('sanctions', 'insert').length, 0);
});

test('aplicar una suspension por partidos calcula las jornadas en que se cumple', async () => {
  fake.alResponderTabla('disciplinary_cases',
    { data: { id: CASO, status: 'EN_SEGUIMIENTO', competition_id: CASO }, error: null },
    { data: null, error: null });
  fake.alResponderTabla('case_parties', { data: PARTE_PERSONA, error: null });
  fake.alResponderTabla('infractions', { data: F12, error: null });
  fake.alResponderTabla('matches', {
    data: [{ id: 'a', matchday: 8, scheduled_date: '2026-09-19' }, { id: 'b', matchday: 9, scheduled_date: '2026-09-27' }],
    error: null
  });
  fake.alResponderTabla('sanctions', { data: { id: FALTA }, error: null });

  const r = await call('POST', `/api/incidents/${CASO}/sanctions`, {
    party_id: PARTE, infraction_id: FALTA, sanction_type: 'SUSPENSION_PARTIDOS', quantity: 2, basis: 'Reincidencia y retraso del partido.'
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.cumplimiento, 'Jornadas 8 y 9 (19 al 27 set)');
  const [[, sancion]] = pasosDe('sanctions', 'insert');
  assert.equal(sancion.end_date, '2026-09-27');
  assert.equal(sancion.team_id, EQUIPO);
  assert.equal(sancion.applied_by, 'admin@fecovol.cr');
  const cambios = pasosDe('disciplinary_cases', 'update')[0][1];
  assert.equal(cambios.status, 'CON_SANCION');
  assert.ok(pasosDe('case_events', 'insert').some(([, e]) => e.event_type === 'SANCION'));
});

test('archivar sin justificacion da 400', async () => {
  fake.alResponderTabla('disciplinary_cases', { data: { id: CASO, status: 'ABIERTO' }, error: null });
  const r = await call('POST', `/api/incidents/${CASO}/archive`, { reason: 'no' });
  assert.equal(r.status, 400);
  assert.equal(pasosDe('disciplinary_cases', 'update').length, 0);
});

test('un expediente con sancion no se puede archivar', async () => {
  fake.alResponderTabla('disciplinary_cases', { data: { id: CASO, status: 'CON_SANCION' }, error: null });
  const r = await call('POST', `/api/incidents/${CASO}/archive`, { reason: 'No procede porque el acta tenía un error.' });
  assert.equal(r.status, 409);
});

test('agregar una falta con un rango incoherente da 400 y no inserta', async () => {
  const r = await call('POST', '/api/incidents/infractions', {
    code: 'F-30', name: 'Prueba', applies_to: 'PERSONA', severity: 'LEVE',
    min_sanction: 'SUSPENSION_PARTIDOS', min_quantity: 3, max_sanction: 'SUSPENSION_PARTIDOS', max_quantity: 1
  });
  assert.equal(r.status, 400);
  assert.equal(pasosDe('infractions', 'insert').length, 0);
});

test('agregar una falta con codigo repetido da 409', async () => {
  fake.alResponderTabla('infractions', { data: null, error: { code: '23505', message: 'duplicate key' } });
  const r = await call('POST', '/api/incidents/infractions', {
    code: 'f-12', name: 'Conducta', applies_to: 'PERSONA', severity: 'GRAVE',
    min_sanction: 'SUSPENSION_PARTIDOS', min_quantity: 1, max_sanction: 'SUSPENSION_PARTIDOS', max_quantity: 3
  });
  assert.equal(r.status, 409);
  assert.equal(pasosDe('infractions', 'insert')[0][1].code, 'F-12');
});

test('el resumen cuenta resueltos de la temporada y sanciones vigentes', async () => {
  fake.alResponderTabla('disciplinary_cases',
    { data: null, error: null, count: 7 },
    { data: null, error: null, count: 3 },
    { data: [{ status: 'CON_SANCION', sanctions: [{ status: 'VIGENTE', end_date: '2026-01-01' }] }, { status: 'CON_SANCION', sanctions: [{ status: 'VIGENTE', end_date: null }] }], error: null });
  fake.alResponderTabla('sanctions', { data: null, error: null, count: 5 });

  const r = await call('GET', '/api/incidents/summary');
  assert.equal(r.status, 200);
  assert.deepEqual(
    { a: r.json.data.abiertos, s: r.json.data.enSeguimiento, r: r.json.data.resueltosTemporada, v: r.json.data.sancionesVigentes },
    { a: 7, s: 3, r: 1, v: 5 }
  );
});

test('no se puede inscribir en una nomina a una persona suspendida', async () => {
  fake.alResponderTabla('persons', { data: { is_verified: true, first_name: 'Kevin', last_name: 'Brown' }, error: null });
  fake.alResponderRpc('fn_person_is_suspended', { data: true, error: null });

  const r = await call('POST', `/api/competitions/${CASO}/teams/${EQUIPO}/roster`, { person_id: PARTE });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /sanción disciplinaria vigente/);
  assert.equal(fake.llamadas.filter((l) => l.tabla === 'team_members').length, 0);
});
