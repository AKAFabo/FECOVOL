const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRIORIDAD_ROLES,
  obtenerPuntuacionRol,
  normalizarNombreRol,
  obtenerRolMayorPrioridad
} = require('../src/utils/rolesPrioridad');

test('normalizarNombreRol remueve tildes, mayúsculas y espacios', () => {
  assert.equal(normalizarNombreRol('  Árbitro  '), 'arbitro');
  assert.equal(normalizarNombreRol('Administrador'), 'administrador');
  assert.equal(normalizarNombreRol('Representante '), 'representante');
  assert.equal(normalizarNombreRol('Personal'), 'personal');
});

test('jerarquía de prioridad: Administrador (1) > Representante (2) > Personal (3) > Árbitro (4)', () => {
  assert.equal(obtenerPuntuacionRol('Administrador'), 1);
  assert.equal(obtenerPuntuacionRol('admin'), 1);
  assert.equal(obtenerPuntuacionRol('Representante'), 2);
  assert.equal(obtenerPuntuacionRol('Personal'), 3);
  assert.equal(obtenerPuntuacionRol('Arbitro'), 4);
  assert.equal(obtenerPuntuacionRol('Árbitro'), 4);
  assert.equal(obtenerPuntuacionRol('CualquierOtro'), 99);

  assert.ok(obtenerPuntuacionRol('Administrador') < obtenerPuntuacionRol('Representante'));
  assert.ok(obtenerPuntuacionRol('Representante') < obtenerPuntuacionRol('Personal'));
  assert.ok(obtenerPuntuacionRol('Personal') < obtenerPuntuacionRol('Arbitro'));
});

test('obtenerRolMayorPrioridad selecciona el rol de mayor prioridad', async () => {
  const mockRoles = [
    { id: 'uuid-arbitro', name: 'Arbitro' },
    { id: 'uuid-personal', name: 'Personal' },
    { id: 'uuid-repre', name: 'Representante' },
    { id: 'uuid-admin', name: 'Administrador' }
  ];

  const fakeSupabase = {
    from: (table) => {
      assert.equal(table, 'roles');
      return {
        select: () => ({
          in: async (col, ids) => {
            const filtrados = mockRoles.filter(r => ids.includes(r.id));
            return { data: filtrados, error: null };
          }
        })
      };
    }
  };

  // 1. Admin junto con Representante y Arbitro -> Elige Admin
  const prio1 = await obtenerRolMayorPrioridad(['uuid-arbitro', 'uuid-repre', 'uuid-admin'], fakeSupabase);
  assert.equal(prio1, 'uuid-admin');

  // 2. Representante junto con Personal y Arbitro -> Elige Representante
  const prio2 = await obtenerRolMayorPrioridad(['uuid-arbitro', 'uuid-personal', 'uuid-repre'], fakeSupabase);
  assert.equal(prio2, 'uuid-repre');

  // 3. Personal junto con Arbitro -> Elige Personal
  const prio3 = await obtenerRolMayorPrioridad(['uuid-arbitro', 'uuid-personal'], fakeSupabase);
  assert.equal(prio3, 'uuid-personal');

  // 4. Solo Arbitro -> Elige Arbitro
  const prio4 = await obtenerRolMayorPrioridad(['uuid-arbitro'], fakeSupabase);
  assert.equal(prio4, 'uuid-arbitro');
});
