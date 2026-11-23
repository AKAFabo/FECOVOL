// Pruebas unitarias para las funcionalidades del Estudiante 1 (FECOVOL):
// - Seguridad: Usuarios (RF-SEG-001, 002, 003, 004, 007, 009)
// - Seguridad: Roles y Permisos (RF-SEG-005, 006, 010, 011)
// - Catálogos y Listas de Valores (RF-AUD-001, RF-AUD-002)
// - Parámetros del Sistema (RF-AUD-001)
// - Bitácora / Auditoría (RF-AUD-003, RF-AUD-004)
// - Panel General de Administración (RF-ADM-001)
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

const UUID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_ROL = '77777777-7777-4777-8777-777777777777';

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

async function call(method, ruta, body, quien = ADMIN) {
  const headers = { 'Content-Type': 'application/json', ...encabezadosDe(quien) };
  const res = await fetch(base + ruta, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const tipo = res.headers.get('content-type') || '';
  const isJson = tipo.includes('json');
  const buffer = !isJson ? Buffer.from(await res.arrayBuffer()) : null;
  return {
    status: res.status,
    tipo,
    headers: res.headers,
    json: isJson ? await res.json() : null,
    text: buffer ? buffer.toString('utf-8') : null,
    bytes: buffer
  };
}

// ============================================================================
// 1. SEGURIDAD — USUARIOS (RF-SEG-001, 002, 003, 004, 007, 009)
// ============================================================================

test('RF-SEG-001: registrar intento fallido de login sin email devuelve isLocked: false', async () => {
  const r = await call('POST', '/api/users/record-failed-login', {}, null);
  assert.equal(r.status, 200);
  assert.equal(r.json.isLocked, false);
});

test('RF-SEG-001: registrar intento fallido de login con email calcula intentos restantes', async () => {
  const r = await call('POST', '/api/users/record-failed-login', { email: 'test@fecovol.cr' }, null);
  assert.equal(r.status, 200);
  assert.equal(r.json.isLocked, false);
  assert.ok(r.json.remainingAttempts <= 4);
});

test('RF-SEG-001: registrar login exitoso reinicia intentos para el usuario autenticado', async () => {
  const r = await call('POST', '/api/users/record-successful-login', {}, ADMIN);
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
});

test('RF-SEG-003: revocar otras sesiones exige autenticacion (401 sin sesion)', async () => {
  const r = await call('POST', '/api/users/revoke-other-sessions', {}, null);
  assert.equal(r.status, 401);
});

test('RF-SEG-004: invitar usuario sin ser Administrador da 403', async () => {
  const r = await call('POST', '/api/users/invite', { email: 'nuevo@fecovol.cr', full_name: 'Nuevo', rolesIds: [UUID_ROL] }, REPRE);
  assert.equal(r.status, 403);
});

test('RF-SEG-004: invitar usuario sin email o sin roles da 400', async () => {
  const r1 = await call('POST', '/api/users/invite', { full_name: 'Sin email', rolesIds: [UUID_ROL] }, ADMIN);
  assert.equal(r1.status, 400);

  const r2 = await call('POST', '/api/users/invite', { email: 'nuevo@fecovol.cr', full_name: 'Sin roles', status: 'ACTIVA', role_ids: [] }, ADMIN);
  assert.equal(r2.status, 400);
});

test('RF-SEG-006: cambiar de vista de rol activo sin role_id da 400', async () => {
  const r = await call('POST', '/api/users/switch-active-role', {}, ADMIN);
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('role_id es requerido'));
});

test('RF-SEG-006: cambiar de vista a un rol que el usuario no tiene asignado da 403', async () => {
  // Simulamos que el usuario representante no tiene el rol solicitado
  fake.alResponderTabla('user_profiles', {
    data: { id: REPRE.id, email: REPRE.email, status: 'ACTIVA', role_id: UUID_ROL },
    error: null
  });
  fake.alResponderTabla('user_roles', { data: [], error: null });

  const r = await call('POST', '/api/users/switch-active-role', { role_id: UUID_1 }, REPRE);
  assert.equal(r.status, 403);
  assert.ok(r.json.error.includes('No tiene asignado el rol'));
});

// ============================================================================
// 2. SEGURIDAD — ROLES Y PERMISOS (RF-SEG-005, RF-SEG-006, RF-SEG-010)
// ============================================================================

test('RF-SEG-005: listar roles del sistema devuelve array de roles para usuario autenticado', async () => {
  fake.alResponderTabla('roles', {
    data: [
      { id: UUID_1, name: 'Administrador', description: 'Acceso total' },
      { id: UUID_2, name: 'Representante', description: 'Gestión asociación' }
    ],
    error: null
  });

  const r = await call('GET', '/api/roles', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
  assert.equal(r.json.data.length, 2);
});

test('RF-SEG-005: crear un rol sin nombre da 400', async () => {
  const r = await call('POST', '/api/roles', { description: 'Sin nombre' }, ADMIN);
  assert.equal(r.status, 400);
});

test('RF-SEG-005: crear un rol con usuario no administrador da 403', async () => {
  const r = await call('POST', '/api/roles', { name: 'Comisión Especial' }, REPRE);
  assert.equal(r.status, 403);
});

test('RF-SEG-005: eliminar un rol que tiene usuarios asignados da 400 para prevenir inconsistencia', async () => {
  fake.alResponderTabla('roles', { data: { id: UUID_ROL, name: 'Comisión' }, error: null });
  // Call 1 a user_roles es en scopeOrganization; Call 2 es en authorize.js; Call 3 es en el endpoint verificando usuarios asignados
  fake.alResponderTabla('user_roles', { data: [] }, { data: [] }, { data: [], count: 2, error: null });

  const r = await call('DELETE', `/api/roles/${UUID_ROL}`, null, ADMIN);
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('asignada'));
});

