// Competencias para el portal público (montado en /api/public/competitions).
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { HttpError } = require('../../utils/httpError');
const validateUuidParams = require('../../middleware/validateUuidParams');
const { fallaBaseDatos } = require('../../public/dbError');
const { ESTADOS_PUBLICOS, aCompetencia, aPartido, armarPosiciones } = require('../../public/competitionsDto');

const router = express.Router();

const MAX_COMPETENCIAS = 100;
const MAX_PARTIDOS = 500;
const TEMPORADA = /^\d{4}$/;

const SELECT_COMPETENCIA = `
  id, name, season, status, start_date, end_date,
  categoria:catalog_values!competitions_category_value_id_fkey(value),
  rama:catalog_values!competitions_branch_value_id_fkey(value),
  modalidad:catalog_values!competitions_modality_value_id_fkey(value)
`;

const SELECT_PARTIDO = `
  id, match_number, matchday, venue, scheduled_date, scheduled_time, status,
  home_sets_won, away_sets_won,
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name)
`;

router.param('id', validateUuidParams);

// Devuelve la competencia si existe y es pública; si no, 404 (sin distinguir entre "no existe" y
// "es un borrador", para no revelar qué borradores hay).
async function competenciaPublica(id) {
  const { data, error } = await supabase
    .from('competitions')
    .select(SELECT_COMPETENCIA)
    .eq('id', id)
    .in('status', ESTADOS_PUBLICOS)
    .maybeSingle();

  if (error) throw fallaBaseDatos(error);
  if (!data) throw new HttpError(404, 'Competencia no encontrada');
  return data;
}

// GET /api/public/competitions?status=EN_CURSO&season=2026
router.get('/', asyncHandler(async (req, res) => {
  const { status, season } = req.query;

  if (status !== undefined && !ESTADOS_PUBLICOS.includes(status)) {
    throw new HttpError(400, `status debe ser uno de: ${ESTADOS_PUBLICOS.join(', ')}`);
  }
  if (season !== undefined && !(typeof season === 'string' && TEMPORADA.test(season))) {
    throw new HttpError(400, 'season debe ser un año de cuatro dígitos');
  }

  let query = supabase
    .from('competitions')
    .select(SELECT_COMPETENCIA)
    .in('status', status ? [status] : ESTADOS_PUBLICOS)
    .order('start_date', { ascending: false })
    .order('name')
    .limit(MAX_COMPETENCIAS);
  if (season) query = query.eq('season', season);

  const { data, error } = await query;
  if (error) throw fallaBaseDatos(error);

  res.json({ data: (data || []).map(aCompetencia) });
}));

// GET /api/public/competitions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const competencia = await competenciaPublica(req.params.id);
  res.json({ data: aCompetencia(competencia) });
}));

// GET /api/public/competitions/:id/standings
router.get('/:id/standings', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);

  const [inscritos, vista] = await Promise.all([
    supabase
      .from('competition_teams')
      .select('equipo:teams(id, name, short_name)')
      .eq('competition_id', req.params.id)
      .eq('status', 'INSCRITO'),
    supabase
      .from('v_standings')
      .select('team_id, matches_played, matches_won, matches_lost, sets_won, sets_lost, total_points')
      .eq('competition_id', req.params.id)
  ]);

  if (inscritos.error) throw fallaBaseDatos(inscritos.error);
  if (vista.error) throw fallaBaseDatos(vista.error);

  res.json({ data: armarPosiciones(inscritos.data || [], vista.data || []) });
}));

// GET /api/public/competitions/:id/matches
// Todos los partidos de la competencia (calendario y resultados), con el detalle por set de los
// que ya terminaron.
router.get('/:id/matches', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);

  const { data: partidos, error } = await supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .eq('competition_id', req.params.id)
    .order('matchday')
    .order('scheduled_date')
    .order('scheduled_time')
    .order('match_number')
    .limit(MAX_PARTIDOS);
  if (error) throw fallaBaseDatos(error);

  const terminados = (partidos || []).filter((p) => p.status === 'FINALIZADO').map((p) => p.id);
  const setsPorPartido = new Map();

  if (terminados.length) {
    const { data: sets, error: errorSets } = await supabase
      .from('match_sets')
      .select('match_id, set_number, home_points, away_points')
      .in('match_id', terminados);
    if (errorSets) throw fallaBaseDatos(errorSets);

    for (const s of sets || []) {
      if (!setsPorPartido.has(s.match_id)) setsPorPartido.set(s.match_id, []);
      setsPorPartido.get(s.match_id).push(s);
    }
  }

  res.json({ data: (partidos || []).map((p) => aPartido(p, setsPorPartido.get(p.id))) });
}));

module.exports = router;
