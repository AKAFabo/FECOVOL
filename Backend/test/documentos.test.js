// Pruebas de documentos y licencias: carga a Storage privado, ámbito y enlaces firmados.
// Ejecutar con: npm test
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crearFake = require('./fakeSupabase');

const fake = crearFake();
const rutaConfig = require.resolve(path.join(__dirname, '../src/config/supabase'));
require.cache[rutaConfig] = { id: rutaConfig, filename: rutaConfig, loaded: true, exports: fake };

const app = require('../src/app');
const { limpiarCache } = require('../src/middleware/authenticate');
const { limpiarCacheLimites, detectarTipo, nombreSeguro } = require('../src/utils/archivos');
const { ASO_PROPIA, ADMIN, REPRE, ARBITRO, registrarUsuarios, encabezadosDe } = require('./usuarios');

const PERSONA = '44444444-4444-4444-8444-444444444444';
const EQUIPO = '55555555-5555-4555-8555-555555555555';
const OTRA_ASO = '66666666-6666-4666-8666-666666666666';
const DOC = '77777777-7777-4777-8777-777777777777';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);

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
  limpiarCacheLimites();
  registrarUsuarios(fake);
});

function formulario(campos, archivo = PDF, nombre = 'constancia.pdf', tipo = 'application/pdf') {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  if (archivo) f.append('archivo', new Blob([archivo], { type: tipo }), nombre);
  return f;
}

async function subir(campos, quien = REPRE, ...archivo) {
  const res = await fetch(`${base}/api/documents`, { method: 'POST', headers: encabezadosDe(quien), body: formulario(campos, ...archivo) });
  return { status: res.status, json: await res.json() };
}

async function get(ruta, quien = REPRE) {
  const res = await fetch(base + ruta, { headers: encabezadosDe(quien) });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

const storage = (accion) => fake.llamadas.filter((l) => l.tipo === 'storage' && l.accion === accion);
const rpcs = () => fake.llamadas.filter((l) => l.tipo === 'rpc');

// Respuestas mínimas para una carga válida de un documento de PERSONA de la asociación propia.
function prepararCargaValida() {
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: ASO_PROPIA }, error: null });
  fake.alResponderTabla('catalog_values', { data: { id: 'x', is_active: true }, error: null });
  fake.alResponderTabla('system_parameters', {
    data: [
      { name: 'EVIDENCIAS_TAMANO_MAXIMO_MB', value: '10', is_active: true },
      { name: 'EVIDENCIAS_FORMATOS_PERMITIDOS', value: 'PDF, JPG, PNG', is_active: true }
    ],
    error: null
  });
  fake.alResponderRpc('sp_upload_document', { data: DOC, error: null });
  fake.alResponderTabla('v_documentos', {
    data: { id: DOC, file_url: `storage://documentos/personas/${PERSONA}/a.pdf`, file_name: 'constancia.pdf', status: 'EN_REVISION', person_id: PERSONA, owner_association_id: ASO_PROPIA, tipo_code: 'MED', tipo_value: 'Constancia médica deportiva' },
    error: null
  });
}

test('el tipo de archivo se decide por su contenido, no por el nombre', () => {
  assert.equal(detectarTipo(PDF).formato, 'PDF');
  assert.equal(detectarTipo(PNG).formato, 'PNG');
  assert.equal(detectarTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).formato, 'JPG');
  assert.equal(detectarTipo(EXE), null);
});

test('el nombre guardado no trae rutas, caracteres de control ni otra extension', () => {
  assert.equal(nombreSeguro('../../etc/pass"wd\r\n.exe', 'pdf'), 'passwd.pdf');
  assert.equal(nombreSeguro('', 'png'), 'documento.png');
  assert.equal(nombreSeguro('Constancia médica.PDF', 'pdf'), 'Constancia médica.pdf');
});

test('un representante sube un documento de su persona: va al bucket privado y se guarda la ruta interna', async () => {
  prepararCargaValida();
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA, expiry_date: '2027-12-31' });

  assert.equal(r.status, 201);
  const [subida] = storage('upload');
  assert.equal(subida.bucket, 'documentos');
  assert.match(subida.ruta, new RegExp(`^personas/${PERSONA}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(subida.opciones.contentType, 'application/pdf');
  assert.equal(subida.opciones.upsert, false);

  const [llamada] = rpcs();
  assert.equal(llamada.params.p_file_url, `storage://documentos/${subida.ruta}`);
  assert.equal(llamada.params.p_admin_user, REPRE.email);
  assert.equal(llamada.params.p_file_name, 'constancia.pdf');

  // La respuesta no expone la ruta interna del archivo.
  assert.equal(r.json.data.file_url, undefined);
  assert.equal(r.json.data.tiene_archivo, true);
});

test('un archivo que no es PDF, JPG ni PNG se rechaza aunque diga .pdf', async () => {
  prepararCargaValida();
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA }, REPRE, EXE, 'virus.pdf', 'application/pdf');
  assert.equal(r.status, 415);
  assert.equal(storage('upload').length, 0);
  assert.equal(rpcs().length, 0);
});

