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

/* ── Partido designado: nóminas, cierre y evidencias (RF-ARB-004, 005 y 006) ── */

const { limpiarCacheLimites } = require('../src/utils/archivos');

function partidoDe({ puesto = 'PRI', estado = 'CONFIRMADA', fecha = sumarDias(hoyCR(), -1), persona = PERSONA, acta = 'BORRADOR' } = {}) {
  return {
    data: {
      id: PARTIDO, match_number: 7, matchday: 2, scheduled_date: fecha, scheduled_time: '19:00', status: 'PROGRAMADO', acta_status: acta,
      competencia: { id: '99999999-9999-4999-8999-999999999999', name: 'Liga' },
      local: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Local VC', short_name: 'LOC' },
      visitante: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Visita VC', short_name: 'VIS' },
      oficiales: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: estado, persona: { id: persona, first_name: 'Ana', last_name: 'Mora' }, puesto: { code: puesto, value: 'Árbitro principal' } }]
    },
    error: null
  };
}

const SETS_OK = [{ home_points: 25, away_points: 20 }, { home_points: 23, away_points: 25 }, { home_points: 26, away_points: 24 }, { home_points: 25, away_points: 18 }];

test('el árbitro no consulta un partido en el que no está designado', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe({ persona: OTRA_PERSONA }));
  const r = await call('GET', `/api/referees/me/partidos/${PARTIDO}`, null, ARBITRO);
  assert.equal(r.status, 404);
  assert.equal(denegaciones().length, 1);
});

test('la nómina para el arbitraje no expone cédulas y avisa si no está oficializada', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe());
  fake.alResponderTabla('competition_rosters',
    { data: [{ jersey_number: 7, roster_role: 'JUGADOR', is_habilitated: true, persona: { first_name: 'Eva', last_name: 'Solís', is_verified: true } }], error: null },
    { data: [], error: null });
  fake.alResponderTabla('competition_roster_versions', { data: [{ version_number: 2, status: 'OFICIALIZADA' }], error: null }, { data: [{ version_number: 1, status: 'PENDIENTE' }], error: null });
  fake.alResponderTabla('match_referee_reports', { data: null, error: null });
  fake.alResponderTabla('match_evidence', { data: [], error: null });

  const r = await call('GET', `/api/referees/me/partidos/${PARTIDO}`, null, ARBITRO);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.nominas[0].official, true);
  assert.equal(r.json.data.nominas[1].official, false);
  assert.deepEqual(Object.keys(r.json.data.nominas[0].members[0]).sort(), ['habilitated', 'identity_verified', 'name', 'number', 'role']);
  assert.equal(r.json.data.puede_cerrar, true);
  const consultaNomina = fake.llamadas.find((l) => l.tabla === 'competition_rosters');
  assert.ok(!JSON.stringify(consultaNomina.pasos).includes('document_number'));
});

test('solo el árbitro principal registra el cierre', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe({ puesto: 'SEG' }));
  const r = await call('PUT', `/api/referees/me/partidos/${PARTIDO}/cierre`, { sets: SETS_OK, enviar: true }, ARBITRO);
  assert.equal(r.status, 403);
  assert.equal(rpcs().length, 0);
});

test('un set imposible o un partido incompleto no se envían', async () => {
  fake.alResponderTabla('persons', MI_PERSONA, MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe(), partidoDe());
  const imposible = await call('PUT', `/api/referees/me/partidos/${PARTIDO}/cierre`, { sets: [{ home_points: 25, away_points: 24 }, ...SETS_OK.slice(1)], enviar: true }, ARBITRO);
  assert.equal(imposible.status, 400);
  assert.match(imposible.json.error, /set 1/);
  const incompleto = await call('PUT', `/api/referees/me/partidos/${PARTIDO}/cierre`, { sets: SETS_OK.slice(0, 2), enviar: true }, ARBITRO);
  assert.equal(incompleto.status, 400);
  assert.equal(rpcs().length, 0);
});