// ============================================================================
// 3. CATÁLOGOS Y CONSISTENCIA HISTÓRICA (RF-AUD-001, RF-AUD-002)
// ============================================================================

test('RF-AUD-001: listar catalogos devuelve la lista con conteo de valores', async () => {
  fake.alResponderTabla('catalogs', {
    data: [
      {
        id: UUID_1,
        name: 'Categorías de juego',
        description: 'Edades y niveles',
        catalog_values: [{ id: 'val-1', is_active: true }]
      }
    ],
    error: null
  });

  const r = await call('GET', '/api/catalogs', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
  assert.equal(r.json.data[0].name, 'Categorías de juego');
  assert.equal(r.json.data[0].total_values, 1);
  assert.equal(r.json.data[0].active_values, 1);
});

test('RF-AUD-001: crear catalogo sin nombre da 400', async () => {
  const r = await call('POST', '/api/catalogs', { description: 'Sin nombre' }, ADMIN);
  assert.equal(r.status, 400);
});

test('RF-AUD-001: agregar valor a catalogo sin codigo o sin valor da 400', async () => {
  const r1 = await call('POST', `/api/catalogs/${UUID_1}/values`, { value: 'Mayor' }, ADMIN);
  assert.equal(r1.status, 400);

  const r2 = await call('POST', `/api/catalogs/${UUID_1}/values`, { code: 'MAYOR' }, ADMIN);
  assert.equal(r2.status, 400);
});

test('RF-AUD-002: inactivar valor de catalogo preserva consistencia historica via soft-delete', async () => {
  // Pasar las 3 respuestas secuenciales para catalog_values en una sola llamada:
  // 1. Consulta del valor actual
  // 2. Conteo de valores activos en el catálogo (> 1 para permitir desactivar)
  // 3. Actualización a nuevo estado inactivo
  fake.alResponderTabla(
    'catalog_values',
    {
      data: { id: UUID_1, catalog_id: UUID_2, code: 'SUB21', value: 'Sub-21', is_active: true, catalogs: { id: UUID_2, name: 'Categorías' } },
      error: null
    },
    {
      data: [],
      count: 2,
      error: null
    },
    {
      data: { id: UUID_1, code: 'SUB21', value: 'Sub-21', is_active: false },
      error: null
    }
  );

  // Dependencias: teams, persons, etc. vacíos
  fake.alResponderTabla('teams', { data: [] }, { data: [] }, { data: [] });
  fake.alResponderTabla('persons', { data: [] });
  fake.alResponderTabla('team_members', { data: [] });
  fake.alResponderTabla('documents', { data: [] });
  fake.alResponderTabla('referee_assignments', { data: [] });

  const r = await call('PATCH', `/api/catalogs/values/${UUID_1}/toggle`, {}, ADMIN);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.is_active, false);
});

// ============================================================================
// 4. PARÁMETROS DEL SISTEMA (RF-AUD-001)
// ============================================================================

test('RF-AUD-001 (Parámetros): listar parametros devuelve valores y tipos normalizados', async () => {
  fake.alResponderTabla('system_parameters', {
    data: [
      { id: UUID_1, name: 'PUNTOS_VICTORIA', value: '3', data_type: 'NUMBER', is_active: true }
    ],
    error: null
  });

  const r = await call('GET', '/api/parameters', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
  assert.equal(r.json.data[0].name, 'PUNTOS_VICTORIA');
  assert.equal(r.json.data[0].data_type, 'NUMBER');
});

test('RF-AUD-001 (Parámetros): usuario no administrador no puede registrar parámetros (403)', async () => {
  const r = await call('POST', '/api/parameters', {
    name: 'NUEVO_PARAMETRO',
    value: '10',
    data_type: 'NUMBER'
  }, REPRE);
  assert.equal(r.status, 403);
});

test('RF-AUD-001 (Parámetros): crear parametro tipo NUMBER con texto alfabético da 400', async () => {
  const r = await call('POST', '/api/parameters', {
    name: 'TIEMPO_ESPERA',
    value: 'invalido_no_numero',
    data_type: 'NUMBER'
  }, ADMIN);
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('número válido'));
});

test('RF-AUD-001 (Parámetros): crear parametro tipo BOOLEAN con valor no booleano da 400', async () => {
  const r = await call('POST', '/api/parameters', {
    name: 'ACTIVAR_MODO_ESTRICTO',
    value: 'tal_vez',
    data_type: 'BOOLEAN'
  }, ADMIN);
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('true" o "false'));
});

