/**
 * Prueba de humo de la API del frente Asociaciones y Arbitraje.
 * Levante el servidor (npm run dev) y ejecute: npm run smoke
 * Crea una asociacion de prueba, un equipo, una persona, la agrega a la nomina,
 * sube y revisa un documento, designa un arbitro y deja todo en estado consultable.
 */
const BASE = process.env.API_URL || 'http://localhost:4000';
const USER = 'smoke@fecovol.cr';

let ok = 0;
let fail = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-email': USER },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function check(nombre, condicion, extra) {
  if (condicion) {
    ok++;
    console.log('  ok  ', nombre);
  } else {
    fail++;
    console.log('  FALLO', nombre, extra ? JSON.stringify(extra) : '');
  }
}

(async () => {
  const sufijo = Date.now().toString().slice(-6);

  console.log('\n1. Catalogos');
  const cat = await call('GET', '/api/catalogs');
  check('lista de catalogos', cat.status === 200 && cat.json.data.length >= 9, cat.json);
  const pos = await call('GET', '/api/catalogs/Posiciones/values');
  check('valores de Posiciones', pos.status === 200 && pos.json.data.length >= 5, pos.json);

  console.log('\n2. Asociacion');
  const asoc = await call('POST', '/api/associations', {
    name: 'Asociacion de prueba ' + sufijo,
    tax_id: '3-002-' + sufijo,
    province: 'San Jose',
    canton: 'Central',
    email: 'prueba' + sufijo + '@test.cr',
    status: 'AFILIADA'
  });
  check('crear asociacion', asoc.status === 201, asoc.json);
  const asocId = asoc.json.data && asoc.json.data.id;

  const dup = await call('POST', '/api/associations', {
    name: 'Duplicada', tax_id: '3-002-' + sufijo
  });
  check('cedula juridica repetida da 409', dup.status === 409, dup.json);

  const junta = await call('POST', `/api/associations/${asocId}/board`, {
    position: 'Presidencia', full_name: 'Persona de prueba', email: 'presi' + sufijo + '@test.cr'
  });
  check('agregar cargo de junta directiva', junta.status === 201, junta.json);

  console.log('\n3. Equipo');
  const team = await call('POST', '/api/teams', {
    association_id: asocId,
    name: 'Equipo prueba ' + sufijo,
    category_code: 'MAYOR',
    branch_code: 'FEM',
    modality_code: 'SALA'
  });
  check('crear equipo', team.status === 201, team.json);
  const teamId = team.json.data && team.json.data.id;

  console.log('\n4. Persona y nomina');
  const persona = await call('POST', '/api/persons', {
    document_type_code: 'CED',
    document_number: '9-' + sufijo + '-0001',
    first_name: 'Ana',
    last_name: 'Prueba Prueba',
    birth_date: '2004-01-01',
    sex: 'F',
    association_id: asocId,
    roles: ['JUGADOR']
  });
  check('crear persona', persona.status === 201, persona.json);
  const personaId = persona.json.data && persona.json.data.id;

  const miembro = await call('POST', `/api/teams/${teamId}/members`, {
    person_id: personaId, member_type: 'JUGADOR', position_code: 'ARM', jersey_number: 5
  });
  check('agregar a la nomina', miembro.status === 201, miembro.json);

  const repetido = await call('POST', `/api/teams/${teamId}/members`, {
    person_id: personaId, member_type: 'JUGADOR', position_code: 'CEN', jersey_number: 6
  });
  check('no deja repetir a la persona en el equipo', repetido.status === 409, repetido.json);

  const nomina = await call('GET', `/api/teams/${teamId}/members`);
  check('nomina con 1 integrante', nomina.status === 200 && nomina.json.total === 1, nomina.json);

  console.log('\n5. Documentos');
  const doc = await call('POST', '/api/documents', {
    document_type_code: 'MED',
    file_url: 'https://storage/prueba.pdf',
    file_name: 'constancia.pdf',
    person_id: personaId,
    expiry_date: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  });
  check('subir documento', doc.status === 201, doc.json);
  const docId = doc.json.data && doc.json.data.id;

  const malDoc = await call('POST', '/api/documents', {
    document_type_code: 'MED', file_url: 'x', person_id: personaId, team_id: teamId
  });
  check('rechaza documento con dos duenos', malDoc.status === 400, malDoc.json);

  const revisado = await call('PATCH', `/api/documents/${docId}/review`, { status: 'VIGENTE' });
  check('revisar documento', revisado.status === 200 && revisado.json.data.status === 'VIGENTE', revisado.json);

  const porVencer = await call('GET', '/api/documents?por_vencer=30');
  check('documentos por vencer', porVencer.status === 200 && porVencer.json.total >= 1, porVencer.json);

  console.log('\n6. Designaciones arbitrales');
  const arbitro = await call('POST', '/api/persons', {
    document_type_code: 'CED',
    document_number: '9-' + sufijo + '-0002',
    first_name: 'Carlos',
    last_name: 'Arbitro Prueba',
    birth_date: '1990-01-01',
    roles: ['ARBITRO']
  });
  const arbitroId = arbitro.json.data && arbitro.json.data.id;
  check('crear arbitro', arbitro.status === 201, arbitro.json);

  const matchId = crypto.randomUUID();
  const desig = await call('POST', '/api/referee-assignments', {
    match_id: matchId, person_id: arbitroId, official_type_code: 'PRI'
  });
  check('designar arbitro', desig.status === 201, desig.json);

  const noArbitro = await call('POST', '/api/referee-assignments', {
    match_id: matchId, person_id: personaId, official_type_code: 'SEG'
  });
  check('no designa a quien no es arbitro', noArbitro.status === 400, noArbitro.json);

  const confirm = await call('PATCH', `/api/referee-assignments/${desig.json.data.id}`, { status: 'CONFIRMADA' });
  check('confirmar designacion', confirm.status === 200 && confirm.json.data.status === 'CONFIRMADA', confirm.json);

  const soloArbitros = await call('GET', '/api/persons?role=ARBITRO&q=Arbitro Prueba');
  check('filtro de personas por rol', soloArbitros.status === 200 &&
    soloArbitros.json.data.every((p) => p.person_roles.some((r) => r.role_type === 'ARBITRO')), soloArbitros.json);

  console.log('\n7. Consultas');
  const ficha = await call('GET', `/api/persons/${personaId}`);
  check('ficha de persona con equipos y documentos',
    ficha.status === 200 && ficha.json.data.equipos.length === 1 && ficha.json.data.documentos.length === 1, ficha.json);

  const detalle = await call('GET', `/api/associations/${asocId}`);
  check('detalle de asociacion con totales',
    detalle.status === 200 && detalle.json.data.total_equipos === 1 && detalle.json.data.total_personas === 1, detalle.json);

  const noExiste = await call('GET', '/api/associations/00000000-0000-0000-0000-000000000000');
  check('id inexistente da 404', noExiste.status === 404, noExiste.json);

  const idMalo = await call('GET', '/api/teams/no-es-un-uuid');
  check('id con formato invalido da 400', idMalo.status === 400, idMalo.json);

  console.log(`\nResultado: ${ok} ok, ${fail} fallidos`);
  console.log(`Datos de prueba creados con el sufijo ${sufijo}.`);
  process.exit(fail === 0 ? 0 : 1);
})();
