// Competencias para el portal público (montado en /api/public/competitions).
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { HttpError } = require('../../utils/httpError');
const validateUuidParams = require('../../middleware/validateUuidParams');
const { fallaBaseDatos } = require('../../public/dbError');
const { todasLasFilas } = require('../../public/paginar');
const {
  ESTADOS_PUBLICOS,
  EQUIPO_INSCRITO,
  aCompetencia,
  resumirAvance,
  aEquipoInscrito,
  aEquipoDetalle,
  armarNomina,
  aPartido,
  armarPosiciones,
  armarEstadisticas
} = require('../../public/competitionsDto');

const router = express.Router();

const MAX_COMPETENCIAS = 100;
const MAX_PARTIDOS = 1000;
const MAX_INTEGRANTES = 200;
const TEMPORADA = /^\d{4}$/;

// Solo las columnas que los DTO publican (o que necesitan para calcular); nunca select('*').
const SELECT_COMPETENCIA = `
  id, name, season, status, start_date, end_date, updated_at,
  categoria:catalog_values!competitions_category_value_id_fkey(value),
  rama:catalog_values!competitions_branch_value_id_fkey(value),
  modalidad:catalog_values!competitions_modality_value_id_fkey(value)
`;

const SELECT_EQUIPO_CORTO = 'id, name, short_name, primary_color';

const SELECT_PARTIDO = `
  id, match_number, matchday, scheduled_date, scheduled_time, status,
  home_sets_won, away_sets_won, result_type,
  sede:catalog_values!fk_matches_venue(value),
  local:teams!matches_home_team_id_fkey(${SELECT_EQUIPO_CORTO}),
  visitante:teams!matches_away_team_id_fkey(${SELECT_EQUIPO_CORTO})
`;

const SELECT_EQUIPO_INSCRITO = `
  id, name, short_name, primary_color, home_venue,
  asociacion:associations(id, name, province, home_venue, status)
`;

const SELECT_EQUIPO_DETALLE = `
  ${SELECT_EQUIPO_INSCRITO},
  categoria:catalog_values!teams_category_value_id_fkey(value),
  rama:catalog_values!teams_branch_value_id_fkey(value),
  modalidad:catalog_values!teams_modality_value_id_fkey(value)
`;

const SELECT_VISTA = 'competition_id, team_id, matches_played, matches_won, matches_lost, sets_won, sets_lost, total_points, ratio_sets, ratio_puntos';

router.param('id', validateUuidParams);
router.param('teamId', validateUuidParams);

/* ----------------------------------------------------------------------------------------------
   Consultas compartidas
   ---------------------------------------------------------------------------------------------- */

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

// Tabla de posiciones de una competencia.
async function posicionesDe(competenciaId) {
  const [inscritos, vista] = await Promise.all([
    supabase
      .from('competition_teams')
      .select(`equipo:teams(${SELECT_EQUIPO_CORTO})`)
      .eq('competition_id', competenciaId)
      .eq('status', EQUIPO_INSCRITO),
    supabase.from('v_standings').select(SELECT_VISTA).eq('competition_id', competenciaId)
  ]);

  if (inscritos.error) throw fallaBaseDatos(inscritos.error);
  if (vista.error) throw fallaBaseDatos(vista.error);
  return armarPosiciones(inscritos.data || [], vista.data || []);
}

// Todos los partidos de una competencia en formato público, con el detalle por set de los que ya
// terminaron.
async function partidosDe(competenciaId) {
  const { data: partidos, error } = await supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .eq('competition_id', competenciaId)
    .order('matchday')
    .order('scheduled_date')
    .order('scheduled_time')
    .order('match_number')
    .limit(MAX_PARTIDOS);
  if (error) throw fallaBaseDatos(error);

  const terminados = (partidos || []).filter((p) => p.status === 'FINALIZADO').map((p) => p.id);
  const setsPorPartido = new Map();

  if (terminados.length) {
    const sets = await todasLasFilas(() =>
      supabase
        .from('match_sets')
        .select('match_id, set_number, home_points, away_points')
        .in('match_id', terminados)
        .order('id')
    );
    for (const s of sets) {
      if (!setsPorPartido.has(s.match_id)) setsPorPartido.set(s.match_id, []);
      setsPorPartido.get(s.match_id).push(s);
    }
  }

  return (partidos || []).map((p) => aPartido(p, setsPorPartido.get(p.id)));
}

// Avance (equipos, jornadas, primer lugar) de varias competencias con tres consultas en total, sin
// importar cuántas competencias sean.
async function resumenesDe(ids) {
  const resumenes = new Map();
  if (!ids.length) return resumenes;

  const [inscritos, partidos, vista] = await Promise.all([
    todasLasFilas(() =>
      supabase
        .from('competition_teams')
        .select(`competition_id, equipo:teams(${SELECT_EQUIPO_CORTO})`)
        .in('competition_id', ids)
        .eq('status', EQUIPO_INSCRITO)
        .order('id')
    ),
    todasLasFilas(() =>
      supabase
        .from('matches')
        .select('competition_id, matchday, status, updated_at')
        .in('competition_id', ids)
        .order('id')
    ),
    todasLasFilas(() =>
      supabase
        .from('v_standings')
        .select(SELECT_VISTA)
        .in('competition_id', ids)
        .order('competition_id')
        .order('team_id')
    )
  ]);

  const agrupar = (filas) => {
    const m = new Map(ids.map((id) => [id, []]));
    for (const f of filas) m.get(f.competition_id)?.push(f);
    return m;
  };
  const inscritosPor = agrupar(inscritos);
  const partidosPor = agrupar(partidos);
  const vistaPor = agrupar(vista);

  for (const id of ids) {
    const posiciones = armarPosiciones(inscritosPor.get(id), vistaPor.get(id));
    const lista = partidosPor.get(id);
    resumenes.set(id, {
      resumen: resumirAvance({ partidos: lista, equipos: posiciones.length, posiciones }),
      ultimaActualizacion: lista.reduce(
        (max, p) => (p.updated_at && (!max || Date.parse(p.updated_at) > Date.parse(max)) ? p.updated_at : max),
        null
      )
    });
  }
  return resumenes;
}