test('el cierre válido se envía con los sets numerados y queda a la espera de FECOVOL', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe());
  fake.alResponderRpc('sp_save_referee_report', { data: 'ENVIADO', error: null });
  const r = await call('PUT', `/api/referees/me/partidos/${PARTIDO}/cierre`, { sets: SETS_OK, enviar: true, person_id: OTRA_PERSONA }, ARBITRO);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.enviado, true);
  const rpc = rpcs()[0];
  assert.equal(rpc.params.p_person_id, PERSONA);
  assert.equal(rpc.params.p_sets.length, 4);
  assert.deepEqual(rpc.params.p_sets[2], { set_number: 3, home_points: 26, away_points: 24 });
});

test('un cierre ya enviado no se modifica sin que FECOVOL lo devuelva', async () => {
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe());
  fake.alResponderRpc('sp_save_referee_report', { data: null, error: { code: 'P0001', message: 'El cierre ya fue enviado; FECOVOL debe devolverlo para modificarlo' } });
  const r = await call('PUT', `/api/referees/me/partidos/${PARTIDO}/cierre`, { sets: SETS_OK, enviar: true }, ARBITRO);
  assert.equal(r.status, 409);
});

async function adjuntar(campos, archivo, nombre) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  if (archivo) f.append('archivo', new Blob([archivo]), nombre);
  const res = await fetch(`${base}/api/referees/me/partidos/${PARTIDO}/evidencias`, { method: 'POST', headers: encabezadosDe(ARBITRO), body: f });
  return { status: res.status, json: await res.json() };
}

test('una evidencia con extensión falsa se rechaza por su contenido', async () => {
  limpiarCacheLimites();
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe());
  const r = await adjuntar({ file_type: 'HOJA_ANOTACION' }, Buffer.from('<script>alert(1)</script>'), 'hoja.pdf');
  assert.equal(r.status, 400);
  assert.equal(fake.llamadas.filter((l) => l.tipo === 'storage').length, 0);
});

test('la hoja de anotación se guarda asociada al partido y a quien la cargó', async () => {
  limpiarCacheLimites();
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('matches', partidoDe());
  fake.alResponderTabla('match_evidence', { data: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', file_type: 'HOJA_ANOTACION' }, error: null });
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 0x20)]);
  const r = await adjuntar({ file_type: 'HOJA_ANOTACION', description: 'Hoja oficial' }, pdf, 'hoja.pdf');
  assert.equal(r.status, 201);
  const subida = fake.llamadas.find((l) => l.tipo === 'storage' && l.accion === 'upload');
  assert.match(subida.ruta, new RegExp(`^matches/${PARTIDO}/`));
  const insercion = fake.llamadas.find((l) => l.tabla === 'match_evidence' && l.pasos.some((p) => p[0] === 'insert'));
  assert.equal(insercion.pasos.find((p) => p[0] === 'insert')[1].uploaded_by_person, PERSONA);
});

test('devolver un cierre es solo de FECOVOL y exige motivo', async () => {
  assert.equal((await call('PATCH', `/api/referee-assignments/cierres/${PARTIDO}/devolver`, { motivo: 'Falta la hoja de anotación' }, ARBITRO)).status, 403);
  assert.equal((await call('PATCH', `/api/referee-assignments/cierres/${PARTIDO}/devolver`, { motivo: 'corto' })).status, 400);
  fake.alResponderRpc('sp_return_referee_report', { data: null, error: null });
  const r = await call('PATCH', `/api/referee-assignments/cierres/${PARTIDO}/devolver`, { motivo: 'Falta la hoja de anotación' });
  assert.equal(r.status, 200);
  assert.equal(rpcs()[0].nombre, 'sp_return_referee_report');
});

