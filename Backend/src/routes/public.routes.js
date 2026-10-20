// API pública de solo lectura para el portal web (cualquier persona, sin iniciar sesión).
//
// Por qué un router aparte y no las rutas de /api/competitions:
// - Aquí solo hay GET. Nada de lo que se expone puede modificar datos.
// - Cada respuesta pasa por src/public/competitionsDto.js, que arma los objetos con una lista
//   blanca de campos. Las rutas internas devuelven más información (nóminas con documentos de
//   identidad, por ejemplo) que no debe llegar al público.
// - Las competencias en PLANIFICACION no se publican: son borradores de la Federación.
// - Tiene su propio límite de solicitudes y su propio manejo de errores, que nunca devuelve el
//   mensaje interno de la base de datos.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const rateLimit = require('../middleware/rateLimit');
const { ESTADOS_PUBLICOS, aCompetencia, aPartido, armarPosiciones } = require('../public/competitionsDto');

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

router.use(rateLimit({ ventanaMs: 60_000, maximo: 120 }));
router.use((req, res, next) => {
  // Los datos cambian cuando se registra un resultado; un minuto de caché alcanza.
  res.set('Cache-Control', 'public, max-age=60');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
router.param('id', validateUuidParams);

// Error de base de datos: se registra completo en el servidor y al cliente le llega un mensaje genérico.
function fallaBaseDatos(error) {
  const err = new HttpError(503, 'No fue posible obtener la información en este momento.');
  err.causa = error;
  return err;
}

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
router.get('/competitions', asyncHandler(async (req, res) => {
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
router.get('/competitions/:id', asyncHandler(async (req, res) => {
  const competencia = await competenciaPublica(req.params.id);
  res.json({ data: aCompetencia(competencia) });
}));

// GET /api/public/competitions/:id/standings
router.get('/competitions/:id/standings', asyncHandler(async (req, res) => {
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
router.get('/competitions/:id/matches', asyncHandler(async (req, res) => {
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

// Cualquier otra ruta o método bajo /api/public.
router.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : 503;
  if (status >= 500) console.error('[api pública]', req.method, req.originalUrl, err.causa || err);
  // Los errores de las respuestas de error no se guardan en caché.
  res.set('Cache-Control', 'no-store');
  res.status(status).json({ error: status >= 500 ? 'No fue posible obtener la información en este momento.' : err.message });
});

module.exports = router;
