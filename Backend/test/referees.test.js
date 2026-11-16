// Pruebas de Arbitraje: acreditaciones y cursos (/api/referees). No necesitan conexion a la base de datos.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');

const UUID = '11111111-1111-4111-8111-111111111111';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const PERFIL_ADMIN = { id: ADMIN, email: 'admin@fecovol.cr', full_name: 'Admin', status: 'ACTIVA', rol: { name: 'Administrador' } };
const ARCHIVO = { path: `acreditaciones/2026/${UUID}.pdf`, name: 'certificado.pdf' };

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
  fake.usuarioAuth = { id: ADMIN };
  fake.alResponderTabla('user_profiles', { data: PERFIL_ADMIN, error: null });
});

async function call(method, ruta, body, token = 'token') {
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
function enDias(n) {
  const d = new Date(`${hoy()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const pasosDe = (tabla, metodo) =>
  fake.llamadas.filter((l) => l.tabla === tabla).flatMap((l) => l.pasos.filter((p) => p[0] === metodo));
const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');

const ACREDITACION_VALIDA = {
  person_id: PERSONA,
  function_code: 'PRI',
  level_code: 'NAC',
  modality: 'SALA',
  valid_from: '2026-09-21',
  valid_until: '2027-12-31',
  course_enrollment_id: UUID,
  practical_evaluation: 'APROBADA',
  physical_test: 'APROBADA',
  certificate: ARCHIVO,
  medical: { ...ARCHIVO, name: 'constancia.pdf' }
};

test('sin token responde 401 y no consulta acreditaciones', async () => {
  fake.usuarioAuth = null;
  const r = await call('GET', '/api/referees', null, null);
  assert.equal(r.status, 401);
  assert.equal(fake.llamadas.filter((l) => l.tabla === 'referee_accreditations').length, 0);
});

test('un usuario que no es administrador recibe 403', async () => {
  fake.alResponderTabla('user_profiles', { data: { ...PERFIL_ADMIN, rol: { name: 'Arbitro' } }, error: null });
  const r = await call('GET', '/api/referees');
  assert.equal(r.status, 403);
});

test('el listado filtra por vencer, calcula el estado y cuenta los partidos de la temporada', async () => {
  fake.alResponderTabla('referee_accreditations', {
    data: [{
      id: UUID,
      person_id: PERSONA,
      valid_until: enDias(10),
      persona: { id: PERSONA, first_name: 'Diana', last_name: 'Murillo Cruz', document_number: '4-0233-0918', province: 'Heredia' },
      funcion: { code: 'SEG', value: 'Segundo árbitro' },
      nivel: { code: 'NAC', value: 'Nacional' }
    }],
    error: null,
    count: 1
  });
  fake.alResponderTabla('referee_assignments', { data: [{ person_id: PERSONA }, { person_id: PERSONA }], error: null });

  const r = await call('GET', '/api/referees?estado=POR_VENCER');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.total, 1);
  const [fila] = r.json.data.items;
  assert.equal(fila.nombre, 'Diana Murillo Cruz');
  assert.equal(fila.estado, 'POR_VENCER');
  assert.equal(fila.partidos, 2);
  assert.deepEqual(pasosDe('referee_accreditations', 'gte')[0], ['gte', 'valid_until', hoy()]);
  assert.deepEqual(pasosDe('referee_accreditations', 'lte')[0], ['lte', 'valid_until', enDias(30)]);
});

test('si la busqueda no encuentra personas, el listado queda vacio', async () => {
  fake.alResponderTabla('persons', { data: [], error: null });
  const r = await call('GET', '/api/referees?q=nadie');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.items, []);
  assert.equal(pasosDe('referee_accreditations', 'range').length, 0);
});

test('un estado desconocido en el filtro da 400', async () => {
  const r = await call('GET', '/api/referees?estado=SUSPENDIDA');
  assert.equal(r.status, 400);
});

test('acreditar con la prueba fisica pendiente da 400 y no llama al procedimiento', async () => {
  const r = await call('POST', '/api/referees/accreditations', { ...ACREDITACION_VALIDA, physical_test: 'PENDIENTE' });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('acreditar con un archivo que no subio el sistema da 400', async () => {
  fake.alResponderTabla('catalog_values', { data: { id: UUID }, error: null }, { data: { id: UUID }, error: null });
  const r = await call('POST', '/api/referees/accreditations', {
    ...ACREDITACION_VALIDA,
    certificate: { path: '../news/covers/x.pdf', name: 'x.pdf' }
  });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('acreditar con vencimiento anterior al inicio da 400', async () => {
  const r = await call('POST', '/api/referees/accreditations', { ...ACREDITACION_VALIDA, valid_until: '2026-01-01' });
  assert.equal(r.status, 400);
});

test('acreditar llama al procedimiento con los requisitos y el usuario en sesion', async () => {
  fake.alResponderTabla('catalog_values', { data: { id: UUID }, error: null }, { data: { id: UUID }, error: null });
  fake.alResponderRpc('sp_accredit_referee', { data: UUID, error: null });

  const r = await call('POST', '/api/referees/accreditations', ACREDITACION_VALIDA);
  assert.equal(r.status, 201);
  assert.equal(r.json.data.id, UUID);
  const [llamada] = rpcs();
  assert.equal(llamada.nombre, 'sp_accredit_referee');
  assert.equal(llamada.params.p_person_id, PERSONA);
  assert.equal(llamada.params.p_function_code, 'PRI');
  assert.equal(llamada.params.p_certificate_url, ARCHIVO.path);
  assert.equal(llamada.params.p_medical_name, 'constancia.pdf');
  assert.equal(llamada.params.p_category_code, null);
  assert.equal(llamada.params.p_admin_user, 'admin@fecovol.cr');
});

test('una funcion que no existe en el catalogo da 400', async () => {
  fake.alResponderTabla('catalog_values', { data: null, error: null });
  const r = await call('POST', '/api/referees/accreditations', { ...ACREDITACION_VALIDA, function_code: 'XXX' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Función/);
  assert.equal(rpcs().length, 0);
});

test('el resumen calcula la cobertura de los proximos partidos y el porcentaje de la temporada', async () => {
  fake.alResponderTabla('referee_accreditations',
    { data: null, error: null, count: 140 },
    { data: null, error: null, count: 12 },
    { data: null, error: null, count: 3 });
  const asignacion = (tipo) => ({ status: 'CONFIRMADA', official_type_value_id: tipo });
  const completo = { id: 'a', referee_assignments: ['1', '2', '3', '4'].map(asignacion) };
  fake.alResponderTabla('matches',
    // temporada: uno completo y uno con dos puestos -> 50 %
    { data: [completo, { id: 'b', referee_assignments: ['1', '2'].map(asignacion) }], error: null },
    // próximos: uno completo y uno sin oficiales (las anuladas no cuentan)
    { data: [completo, { id: 'c', referee_assignments: [{ status: 'ANULADA', official_type_value_id: '1' }] }], error: null });
  fake.alResponderTabla('referee_courses', {
    data: [{ id: UUID, name: 'Curso de actualización anual', start_date: '2026-11-28', end_date: '2026-11-29', format: 'VIRTUAL', enrollment_open: true, status: 'PUBLICADO', referee_course_enrollments: [{ count: 31 }] }],
    error: null
  });

  const r = await call('GET', '/api/referees/summary');
  assert.equal(r.status, 200);
  const d = r.json.data;
  assert.equal(d.acreditadas, 140);
  assert.equal(d.porVencer, 12);
  assert.equal(d.vencidas, 3);
  assert.equal(d.arbitrajeCompletoPct, 50);
  assert.equal(d.cobertura.programados, 2);
  assert.equal(d.cobertura.completos, 1);
  assert.equal(d.cobertura.incompletos, 1);
  assert.equal(d.cobertura.sinOficiales, 1);
  assert.equal(d.proximosCursos[0].inscritos, 31);
});

test('programar un curso que termina antes de empezar da 400 y no inserta', async () => {
  const r = await call('POST', '/api/referees/courses', {
    name: 'Actualización arbitral 2027', course_type: 'ACTUALIZACION_ANUAL', start_date: '2026-11-15', end_date: '2026-11-14'
  });
  assert.equal(r.status, 400);
  assert.equal(pasosDe('referee_courses', 'insert').length, 0);
});

test('programar un curso guarda quien lo creo y la nota minima por defecto', async () => {
  fake.alResponderTabla('catalog_values', { data: { id: UUID }, error: null });
  fake.alResponderTabla('referee_courses', { data: { id: UUID }, error: null });

  const r = await call('POST', '/api/referees/courses', {
    name: 'Actualización arbitral 2027', course_type: 'ACTUALIZACION_ANUAL', modality_code: 'SALA',
    start_date: '2026-11-14', end_date: '2026-11-15', capacity: 40, enrollment_closes: '2026-11-07'
  });
  assert.equal(r.status, 201);
  const [[, fila]] = pasosDe('referee_courses', 'insert');
  assert.equal(fila.created_by, 'admin@fecovol.cr');
  assert.equal(fila.passing_grade, 70);
  assert.equal(fila.capacity, 40);
  assert.equal(fila.modality_value_id, UUID);
  assert.equal(fila.enrollment_open, true);
});

test('inscribir en un curso sin cupo da 409', async () => {
  fake.alResponderTabla('referee_courses', {
    data: { id: UUID, capacity: 2, status: 'PUBLICADO', only_current_accreditation: false, referee_course_enrollments: [{ count: 2 }] },
    error: null
  });
  const r = await call('POST', `/api/referees/courses/${UUID}/enrollments`, { person_id: PERSONA });
  assert.equal(r.status, 409);
  assert.equal(pasosDe('referee_course_enrollments', 'insert').length, 0);
});

test('un curso solo para vigentes rechaza a quien no tiene acreditacion vigente', async () => {
  fake.alResponderTabla('referee_courses', {
    data: { id: UUID, capacity: null, status: 'PUBLICADO', only_current_accreditation: true, referee_course_enrollments: [{ count: 0 }] },
    error: null
  });
  fake.alResponderTabla('referee_accreditations', { data: null, error: null });
  const r = await call('POST', `/api/referees/courses/${UUID}/enrollments`, { person_id: PERSONA });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /vigente/);
});

test('cargar la nota decide aprobado o reprobado con la nota minima del curso', async () => {
  fake.alResponderTabla('referee_courses', { data: { id: UUID, passing_grade: 70 }, error: null });
  fake.alResponderTabla('referee_course_enrollments', { data: { id: PERSONA, grade: 65, result: 'REPROBADO' }, error: null });

  const r = await call('PATCH', `/api/referees/courses/${UUID}/enrollments/${PERSONA}`, { grade: 65 });
  assert.equal(r.status, 200);
  const [[, cambios]] = pasosDe('referee_course_enrollments', 'update');
  assert.equal(cambios.result, 'REPROBADO');
  assert.equal(cambios.grade, 65);
});

test('la ficha de una persona sin acreditaciones da 404', async () => {
  fake.alResponderTabla('persons', { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora' }, error: null });
  fake.alResponderTabla('referee_accreditations', { data: [], error: null });
  const r = await call('GET', `/api/referees/${PERSONA}`);
  assert.equal(r.status, 404);
});

test('editar una acreditacion reemplazada da 409', async () => {
  fake.alResponderTabla('referee_accreditations', {
    data: { id: UUID, person_id: PERSONA, valid_from: '2025-01-01', valid_until: '2025-12-31', status: 'REEMPLAZADA' },
    error: null
  });
  const r = await call('PATCH', `/api/referees/accreditations/${UUID}`, { notes: 'x' });
  assert.equal(r.status, 409);
  assert.equal(pasosDe('referee_accreditations', 'update').length, 0);
});