test('el tamaño maximo sale de los parametros del sistema', async () => {
  prepararCargaValida();
  fake.alResponderTabla('system_parameters', { data: [{ name: 'EVIDENCIAS_TAMANO_MAXIMO_MB', value: '0.0001', is_active: true }], error: null });
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 413);
  assert.equal(storage('upload').length, 0);
});

test('un representante no puede subir documentos a una persona de otra asociacion', async () => {
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: OTRA_ASO }, error: null });
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 403);
  assert.equal(storage('upload').length, 0);
});

test('tampoco a una persona sin asociacion', async () => {
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: null }, error: null });
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 403);
});

test('un arbitro no puede subir documentos', async () => {
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA }, ARBITRO);
  assert.equal(r.status, 403);
  assert.equal(storage('upload').length, 0);
});

test('sin sesion no se puede subir', async () => {
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA }, null);
  assert.equal(r.status, 401);
});

test('un documento con dos titulares da 400', async () => {
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA, team_id: EQUIPO });
  assert.equal(r.status, 400);
});

test('vencimiento anterior a la emision da 400', async () => {
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA, issue_date: '2026-05-01', expiry_date: '2026-01-01' });
  assert.equal(r.status, 400);
});

test('un tipo de documento inactivo o inexistente da 400', async () => {
  fake.alResponderTabla('persons', { data: { id: PERSONA, association_id: ASO_PROPIA }, error: null });
  fake.alResponderTabla('catalog_values', { data: { id: 'x', is_active: false }, error: null });
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 400);
  assert.equal(storage('upload').length, 0);
});

test('si el procedimiento falla, el archivo subido se borra del bucket', async () => {
  prepararCargaValida();
  fake.alResponderRpc('sp_upload_document', { data: null, error: { code: 'P0001', message: 'Error de prueba' } });
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 400);
  const [subida] = storage('upload');
  const [borrado] = storage('remove');
  assert.deepEqual(borrado.rutas, [subida.ruta]);
});

test('si Storage no responde, no se crea el registro', async () => {
  prepararCargaValida();
  fake.storage.fallarSubida = true;
  const r = await subir({ document_type_code: 'MED', person_id: PERSONA });
  assert.equal(r.status, 503);
  assert.equal(rpcs().length, 0);
});

test('el listado de un representante se limita a lo que es de su asociacion', async () => {
  fake.alResponderTabla('v_documentos', { data: [], error: null });
  const r = await get('/api/documents');
  assert.equal(r.status, 200);
  const consulta = fake.llamadas.find((l) => l.tabla === 'v_documentos');
  assert.ok(consulta.pasos.some((p) => p[0] === 'eq' && p[1] === 'owner_association_id' && p[2] === ASO_PROPIA));
});

test('pedir documentos de otra asociacion da 403', async () => {
  const r = await get(`/api/documents?association_id=${OTRA_ASO}`);
  assert.equal(r.status, 403);
});

test('el arbitro no ve documentos', async () => {
  const r = await get('/api/documents', ARBITRO);
  assert.equal(r.status, 403);
});

test('abrir un archivo propio da un enlace firmado de corta duracion y sin cache', async () => {
  fake.alResponderTabla('v_documentos', { data: { id: DOC, file_url: 'storage://documentos/personas/x/a.pdf', file_name: 'a.pdf', owner_association_id: ASO_PROPIA }, error: null });
  const r = await get(`/api/documents/${DOC}/archivo`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const [firma] = storage('firmar');
  assert.equal(firma.ruta, 'personas/x/a.pdf');
  assert.ok(firma.segundos <= 300);
  assert.match(r.json.data.url, /^https:\/\/firmado\.test\//);
});

test('abrir un archivo de otra asociacion da 403 y no se firma nada', async () => {
  fake.alResponderTabla('v_documentos', { data: { id: DOC, file_url: 'storage://documentos/personas/x/a.pdf', file_name: 'a.pdf', owner_association_id: OTRA_ASO }, error: null });
  const r = await get(`/api/documents/${DOC}/archivo`);
  assert.equal(r.status, 403);
  assert.equal(storage('firmar').length, 0);
});

test('el administrador abre cualquier archivo', async () => {
  fake.alResponderTabla('v_documentos', { data: { id: DOC, file_url: 'storage://documentos/equipos/x/a.png', file_name: 'a.png', owner_association_id: OTRA_ASO }, error: null });
  const r = await get(`/api/documents/${DOC}/archivo`, ADMIN);
  assert.equal(r.status, 200);
});

test('rechazar un documento exige indicar el motivo', async () => {
  const res = await fetch(`${base}/api/documents/${DOC}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...encabezadosDe(ADMIN) },
    body: JSON.stringify({ status: 'RECHAZADO' })
  });
  assert.equal(res.status, 400);
});

test('un representante no puede revisar documentos', async () => {
  const res = await fetch(`${base}/api/documents/${DOC}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...encabezadosDe(REPRE) },
    body: JSON.stringify({ status: 'VIGENTE' })
  });
  assert.equal(res.status, 403);
});
