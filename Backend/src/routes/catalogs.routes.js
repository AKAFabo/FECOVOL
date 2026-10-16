const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { fromSupabase } = require('../utils/httpError');

const router = express.Router();

// GET /api/catalogs -> lista de catalogos
router.get('/', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('catalogs')
    .select('id, name, description')
    .order('name');

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data });
}));

// GET /api/catalogs/:name/values -> valores de un catalogo (para llenar los selects)
router.get('/:name/values', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('catalog_values')
    .select('id, code, value, description, is_active, catalogs!inner(name)')
    .eq('catalogs.name', req.params.name)
    .eq('is_active', true)
    .order('value');

  const err = fromSupabase(error);
  if (err) throw err;

  res.json({ data: data.map(({ catalogs, ...v }) => v) });
}));

module.exports = router;
