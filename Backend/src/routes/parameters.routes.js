const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const authorize = require('../middleware/authorize');
const { logDeniedAttempt, getClientIp } = require('../utils/auditLogger');

const router = express.Router();
router.param('id', validateUuidParams);

// Semillas por defecto en memoria por si la tabla aún no ha sido migrada o está vacía
const DEFAULT_PARAMETERS = [
  { name: 'COMPETENCIA_PUNTOS_VICTORIA_MAX', value: '3', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Puntos otorgados al equipo ganador por marcador 3-0 o 3-1 (Reglamento FIVB / RF-COM-008).' },
  { name: 'COMPETENCIA_PUNTOS_VICTORIA_MIN', value: '2', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Puntos otorgados al equipo ganador por marcador 3-2 en muerte súbita (RF-COM-008).' },
  { name: 'COMPETENCIA_PUNTOS_DERROTA_MIN', value: '1', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Puntos otorgados al equipo perdedor que alcanzó el quinto set (marcador 2-3) (RF-COM-008).' },
  { name: 'COMPETENCIA_PUNTOS_DERROTA_MAX', value: '0', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Puntos otorgados al equipo perdedor por marcador 0-3 o 1-3 (RF-COM-008).' },
  { name: 'COMPETENCIA_SETS_MAXIMOS', value: '5', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Cantidad máxima reglamentaria de sets a disputar por encuentro oficial.' },
  { name: 'COMPETENCIA_TOLERANCIA_MINUTOS', value: '15', category: 'COMPETENCIAS', data_type: 'NUMBER', is_active: true, description: 'Tiempo de espera reglamentario en minutos antes de decretar No Presentación (Default).' },
  { name: 'SEGURIDAD_MAX_INTENTOS_LOGIN', value: '5', category: 'SEGURIDAD', data_type: 'NUMBER', is_active: true, description: 'Número de intentos de acceso fallidos permitidos antes de suspender temporalmente la cuenta.' },
  { name: 'SEGURIDAD_TIEMPO_INACTIVIDAD_MINUTOS', value: '30', category: 'SEGURIDAD', data_type: 'NUMBER', is_active: true, description: 'Tiempo de inactividad en minutos para expirar automáticamente la sesión del usuario.' },
  { name: 'EVIDENCIAS_TAMANO_MAXIMO_MB', value: '10', category: 'OPERATIVOS', data_type: 'NUMBER', is_active: true, description: 'Tamaño máximo permitido en Megabytes (MB) para adjuntos, actas e informes de arbitraje.' },
  { name: 'EVIDENCIAS_FORMATOS_PERMITIDOS', value: 'PDF, JPG, PNG', category: 'OPERATIVOS', data_type: 'STRING', is_active: true, description: 'Formatos de archivo admitidos para carga de actas oficiales y evidencias deportivas.' },
  { name: 'DIVULGACION_NOTICIAS_PORTADA_CANTIDAD', value: '6', category: 'DIVULGACION', data_type: 'NUMBER', is_active: true, description: 'Número de artículos y comunicados destacados que se presentan en la portada pública.' }
];

// ==========================================
// 1. CONSULTA DE PARÁMETROS DEL SISTEMA (RF-AUD-001)
// ==========================================

// GET /api/parameters -> Lista de parámetros con filtros por categoría y estado
router.get('/', asyncHandler(async (req, res) => {
  const { category, is_active, q } = req.query;

  let query = supabase
    .from('system_parameters')
    .select('*')
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true' || is_active === true);
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error } = await query;
  const err = fromSupabase(error, 'Parámetros del Sistema');
  if (err) throw err;

  let params = data || [];

  // Si la tabla estuviese vacía, auto-sembrar parámetros iniciales en segundo plano o retornar defaults
  if (params.length === 0 && !category && !q) {
    try {
      const { data: inserted } = await supabase
        .from('system_parameters')
        .upsert(DEFAULT_PARAMETERS, { onConflict: 'name' })
        .select('*');
      if (inserted && inserted.length > 0) {
        params = inserted;
      }
    } catch (_) {
      params = DEFAULT_PARAMETERS.map((p, idx) => ({ id: `temp-${idx}`, ...p }));
    }
  }

  // Normalizar estructura
  const formateados = params.map((p) => ({
    id: p.id,
    name: p.name,
    value: p.value,
    description: p.description || 'Sin descripción',
    category: p.category || 'GENERAL',
    data_type: p.data_type || 'STRING',
    is_active: p.is_active !== false,
    is_readonly: Boolean(p.is_readonly),
    updated_at: p.updated_at
  }));

  res.json({ data: formateados });
}));

// GET /api/parameters/:nameOrId -> Consulta parámetro específico por UUID o por Clave (Name)
router.get('/:nameOrId', asyncHandler(async (req, res) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.nameOrId);

  let query = supabase.from('system_parameters').select('*');
  if (isUuid) {
    query = query.eq('id', req.params.nameOrId);
  } else {
    query = query.eq('name', req.params.nameOrId.toUpperCase());
  }

  const { data, error } = await query.single();
  const err = fromSupabase(error, 'Parámetro del Sistema');
  if (err) throw err;

  res.json({ data });
}));

// ==========================================
// 2. GESTIÓN Y MODIFICACIÓN DE PARÁMETROS (RF-AUD-001)
// ==========================================

// POST /api/parameters -> Registrar nuevo parámetro (RF-AUD-001)
router.post('/', authorize(['Administrador']), asyncHandler(async (req, res) => {
  const { name, value, description, category, data_type, is_active, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (!name || !name.trim() || value === undefined || value === null) {
    throw new HttpError(400, 'El nombre/clave y el valor del parámetro son obligatorios.');
  }

  const nombreLimpio = name.trim().toUpperCase().replace(/\s+/g, '_');
  const valorLimpio = String(value).trim();
  const tipoLimpio = data_type ? String(data_type).toUpperCase() : 'STRING';

  // Validar formato del valor según data_type
  if (tipoLimpio === 'NUMBER' && isNaN(Number(valorLimpio))) {
    throw new HttpError(400, `El valor ingresado ("${valorLimpio}") no es un número válido para el tipo NUMBER.`);
  }
  if (tipoLimpio === 'BOOLEAN' && !['true', 'false'].includes(valorLimpio.toLowerCase())) {
    throw new HttpError(400, 'El valor para un tipo BOOLEAN debe ser "true" o "false".');
  }

  // Validar duplicado
  const { data: existente } = await supabase
    .from('system_parameters')
    .select('id, name')
    .eq('name', nombreLimpio)
    .maybeSingle();

  if (existente) {
    throw new HttpError(400, `Ya existe un parámetro configurado con el nombre "${nombreLimpio}".`);
  }

  const { data: nuevo, error: errInsert } = await supabase
    .from('system_parameters')
    .insert({
      name: nombreLimpio,
      value: valorLimpio,
      description: description?.trim() || null,
      category: category ? category.trim().toUpperCase() : 'GENERAL',
      data_type: tipoLimpio,
      is_active: is_active !== false,
      is_readonly: false
    })
    .select('*')
    .single();

  const err = fromSupabase(errInsert, 'Parámetro del Sistema');
  if (err) throw err;

  res.status(201).json({
    message: 'Parámetro creado con éxito.',
    data: nuevo
  });
}));

// PUT /api/parameters/:id -> Actualizar valor y metadatos de un parámetro (RF-AUD-001)
router.put('/:id', authorize(['Administrador']), asyncHandler(async (req, res) => {
  const { value, description, category, is_active, admin_email } = req.body;
  const usuario = req.authorizedUser?.email || admin_email || req.header('x-user-email') || 'Administrador';

  if (value === undefined || value === null) {
    throw new HttpError(400, 'El valor del parámetro es obligatorio.');
  }

  const valorLimpio = String(value).trim();

  // Obtener parámetro actual
  const { data: actual, error: errActual } = await supabase
    .from('system_parameters')
    .select('*')
    .eq('id', req.params.id)
    .single();

  const errAct = fromSupabase(errActual, 'Parámetro del Sistema');
  if (errAct) throw errAct;

  // Validación de tipo de dato
  const tipo = actual.data_type || 'STRING';
  if (tipo === 'NUMBER' && isNaN(Number(valorLimpio))) {
    throw new HttpError(400, `El valor ingresado ("${valorLimpio}") no es un número válido para el parámetro "${actual.name}".`);
  }
  if (tipo === 'BOOLEAN' && !['true', 'false'].includes(valorLimpio.toLowerCase())) {
    throw new HttpError(400, `El valor para el parámetro booleano "${actual.name}" debe ser "true" o "false".`);
  }

  const { data: actualizado, error: errUpdate } = await supabase
    .from('system_parameters')
    .update({
      value: valorLimpio,
      description: description !== undefined ? (description?.trim() || null) : actual.description,
      category: category ? category.trim().toUpperCase() : actual.category,
      is_active: is_active !== undefined ? is_active : actual.is_active,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select('*')
    .single();

  const err = fromSupabase(errUpdate, 'Parámetro del Sistema');
  if (err) throw err;

  res.json({
    message: `Parámetro "${actual.name}" actualizado con éxito.`,
    data: actualizado
  });
}));

// PATCH /api/parameters/:id/toggle -> Activar / Inactivar parámetro (RF-AUD-001)
router.patch('/:id/toggle', authorize(['Administrador']), asyncHandler(async (req, res) => {
  const { data: actual, error: errActual } = await supabase
    .from('system_parameters')
    .select('*')
    .eq('id', req.params.id)
    .single();

  const errAct = fromSupabase(errActual, 'Parámetro del Sistema');
  if (errAct) throw errAct;

  if (actual.is_readonly) {
    throw new HttpError(400, `El parámetro "${actual.name}" es de solo lectura y no puede ser desactivado.`);
  }

  const nuevoEstado = !actual.is_active;

  const { data: actualizado, error: errUpdate } = await supabase
    .from('system_parameters')
    .update({
      is_active: nuevoEstado,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select('*')
    .single();

  const err = fromSupabase(errUpdate, 'Parámetro del Sistema');
  if (err) throw err;

  res.json({
    message: `Parámetro "${actual.name}" ${nuevoEstado ? 'activado' : 'inactivado'} con éxito.`,
    data: actualizado
  });
}));

module.exports = router;
