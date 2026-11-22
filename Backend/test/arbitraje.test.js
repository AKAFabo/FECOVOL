// Pruebas del módulo de arbitraje: permisos por rol, validaciones y que el árbitro solo actúe
// sobre lo suyo. Usan el cliente falso de Supabase (sin conexión).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const { limpiarCache } = require('../src/middleware/authenticate');
const { hoyCR, sumarDias } = require('../src/utils/arbitraje');
const { ADMIN, REPRE, ARBITRO, registrarUsuarios, encabezadosDe } = require('./usuarios');

const PERSONAL = { token: 'token-personal-000000000', id: '00000000-0000-4000-8000-0000000000d4', email: 'competencias@fecovol.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Personal' } };

const PERSONA = '22222222-2222-4222-8222-222222222222';
const OTRA_PERSONA = '44444444-4444-4444-8444-444444444444';
const PARTIDO = '55555555-5555-4555-8555-555555555555';
const OTRO_PARTIDO = '66666666-6666-4666-8666-666666666666';
const INSCRIPCION = '77777777-7777-4777-8777-777777777777';
const CURSO = '88888888-8888-4888-8888-888888888888';
const ASO = '33333333-3333-4333-8333-333333333333';

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
  const res = await fetch(base + ruta, {
    method,
    headers: { 'Content-Type': 'application/json', ...encabezadosDe(quien) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');
const denegaciones = () => fake.llamadas.filter((l) => l.tabla === 'audit_logs' && l.pasos.some((p) => p[0] === 'insert' && p[1][0].accion === 'ACCESO_DENEGADO'));

const ACREDITACION = {
  person_id: PERSONA,
  function_code: 'PRI',
  level_code: 'NAC',
  modality: 'SALA',
  valid_from: hoyCR(),
  valid_until: sumarDias(hoyCR(), 400),
  course_enrollment_id: INSCRIPCION,
  practical_evaluation: 'APROBADA',
  physical_test: 'APROBADA'
};

const valor = (code) => ({ data: { id: 'x', code, value: code, is_active: true }, error: null });

/* ─── Permisos ──────────────────────────────────────────────────────────────────────────────── */

test('el cuerpo arbitral lo consultan Administración y Personal, no el representante ni el público', async () => {
  fake.alResponderTabla('v_cuerpo_arbitral', { data: [], error: null, count: 0 }, { data: [], error: null, count: 0 });
  assert.equal((await call('GET', '/api/referees')).status, 200);
  assert.equal((await call('GET', '/api/referees', null, PERSONAL)).status, 200);
  assert.equal((await call('GET', '/api/referees', null, null)).status, 401);

  const repre = await call('GET', '/api/referees', null, REPRE);
  assert.equal(repre.status, 403);
  assert.equal(denegaciones().length, 1);
  assert.equal((await call('GET', '/api/referees', null, ARBITRO)).status, 403);
});

test('el Personal de competencias no acredita ni crea cursos', async () => {
  assert.equal((await call('POST', '/api/referees/acreditaciones', ACREDITACION, PERSONAL)).status, 403);
  assert.equal((await call('POST', '/api/referees/cursos', { name: 'Curso de prueba' }, PERSONAL)).status, 403);
  assert.equal(rpcs().length, 0);
});

test('el filtro de estado del cuerpo arbitral solo admite valores conocidos', async () => {
  const r = await call('GET', '/api/referees?estado=TODO');
  assert.equal(r.status, 400);
});

/* ─── Acreditar ─────────────────────────────────────────────────────────────────────────────── */

test('acreditar exige evaluación práctica y prueba física aprobadas', async () => {
  const r = await call('POST', '/api/referees/acreditaciones', { ...ACREDITACION, physical_test: 'PENDIENTE' });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('acreditar exige el curso aprobado y una vigencia futura', async () => {
  assert.equal((await call('POST', '/api/referees/acreditaciones', { ...ACREDITACION, course_enrollment_id: undefined })).status, 400);
  assert.equal((await call('POST', '/api/referees/acreditaciones', { ...ACREDITACION, valid_from: '2020-01-01', valid_until: '2020-12-31' })).status, 400);
  assert.equal(rpcs().length, 0);
});

test('acreditar a una persona sin cuenta la invita y la vincula con el rol Arbitro', async () => {
  fake.alResponderTabla('catalog_values', valor('PRI'), valor('NAC'));
  fake.alResponderRpc('sp_accredit_referee_v2', { data: 'acred-1', error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora', email: 'Ana@Correo.cr', user_id: null }, error: null });
  fake.alResponderTabla('roles', { data: { id: 'rol-arbitro' }, error: null });

  const r = await call('POST', '/api/referees/acreditaciones', ACREDITACION);

  assert.equal(r.status, 201);
  assert.equal(r.json.acceso.estado, 'INVITACION_ENVIADA');
  const [acreditar, vincular] = rpcs();
  assert.equal(acreditar.nombre, 'sp_accredit_referee_v2');
  assert.equal(acreditar.params.p_admin_user, ADMIN.email);
  assert.equal(acreditar.params.p_person_id, PERSONA);
  assert.equal(vincular.nombre, 'sp_link_referee_account');
  assert.equal(vincular.params.p_user_id, '99999999-9999-4999-8999-999999999999');
  const invitacion = fake.llamadas.find((l) => l.tipo === 'invitacion');
  assert.equal(invitacion.correo, 'ana@correo.cr');
  assert.match(invitacion.opciones.redirectTo, /\/restablecer-contrasena$/);
});

test('si ya existe una cuenta con el correo de la persona, se vincula sin invitar', async () => {
  fake.alResponderTabla('catalog_values', valor('PRI'), valor('NAC'));
  fake.alResponderRpc('sp_accredit_referee_v2', { data: 'acred-1', error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora', email: 'ana@correo.cr', user_id: null }, error: null });
  // Cuenta ya registrada con ese correo (sin sesión en esta prueba).
  fake.conSesion('token-sin-uso-000000000000', { id: 'cuenta-existente', email: 'ana@correo.cr', status: 'ACTIVA', roles: { name: 'Representante' } });

  const r = await call('POST', '/api/referees/acreditaciones', ACREDITACION);

  assert.equal(r.status, 201);
  assert.equal(r.json.acceso.estado, 'VINCULADA');
  assert.equal(fake.llamadas.filter((l) => l.tipo === 'invitacion').length, 0);
  assert.equal(rpcs()[1].params.p_user_id, 'cuenta-existente');
});

test('una persona sin correo queda acreditada pero sin cuenta', async () => {
  fake.alResponderTabla('catalog_values', valor('PRI'), valor('NAC'));
  fake.alResponderRpc('sp_accredit_referee_v2', { data: 'acred-1', error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora', email: null, user_id: null }, error: null });

  const r = await call('POST', '/api/referees/acreditaciones', ACREDITACION);
  assert.equal(r.status, 201);
  assert.equal(r.json.acceso.estado, 'SIN_CORREO');
  assert.equal(rpcs().length, 1);
});

test('una función que no existe en el catálogo da 400 antes de acreditar', async () => {
  fake.alResponderTabla('catalog_values', { data: null, error: null }, valor('NAC'));
  const r = await call('POST', '/api/referees/acreditaciones', { ...ACREDITACION, function_code: 'XYZ' });
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

/* ─── Cursos ────────────────────────────────────────────────────────────────────────────────── */

test('crear curso valida fechas, cupo y nota mínima', async () => {
  const curso = { name: 'Actualización arbitral 2027', course_type: 'ACTUALIZACION_ANUAL', format: 'PRESENCIAL', start_date: '2026-12-14', end_date: '2026-12-15' };
  assert.equal((await call('POST', '/api/referees/cursos', { ...curso, end_date: '2026-12-01' })).status, 400);
  assert.equal((await call('POST', '/api/referees/cursos', { ...curso, capacity: 0 })).status, 400);
  assert.equal((await call('POST', '/api/referees/cursos', { ...curso, passing_grade: 120 })).status, 400);
  assert.equal((await call('POST', '/api/referees/cursos', { ...curso, enrollment_closes: '2026-12-20' })).status, 400);
  assert.equal(rpcs().length, 0);

  fake.alResponderRpc('sp_create_referee_course', { data: CURSO, error: null });
  fake.alResponderTabla('referee_courses', { data: { id: CURSO }, error: null });
  const r = await call('POST', '/api/referees/cursos', { ...curso, capacity: 40 });
  assert.equal(r.status, 201);
  assert.equal(rpcs()[0].params.p_capacity, 40);
  assert.equal(rpcs()[0].params.p_passing_grade, 70);
});

test('no se califica una inscripción de otro curso por la URL', async () => {
  fake.alResponderTabla('referee_course_enrollments', { data: { id: INSCRIPCION, course_id: 'otro-curso' }, error: null });
  const r = await call('PATCH', `/api/referees/cursos/${CURSO}/inscripciones/${INSCRIPCION}`, { grade: 90 });
  assert.equal(r.status, 404);
  assert.equal(rpcs().length, 0);
});

test('la nota de una inscripción debe estar entre 0 y 100', async () => {
  const r = await call('PATCH', `/api/referees/cursos/${CURSO}/inscripciones/${INSCRIPCION}`, { grade: 101 });
  assert.equal(r.status, 400);
});

/* ─── Designaciones (FECOVOL) ───────────────────────────────────────────────────────────────── */

test('FECOVOL no confirma ni rechaza en nombre del árbitro', async () => {
  const r = await call('PATCH', `/api/referee-assignments/${PARTIDO}`, { status: 'CONFIRMADA' }, PERSONAL);
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('designar a alguien de la asociación de un equipo exige el motivo', async () => {
  fake.alResponderTabla('matches', { data: { id: PARTIDO, scheduled_date: '2026-12-05', scheduled_time: '18:30:00', local: { association_id: ASO }, visitante: { association_id: 'otra' } }, error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: ASO }, error: null });
  fake.alResponderTabla('referee_assignments', { data: [], error: null });

  const r = await call('POST', '/api/referee-assignments', { match_id: PARTIDO, person_id: PERSONA, official_type_code: 'PRI' }, PERSONAL);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /motivo/);
  assert.equal(rpcs().length, 0);
});

test('no se designa a una persona en dos partidos a la misma hora', async () => {
  fake.alResponderTabla('matches', { data: { id: PARTIDO, scheduled_date: '2026-12-05', scheduled_time: '18:30:00', local: {}, visitante: {} }, error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: null }, error: null });
  fake.alResponderTabla('referee_assignments', { data: [{ id: 'd1', match_id: OTRO_PARTIDO, partido: { scheduled_date: '2026-12-05', scheduled_time: '18:30:00' } }], error: null });

  const r = await call('POST', '/api/referee-assignments', { match_id: PARTIDO, person_id: PERSONA, official_type_code: 'PRI' }, PERSONAL);
  assert.equal(r.status, 409);
  assert.equal(rpcs().length, 0);
});

test('la lista de disponibles marca vencidos, conflicto de interés y otra designación ese día', async () => {
  fake.alResponderTabla('matches', {
    data: { id: PARTIDO, scheduled_date: '2026-12-05', scheduled_time: '18:30:00', status: 'PROGRAMADO', local: { association_id: ASO }, visitante: { association_id: null } },
    error: null
  });
  fake.alResponderTabla('v_cuerpo_arbitral', {
    data: [
      { person_id: PERSONA, first_name: 'Ana', last_name: 'Mora', accreditation_id: 'a1', valid_from: '2026-01-01', valid_until: '2026-11-30', estado: 'VENCIDA', persona_status: 'ACTIVA' },
      { person_id: OTRA_PERSONA, first_name: 'Luis', last_name: 'Vega', association_id: ASO, accreditation_id: 'a2', valid_from: '2026-01-01', valid_until: '2027-12-31', estado: 'AL_DIA', persona_status: 'ACTIVA' }
    ],
    error: null
  });
  fake.alResponderTabla('referee_assignments', { data: [{ person_id: OTRA_PERSONA, match_id: OTRO_PARTIDO, status: 'CONFIRMADA', partido: { scheduled_date: '2026-12-05', scheduled_time: '15:00:00' } }], error: null });

  const r = await call('GET', `/api/referees/disponibles?match_id=${PARTIDO}`, null, PERSONAL);
  assert.equal(r.status, 200);
  const [luis, ana] = r.json.data;
  assert.equal(luis.person_id, OTRA_PERSONA);
  assert.equal(luis.bloqueo, null);
  assert.equal(luis.conflicto_interes, true);
  assert.ok(luis.avisos.includes('Ya designada ese día'));
  assert.equal(ana.bloqueo, 'Acreditación vencida para esa fecha');
  assert.equal('persona_status' in ana, false);
});

test('un perfil guardado con mayúsculas en el correo igual se reconoce por el id de la cuenta', async () => {
  // El perfil se creó como "Turnos+Per@…"; Supabase Auth entrega el correo en minúsculas.
  const MIXTO = { token: 'token-mixto-0000000000000', id: '00000000-0000-4000-8000-0000000000d9', email: 'Turnos+Per@FECOVOL.cr', status: 'ACTIVA', organization_id: null, roles: { name: 'Personal' } };
  const { token, ...perfil } = MIXTO;
  fake.conSesion(token, perfil);
  fake.alResponderTabla('matches', { data: [], error: null });

  const r = await call('GET', '/api/referee-assignments/partidos', null, MIXTO);

  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, []);
});

test('el resumen calcula la cobertura de los próximos partidos', async () => {
  fake.alResponderTabla('v_cuerpo_arbitral', { data: [{ estado: 'AL_DIA' }, { estado: 'AL_DIA' }, { estado: 'POR_VENCER' }, { estado: 'VENCIDA' }], error: null });
  const oficial = (status) => ({ status });
  fake.alResponderTabla('matches', {
    data: [
      { id: 'm1', arbitraje: [oficial('CONFIRMADA'), oficial('PROPUESTA'), oficial('CONFIRMADA'), oficial('CONFIRMADA')] },
      { id: 'm2', arbitraje: [oficial('CONFIRMADA'), oficial('RECHAZADA'), oficial('ANULADA')] },
      { id: 'm3', arbitraje: [] }
    ],
    error: null
  });
  fake.alResponderTabla('referee_courses', { data: [{ id: CURSO, name: 'Curso', inscritos: [{ count: 12 }] }], error: null });

  const r = await call('GET', '/api/referees/resumen');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.acreditados, 3);
  assert.equal(r.json.data.vencida, 1);
  assert.deepEqual(
    { ...r.json.data.cobertura, desde: undefined, hasta: undefined },
    { desde: undefined, hasta: undefined, partidos: 3, completos: 1, incompletos: 1, sin_oficiales: 1, porcentaje: 33 }
  );
  assert.equal(r.json.data.cursos[0].inscritos, 12);
});

/* ─── Entorno del árbitro ───────────────────────────────────────────────────────────────────── */

const MI_PERSONA = { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora', status: 'ACTIVA', email: 'a@b.cr', phone: '8888-0000', person_roles: [{ role_type: 'ARBITRO', is_active: true }] }, error: null };

test('Mi ficha exige el rol Arbitro', async () => {
  assert.equal((await call('GET', '/api/referees/me', null, REPRE)).status, 403);
  assert.equal((await call('GET', '/api/referees/me', null, null)).status, 401);
});

test('Mi ficha busca la persona por la cuenta del token', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  const r = await call('GET', '/api/referees/me', null, ARBITRO);
  assert.equal(r.status, 200);
  const consulta = fake.llamadas.find((l) => l.tabla === 'persons');
  assert.ok(consulta.pasos.some((p) => p[0] === 'eq' && p[1] === 'user_id' && p[2] === ARBITRO.id));
  assert.equal('person_roles' in r.json.data.persona, false);
});

test('una cuenta con rol Arbitro sin persona vinculada recibe 404 con instrucciones', async () => {
  fake.alResponderTabla('persons', { data: null, error: null });
  const r = await call('GET', '/api/referees/me', null, ARBITRO);
  assert.equal(r.status, 404);
  assert.match(r.json.error, /vinculada/);
});

test('una persona sin el rol ARBITRO activo no entra aunque la cuenta tenga el rol', async () => {
  fake.alResponderTabla('persons', { data: { ...MI_PERSONA.data, person_roles: [{ role_type: 'ARBITRO', is_active: false }] }, error: null });
  const r = await call('GET', '/api/referees/me/designaciones', null, ARBITRO);
  assert.equal(r.status, 403);
});

test('rechazar una designación exige motivo', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  const r = await call('PATCH', `/api/referees/me/designaciones/${PARTIDO}`, { status: 'RECHAZADA', motivo: 'no' }, ARBITRO);
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('el árbitro responde solo como sí mismo, aunque mande otra persona en el cuerpo', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  const r = await call('PATCH', `/api/referees/me/designaciones/${PARTIDO}`, { status: 'CONFIRMADA', person_id: OTRA_PERSONA }, ARBITRO);
  assert.equal(r.status, 200);
  const [rpc] = rpcs();
  assert.equal(rpc.nombre, 'sp_respond_referee_assignment');
  assert.equal(rpc.params.p_person_id, PERSONA);
  assert.equal(rpc.params.p_user, ARBITRO.email);
});

test('una designación que ya no se puede responder da 409', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderRpc('sp_respond_referee_assignment', { data: null, error: { code: 'P0001', message: 'La designación ya no se puede responder' } });
  const r = await call('PATCH', `/api/referees/me/designaciones/${PARTIDO}`, { status: 'CONFIRMADA' }, ARBITRO);
  assert.equal(r.status, 409);
});

test('el árbitro solo cambia su correo y teléfono, validados', async () => {
  fake.alResponderTabla('persons', MI_PERSONA, MI_PERSONA);
  assert.equal((await call('PATCH', '/api/referees/me/contacto', { email: 'no-es-correo' }, ARBITRO)).status, 400);
  const r = await call('PATCH', '/api/referees/me/contacto', { phone: '8876-4410', first_name: 'Otro', email: 'Nueva@Correo.cr' }, ARBITRO);
  assert.equal(r.status, 200);
  const [rpc] = rpcs();
  assert.equal(rpc.nombre, 'sp_update_person');
  assert.equal(rpc.params.p_id, PERSONA);
  assert.equal(rpc.params.p_email, 'nueva@correo.cr');
  assert.equal('p_first_name' in rpc.params, false);
});

test('el árbitro se inscribe en un curso como sí mismo y sin saltarse el periodo', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  const r = await call('POST', `/api/referees/me/cursos/${CURSO}/inscripcion`, { person_id: OTRA_PERSONA }, ARBITRO);
  assert.equal(r.status, 201);
  const [rpc] = rpcs();
  assert.equal(rpc.params.p_person_id, PERSONA);
  assert.equal(rpc.params.p_por_fecovol, false);
});

test('dar acceso solo a personas del cuerpo arbitral y solo desde Administración', async () => {
  assert.equal((await call('POST', `/api/referees/personas/${PERSONA}/acceso`, null, PERSONAL)).status, 403);
  fake.alResponderTabla('person_roles', { data: [], error: null });
  const r = await call('POST', `/api/referees/personas/${PERSONA}/acceso`);
  assert.equal(r.status, 400);
  assert.equal(rpcs().length, 0);
});

test('dar acceso a un árbitro sin cuenta envía la invitación', async () => {
  fake.alResponderTabla('person_roles', { data: [{ role_type: 'ARBITRO', is_active: true }], error: null });
  fake.alResponderTabla('persons', { data: { id: PERSONA, first_name: 'Ana', last_name: 'Mora', email: 'ana@correo.cr', user_id: null }, error: null });
  const r = await call('POST', `/api/referees/personas/${PERSONA}/acceso`);
  assert.equal(r.status, 200);
  assert.equal(r.json.acceso.estado, 'INVITACION_ENVIADA');
  assert.equal(rpcs()[0].nombre, 'sp_link_referee_account');
});