test('las reglas de los sets aceptan el quinto set a 15 y el alargue con dos puntos', () => {
  const { validarSets } = require('../src/utils/cierreArbitral');
  const base = [{ home_points: 25, away_points: 20 }, { home_points: 20, away_points: 25 }, { home_points: 25, away_points: 22 }, { home_points: 22, away_points: 25 }];
  assert.equal(validarSets([...base, { home_points: 16, away_points: 14 }], { completo: true }).local, 3);
  assert.throws(() => validarSets([...base, { home_points: 17, away_points: 14 }], { completo: true }), /set 5/);
  assert.throws(() => validarSets([...base.slice(0, 1), { home_points: 25, away_points: 10 }, { home_points: 25, away_points: 10 }, { home_points: 25, away_points: 10 }], { completo: true }), /decidido/);
  assert.equal(validarSets(base.slice(0, 2), { completo: false }).sets.length, 2);
});

test('las evidencias de un partido no se consultan ni se cargan con una cuenta de asociación', async () => {
  assert.equal((await call('GET', `/api/matches/${PARTIDO}/evidence`, null, REPRE)).status, 403);
  const f = new FormData();
  f.append('file', new Blob([Buffer.from('%PDF-1.7\n')], { type: 'application/pdf' }), 'hoja.pdf');
  const res = await fetch(`${base}/api/matches/${PARTIDO}/evidence`, { method: 'POST', headers: encabezadosDe(REPRE), body: f });
  assert.equal(res.status, 403);
  assert.equal(fake.llamadas.filter((l) => l.tipo === 'storage').length, 0);
});

test('FECOVOL no puede subir como evidencia un archivo cuyo contenido no es PDF ni imagen', async () => {
  const f = new FormData();
  f.append('file', new Blob([Buffer.from('MZ ejecutable')], { type: 'application/pdf' }), 'hoja.pdf');
  const res = await fetch(`${base}/api/matches/${PARTIDO}/evidence`, { method: 'POST', headers: encabezadosDe(ADMIN), body: f });
  assert.equal(res.status, 400);
  assert.equal(fake.llamadas.filter((l) => l.tipo === 'storage').length, 0);
});

test('las actas del árbitro calculan su estado, marcador y hoja de anotación', async () => {
  const ayer = sumarDias(hoyCR(), -1);
  const p = (id, acta, extra = {}) => ({ id, match_number: 1, scheduled_date: ayer, scheduled_time: '19:00', status: 'PROGRAMADO', acta_status: acta, competencia: { id: 'c', name: 'Liga' }, local: { name: 'A' }, visitante: { name: 'B' }, ...extra });
  fake.alResponderTabla('persons', MI_PERSONA);
  fake.alResponderTabla('referee_assignments', { data: [
    { id: 'd1', status: 'CONFIRMADA', puesto: { code: 'PRI' }, partido: p(PARTIDO, 'BORRADOR') },
    { id: 'd2', status: 'CONFIRMADA', puesto: { code: 'PRI' }, partido: p(OTRO_PARTIDO, 'VALIDADA', { status: 'FINALIZADO', home_sets_won: 3, away_sets_won: 1 }) }
  ], error: null });
  fake.alResponderTabla('match_referee_reports', { data: [{ match_id: PARTIDO, status: 'DEVUELTO', sets: [], return_reason: 'Falta la hoja de anotación' }], error: null });
  fake.alResponderTabla('match_evidence', { data: [{ match_id: OTRO_PARTIDO }], error: null });

  const r = await call('GET', '/api/referees/me/actas', null, ARBITRO);
  assert.equal(r.status, 200);
  const porId = Object.fromEntries(r.json.data.map((a) => [a.partido.id, a]));
  assert.equal(porId[PARTIDO].estado, 'DEVUELTA');
  assert.equal(porId[PARTIDO].puede_cerrar, true);
  assert.equal(porId[PARTIDO].hoja_adjuntada, false);
  assert.equal(porId[OTRO_PARTIDO].estado, 'VALIDADA');
  assert.deepEqual(porId[OTRO_PARTIDO].marcador, [3, 1]);
  assert.equal(porId[OTRO_PARTIDO].puede_cerrar, false);
  const consulta = fake.llamadas.find((l) => l.tabla === 'referee_assignments');
  assert.ok(consulta.pasos.some((x) => x[0] === 'eq' && x[1] === 'person_id' && x[2] === PERSONA));
});
