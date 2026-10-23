const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const authorize = require('../middleware/authorize');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('valueId', validateUuidParams);

/**
 * Calcula dependencias de un conjunto de IDs de valores de catálogo (RF-AUD-002)
 * Tablas vinculadas:
 * - teams: category_value_id, branch_value_id, modality_value_id
 * - persons: document_type_value_id
 * - team_members: position_value_id
 * - documents: document_type_value_id
 * - referee_assignments: official_type_value_id
 */
async function getDependenciesForValues(valueIds) {
  if (!valueIds || valueIds.length === 0) return {};

  const [
    { data: teamsCat },
    { data: teamsBranch },
    { data: teamsMod },
    { data: personsDoc },
    { data: membersPos },
    { data: docsType },
    { data: refAssigns }
  ] = await Promise.all([
    supabase.from('teams').select('category_value_id').in('category_value_id', valueIds),
    supabase.from('teams').select('branch_value_id').in('branch_value_id', valueIds),
    supabase.from('teams').select('modality_value_id').in('modality_value_id', valueIds),
    supabase.from('persons').select('document_type_value_id').in('document_type_value_id', valueIds),
    supabase.from('team_members').select('position_value_id').in('position_value_id', valueIds),
    supabase.from('documents').select('document_type_value_id').in('document_type_value_id', valueIds),
    supabase.from('referee_assignments').select('official_type_value_id').in('official_type_value_id', valueIds)
  ]);

  const map = {};
  for (const id of valueIds) {
    map[id] = {
      total: 0,
      teams: 0,
      persons: 0,
      members: 0,
      documents: 0,
      referees: 0
    };
  }

  (teamsCat || []).forEach(r => {
    if (map[r.category_value_id]) {
      map[r.category_value_id].teams++;
      map[r.category_value_id].total++;
    }
  });
  (teamsBranch || []).forEach(r => {
    if (map[r.branch_value_id]) {
      map[r.branch_value_id].teams++;
      map[r.branch_value_id].total++;
    }
  });
  (teamsMod || []).forEach(r => {
    if (map[r.modality_value_id]) {
      map[r.modality_value_id].teams++;
      map[r.modality_value_id].total++;
    }
  });
  (personsDoc || []).forEach(r => {
    if (map[r.document_type_value_id]) {
      map[r.document_type_value_id].persons++;
      map[r.document_type_value_id].total++;
    }
  });
  (membersPos || []).forEach(r => {
    if (map[r.position_value_id]) {
      map[r.position_value_id].members++;
      map[r.position_value_id].total++;
    }
  });
  (docsType || []).forEach(r => {
    if (map[r.document_type_value_id]) {
      map[r.document_type_value_id].documents++;
      map[r.document_type_value_id].total++;
    }
  });
  (refAssigns || []).forEach(r => {
    if (map[r.official_type_value_id]) {
      map[r.official_type_value_id].referees++;
      map[r.official_type_value_id].total++;
    }
  });

  return map;
}

// ==========================================
// 1. CONSULTA DE CATÁLOGOS Y VALORES
// ==========================================

// GET /api/catalogs -> lista completa de catálogos con estadísticas de valores (RF-AUD-001)
router.get('/', asyncHandler(async (req, res) => {
  const { data: cats, error: errCats } = await supabase
    .from('catalogs')
    .select(`
      id,
      name,
      description,
      created_at,
      catalog_values ( id, is_active )
    `)
    .order('name');

  const err = fromSupabase(errCats, 'Catálogos');
  if (err) throw err;

  const formateados = (cats || []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    created_at: c.created_at,
    total_values: c.catalog_values?.length || 0,
    active_values: c.catalog_values?.filter((v) => v.is_active).length || 0
  }));

  res.json({ data: formateados });
}));

// GET /api/catalogs/:nameOrId/values -> valores de un catálogo (por nombre o UUID) con dependencias (RF-AUD-002)
router.get('/:nameOrId/values', asyncHandler(async (req, res) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.nameOrId);

  if (isUuid) {
    // Si se pasa UUID, retornar todos los valores enriquecidos con conteo de dependencias (panel administrativo RF-AUD-002)
    const { data: vals, error } = await supabase
      .from('catalog_values')
      .select('*')
      .eq('catalog_id', req.params.nameOrId)
      .order('value');

    const err = fromSupabase(error, 'Valores de Catálogo');
    if (err) throw err;

    const valueIds = (vals || []).map((v) => v.id);
    const depMap = await getDependenciesForValues(valueIds);
    const activeCount = (vals || []).filter((v) => v.is_active).length;

    const enriched = (vals || []).map((v) => {
      const deps = depMap[v.id] || { total: 0, teams: 0, persons: 0, members: 0, documents: 0, referees: 0 };
      return {
        ...v,
        dependency_count: deps.total,
        dependencies: deps,
        is_last_active: v.is_active && activeCount === 1
      };
    });

    return res.json({ data: enriched });
  }

  // Si se pasa nombre, retornar solo valores activos (para llenar selects de formularios)
  const { data, error } = await supabase
    .from('catalog_values')
    .select('id, code, value, description, is_active, catalogs!inner(name)')
    .eq('catalogs.name', req.params.nameOrId)
    .eq('is_active', true)
    .order('value');

  const err = fromSupabase(error, 'Valores de Catálogo');
  if (err) throw err;

  res.json({ data: data.map(({ catalogs, ...v }) => v) });
}));