// El equipo debe estar inscrito (no retirado ni descalificado) en esta competencia.
async function equipoInscrito(competenciaId, equipoId) {
  const { data, error } = await supabase
    .from('competition_teams')
    .select(`equipo:teams(${SELECT_EQUIPO_DETALLE})`)
    .eq('competition_id', competenciaId)
    .eq('team_id', equipoId)
    .eq('status', EQUIPO_INSCRITO)
    .maybeSingle();

  if (error) throw fallaBaseDatos(error);
  if (!data?.equipo) throw new HttpError(404, 'Equipo no encontrado en esta competencia');
  return data.equipo;
}

/* ----------------------------------------------------------------------------------------------
   Rutas
   ---------------------------------------------------------------------------------------------- */

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

  const competencias = data || [];
  const resumenes = await resumenesDe(competencias.map((c) => c.id));
  res.json({ data: competencias.map((c) => aCompetencia(c, resumenes.get(c.id).resumen)) });
}));

// GET /api/public/competitions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const competencia = await competenciaPublica(req.params.id);
  const { resumen, ultimaActualizacion } = (await resumenesDe([competencia.id])).get(competencia.id);

  // La más reciente entre la competencia y sus partidos, comparando como fechas (no como texto).
  const actualizada =
    [competencia.updated_at, ultimaActualizacion]
      .filter((f) => f && !Number.isNaN(Date.parse(f)))
      .reduce((max, f) => (max === null || Date.parse(f) > Date.parse(max) ? f : max), null);
  res.json({ data: { ...aCompetencia(competencia, resumen), updated_at: actualizada } });
}));

// GET /api/public/competitions/:id/standings
router.get('/:id/standings', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);
  res.json({ data: await posicionesDe(req.params.id) });
}));

// GET /api/public/competitions/:id/matches
// Todos los partidos de la competencia (calendario y resultados).
router.get('/:id/matches', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);
  res.json({ data: await partidosDe(req.params.id) });
}));

// GET /api/public/competitions/:id/statistics
router.get('/:id/statistics', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);
  const [posiciones, partidos] = await Promise.all([posicionesDe(req.params.id), partidosDe(req.params.id)]);
  res.json({ data: armarEstadisticas(posiciones, partidos) });
}));

// GET /api/public/competitions/:id/teams
// Equipos inscritos con su asociación, provincia, sede y cantidad de jugadores en la nómina.
router.get('/:id/teams', asyncHandler(async (req, res) => {
  await competenciaPublica(req.params.id);

  const [inscritos, nomina] = await Promise.all([
    supabase
      .from('competition_teams')
      .select(`equipo:teams(${SELECT_EQUIPO_INSCRITO})`)
      .eq('competition_id', req.params.id)
      .eq('status', EQUIPO_INSCRITO),
    todasLasFilas(() =>
      supabase
        .from('competition_rosters')
        .select('team_id')
        .eq('competition_id', req.params.id)
        .eq('status', 'ACTIVO')
        .eq('roster_role', 'JUGADOR')
        .order('id')
    )
  ]);
  if (inscritos.error) throw fallaBaseDatos(inscritos.error);

  const jugadores = new Map();
  for (const f of nomina) jugadores.set(f.team_id, (jugadores.get(f.team_id) || 0) + 1);

  const equipos = (inscritos.data || [])
    .map((f) => f.equipo)
    .filter((e) => e?.id)
    .map((e) => aEquipoInscrito(e, jugadores.get(e.id) || 0))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));

  res.json({ data: equipos });
}));

// GET /api/public/competitions/:id/teams/:teamId
// Página de un equipo dentro de una competencia: datos, posición, nómina y partidos.
router.get('/:id/teams/:teamId', asyncHandler(async (req, res) => {
  const { id, teamId } = req.params;
  const competencia = await competenciaPublica(id);
  const equipo = await equipoInscrito(id, teamId);

  const persona = 'persona:persons(first_name, last_name, status)';
  const [posiciones, partidos, nomina, miembros] = await Promise.all([
    posicionesDe(id),
    partidosDe(id),
    supabase
      .from('competition_rosters')
      .select(`person_id, jersey_number, roster_role, ${persona}`)
      .eq('competition_id', id)
      .eq('team_id', teamId)
      .eq('status', 'ACTIVO')
      .not('is_habilitated', 'is', false)
      .limit(MAX_INTEGRANTES),
    supabase
      .from('team_members')
      .select(`person_id, jersey_number, member_type, technical_role, ${persona}, posicion:catalog_values!team_members_position_value_id_fkey(value)`)
      .eq('team_id', teamId)
      .eq('status', 'ACTIVO')
      .limit(MAX_INTEGRANTES)
  ]);
  if (nomina.error) throw fallaBaseDatos(nomina.error);
  if (miembros.error) throw fallaBaseDatos(miembros.error);

  const delEquipo = partidos.filter((p) => p.home?.id === teamId || p.away?.id === teamId);
  const fila = posiciones.find((f) => f.team.id === teamId) || null;

  res.json({
    data: {
      competition: { id: competencia.id, name: aCompetencia(competencia).name },
      team: aEquipoDetalle(equipo),
      standing: fila ? { ...fila, of: posiciones.length } : null,
      roster: armarNomina(nomina.data || [], miembros.data || []),
      matches: delEquipo
    }
  });
}));

module.exports = router;