// ============================================================================
// 5. BITÁCORA Y AUDITORÍA (RF-AUD-003, RF-AUD-004)
// ============================================================================

test('RF-AUD-004: usuario no administrador recibe 403 al intentar consultar la bitácora', async () => {
  const r = await call('GET', '/api/audit', null, REPRE);
  assert.equal(r.status, 403);
});

test('RF-AUD-004: administrador puede consultar bitacora paginada y filtrada', async () => {
  fake.alResponderTabla('audit_logs', {
    data: [
      { id: UUID_1, usuario: 'admin@fecovol.cr', accion: 'UPDATE', tabla: 'user_profiles', fecha_hora: '2026-11-22T10:00:00Z' }
    ],
    count: 1,
    error: null
  });

  const r = await call('GET', '/api/audit?page=1&limit=10&tabla=user_profiles', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.data));
  assert.equal(r.json.total, 1);
  assert.equal(r.json.page, 1);
});

test('RF-AUD-004: earliest-date devuelve la fecha mas antigua registrada en la bitacora', async () => {
  fake.alResponderTabla('audit_logs', {
    data: { fecha_hora: '2026-01-01T00:00:00Z' },
    error: null
  });

  const r = await call('GET', '/api/audit/earliest-date', null, ADMIN);
  assert.equal(r.status, 200);
  assert.equal(r.json.earliestDate, '2026-01-01T00:00:00Z');
});

test('RF-AUD-004: exportar bitacora genera archivo CSV con formato UTF-8 y encabezados RFC 4180', async () => {
  fake.alResponderTabla('audit_logs', {
    data: [
      {
        id: UUID_1,
        fecha_hora: '2026-11-22T10:00:00Z',
        usuario: 'admin@fecovol.cr',
        accion: 'INSERT',
        tabla: 'associations',
        registro_id: UUID_2,
        registro_nuevo: { evento: 'Creación de asociación' },
        registro_viejo: null
      }
    ],
    error: null
  });

  const r = await call('GET', '/api/audit/export', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(r.tipo.includes('text/csv'));
  // Verificar prefijo BOM (EF BB BF) para Excel
  assert.equal(r.bytes[0], 0xEF);
  assert.equal(r.bytes[1], 0xBB);
  assert.equal(r.bytes[2], 0xBF);
  assert.ok(r.text.includes('"admin@fecovol.cr"'));
  assert.ok(r.text.includes('"associations"'));
});

// ============================================================================
// 6. PANEL GENERAL DE ADMINISTRACIÓN (RF-ADM-001)
// ============================================================================

test('RF-ADM-001: usuario sin rol Administrador recibe 403 al consultar admin-dashboard', async () => {
  const r = await call('GET', '/api/reports/admin-dashboard', null, REPRE);
  assert.equal(r.status, 403);
  assert.ok(r.json.error.includes('Solo el personal administrador'));
});

test('RF-ADM-001: administrador obtiene resumen ejecutivo con asociaciones, padron, competencias y alertas', async () => {
  // 1. Asociaciones
  fake.alResponderTabla('associations', {
    data: [
      { id: UUID_1, name: 'Asociación Central', short_name: 'AC', status: 'AFILIADA', province: 'San José' },
      { id: UUID_2, name: 'Asociación Norte', short_name: 'AN', status: 'PROVISIONAL', province: 'Alajuela' }
    ],
    error: null
  });
  // 2. Documentos de asociaciones (v_documentos)
  fake.alResponderTabla('v_documentos', {
    data: [
      { owner_association_id: UUID_1, status: 'VIGENTE', expiry_date: '2027-01-01' },
      { owner_association_id: UUID_2, status: 'VENCIDO', expiry_date: '2025-01-01' }
    ],
    error: null
  });
  // 3. Competencias
  fake.alResponderTabla('competitions', {
    data: [
      { id: UUID_1, name: 'Torneo Apertura 2026', season: '2026', status: 'EN_CURSO' }
    ],
    error: null
  });
  // 4. Partidos
  fake.alResponderTabla('matches', {
    data: [
      { id: UUID_1, scheduled_date: '2026-11-22', scheduled_time: '18:00', status: 'FINALIZADO', home_sets_won: 3, away_sets_won: 1 }
    ],
    error: null
  });
  // 5. Alertas de documentos
  fake.alResponderTabla('documents', {
    data: [
      { id: UUID_1, file_name: 'personeria.pdf', status: 'EN_REVISION', expiry_date: '2026-12-31' }
    ],
    error: null
  });

  const r = await call('GET', '/api/reports/admin-dashboard', null, ADMIN);
  assert.equal(r.status, 200);
  assert.ok(r.json.data);
  assert.ok(r.json.data.asociaciones);
  assert.equal(r.json.data.asociaciones.total, 2);
  assert.equal(r.json.data.asociaciones.afiliadas, 1);
  assert.ok(r.json.data.padronPersonas);
  assert.ok(r.json.data.competencias);
  assert.equal(r.json.data.competencias.totalEnCurso, 1);
  assert.ok(r.json.data.alertas);
});