// GET /api/catalogs/values/:valueId/dependencies -> Consultar dependencias directas de un valor específico (RF-AUD-002)
router.get('/values/:valueId/dependencies', asyncHandler(async (req, res) => {
  const depMap = await getDependenciesForValues([req.params.valueId]);
  const deps = depMap[req.params.valueId] || { total: 0, teams: 0, persons: 0, members: 0, documents: 0, referees: 0 };
  res.json({ data: deps });
}));

// ==========================================
// 2. GESTIÓN DE VALORES DE CATÁLOGO (RF-AUD-001)
// ==========================================

// PUT /api/catalogs/values/:valueId -> Editar valor existente (código, valor/etiqueta, descripción, estado)
router.put('/values/:valueId', authorize(['Administrador', 'Personal']), asyncHandler(async (req, res) => {
  const { code, value, description, is_active, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (!code || !code.trim() || !value || !value.trim()) {
    throw new HttpError(400, 'El código y el valor/etiqueta son obligatorios.');
  }

  const codigoLimpio = code.trim().toUpperCase();
  const valorLimpio = value.trim();

  // Obtener el valor actual para conocer su catalog_id
  const { data: actual, error: errActual } = await supabase
    .from('catalog_values')
    .select('*')
    .eq('id', req.params.valueId)
    .single();

  const errAct = fromSupabase(errActual, 'Valor de Catálogo');
  if (errAct) throw errAct;

  // Validar si otro valor en el mismo catálogo ya tiene este código
  const { data: duplicado } = await supabase
    .from('catalog_values')
    .select('id, code')
    .eq('catalog_id', actual.catalog_id)
    .eq('code', codigoLimpio)
    .neq('id', req.params.valueId)
    .maybeSingle();

  if (duplicado) {
    throw new HttpError(400, `Ya existe otro valor con el código "${codigoLimpio}" en este catálogo.`);
  }

  const { data: actualizado, error: errUpdate } = await supabase
    .from('catalog_values')
    .update({
      code: codigoLimpio,
      value: valorLimpio,
      description: description !== undefined ? (description?.trim() || null) : actual.description,
      is_active: is_active !== undefined ? is_active : actual.is_active,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.valueId)
    .select('*')
    .single();

  const err = fromSupabase(errUpdate, 'Valor de Catálogo');
  if (err) throw err;

  res.json({
    message: 'Valor de catálogo actualizado con éxito.',
    data: actualizado
  });
}));

// PATCH /api/catalogs/values/:valueId/toggle -> Activar / Desactivar valor con validación de dependencias (RF-AUD-002)
router.patch('/values/:valueId/toggle', authorize(['Administrador', 'Personal']), asyncHandler(async (req, res) => {
  const usuario = req.authorizedUser?.email || req.body?.admin_email || req.header('x-user-email') || 'Administrador';
  const { confirm_deactivation } = req.body || {};

  const { data: actual, error: errActual } = await supabase
    .from('catalog_values')
    .select('*, catalogs ( id, name )')
    .eq('id', req.params.valueId)
    .single();

  const errAct = fromSupabase(errActual, 'Valor de Catálogo');
  if (errAct) throw errAct;

  const vaADesactivar = actual.is_active === true;
  const nuevoEstado = !actual.is_active;

  if (vaADesactivar) {
    // 1. Validación preventiva: No permitir desactivar si es el único valor activo en el catálogo (RF-AUD-002)
    const { count: activeCount } = await supabase
      .from('catalog_values')
      .select('id', { count: 'exact', head: true })
      .eq('catalog_id', actual.catalog_id)
      .eq('is_active', true);

    if (activeCount <= 1) {
      throw new HttpError(
        400,
        `No es posible desactivar este valor porque es el único valor activo en el catálogo "${actual.catalogs?.name || 'actual'}". Debe existir al menos un valor activo disponible (RF-AUD-002).`
      );
    }

    // 2. Validación de dependencias existentes (RF-AUD-002)
    const depMap = await getDependenciesForValues([actual.id]);
    const deps = depMap[actual.id] || { total: 0 };

    if (deps.total > 0 && confirm_deactivation !== true) {
      return res.status(409).json({
        requires_confirmation: true,
        message: `Este valor está siendo utilizado por ${deps.total} registro(s) en el sistema. Para preservar la consistencia histórica, confirme la desactivación.`,
        dependency_count: deps.total,
        dependencies: deps
      });
    }
  }

  const { data: actualizado, error: errUpdate } = await supabase
    .from('catalog_values')
    .update({
      is_active: nuevoEstado,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.valueId)
    .select('*')
    .single();

  const err = fromSupabase(errUpdate, 'Valor de Catálogo');
  if (err) throw err;

  res.json({
    message: `Valor ${nuevoEstado ? 'activado' : 'desactivado'} con éxito.`,
    data: actualizado
  });
}));

// POST /api/catalogs/:id/values -> Agregar valor al catálogo especificado
router.post('/:id/values', authorize(['Administrador', 'Personal']), asyncHandler(async (req, res) => {
  const { code, value, description, is_active, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (!code || !code.trim() || !value || !value.trim()) {
    throw new HttpError(400, 'El código y el valor/etiqueta son obligatorios.');
  }

  const codigoLimpio = code.trim().toUpperCase();
  const valorLimpio = value.trim();

  // Validar unicidad del código dentro de este catálogo
  const { data: existente } = await supabase
    .from('catalog_values')
    .select('id, code')
    .eq('catalog_id', req.params.id)
    .eq('code', codigoLimpio)
    .maybeSingle();

  if (existente) {
    throw new HttpError(400, `El código "${codigoLimpio}" ya existe dentro de este catálogo.`);
  }

  const { data: nuevoValor, error: errInsert } = await supabase
    .from('catalog_values')
    .insert({
      catalog_id: req.params.id,
      code: codigoLimpio,
      value: valorLimpio,
      description: description?.trim() || null,
      is_active: is_active !== false
    })
    .select('*')
    .single();

  const err = fromSupabase(errInsert, 'Valor de Catálogo');
  if (err) throw err;

  res.status(201).json({
    message: 'Valor agregado con éxito.',
    data: nuevoValor
  });
}));

// ==========================================
// 3. GESTIÓN DE CATÁLOGOS (RF-AUD-001)
// ==========================================

// POST /api/catalogs -> Crear nuevo catálogo (RF-AUD-001)
router.post('/', authorize(['Administrador', 'Personal']), asyncHandler(async (req, res) => {
  const { name, description, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (!name || !name.trim()) {
    throw new HttpError(400, 'El nombre del catálogo es obligatorio.');
  }

  const nombreLimpio = name.trim();

  // Validar si ya existe un catálogo con el mismo nombre (case insensitive)
  const { data: existente } = await supabase
    .from('catalogs')
    .select('id, name')
    .ilike('name', nombreLimpio)
    .maybeSingle();

  if (existente) {
    throw new HttpError(400, `Ya existe un catálogo registrado con el nombre "${nombreLimpio}".`);
  }

  const { data: nuevoCatalogo, error: errInsert } = await supabase
    .from('catalogs')
    .insert({
      name: nombreLimpio,
      description: description?.trim() || null
    })
    .select('id, name, description, created_at')
    .single();

  const err = fromSupabase(errInsert, 'Catálogos');
  if (err) throw err;

  res.status(201).json({
    message: 'Catálogo creado con éxito.',
    data: {
      ...nuevoCatalogo,
      total_values: 0,
      active_values: 0
    }
  });
}));

// PUT /api/catalogs/:id -> Editar catálogo existente (nombre y descripción)
router.put('/:id', authorize(['Administrador', 'Personal']), asyncHandler(async (req, res) => {
  const { name, description, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (!name || !name.trim()) {
    throw new HttpError(400, 'El nombre del catálogo es obligatorio.');
  }

  const nombreLimpio = name.trim();

  // Validar duplicado en otro catálogo
  const { data: existente } = await supabase
    .from('catalogs')
    .select('id, name')
    .ilike('name', nombreLimpio)
    .neq('id', req.params.id)
    .maybeSingle();

  if (existente) {
    throw new HttpError(400, `Ya existe otro catálogo con el nombre "${nombreLimpio}".`);
  }

  const { data: actualizado, error: errUpdate } = await supabase
    .from('catalogs')
    .update({
      name: nombreLimpio,
      description: description?.trim() || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select('id, name, description')
    .single();

  const err = fromSupabase(errUpdate, 'Catálogos');
  if (err) throw err;

  res.json({
    message: 'Catálogo actualizado con éxito.',
    data: actualizado
  });
}));

module.exports = router;
