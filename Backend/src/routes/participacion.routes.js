// Participación de los equipos de una asociación en competencias (RF-ASO-007).
//
// El representante consulta, solo para sus equipos: en qué competencias están inscritos (y el
// estado de cada solicitud), el calendario, los resultados oficiales, la posición en la tabla y la
// nómina con la que participan. Todo es de solo lectura; la programación y los resultados se
// administran en el módulo de competencias.
//
// Resultados: solo se muestran los marcadores de partidos finalizados con el acta validada
// (RF-COM-007). Un partido jugado cuyo resultado aún no se valida aparece como jugado, sin marcador.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { asociacionConsultada, denegarAsociacion } = require('../utils/asociacionConsultada');
const { armarPosiciones } = require('../public/competitionsDto');

const router = express.Router();
router.param('competitionId', validateUuidParams);
router.param('teamId', validateUuidParams);

const TABLA = 'competition_teams';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POR_JUGAR = ['PROGRAMADO', 'REPROGRAMADO'];
const MAX_PARTIDOS = 1000;

const SELECT_COMPETENCIA = `id, name, season, status, start_date, end_date, updated_at,
  categoria:catalog_values!competitions_category_value_id_fkey(value),
  rama:catalog_values!competitions_branch_value_id_fkey(value),
  modalidad:catalog_values!competitions_modality_value_id_fkey(value)`;

const SELECT_EQUIPO = 'id, name, short_name, association_id';

const SELECT_PARTIDO = `id, competition_id, match_number, matchday, scheduled_date, scheduled_time, status,
  home_team_id, away_team_id, home_sets_won, away_sets_won, result_type, acta_status, updated_at,
  sede:catalog_values!fk_matches_venue(value),
  competencia:competitions!matches_competition_id_fkey(id, name),
  local:teams!matches_home_team_id_fkey(id, name, short_name),
  visitante:teams!matches_away_team_id_fkey(id, name, short_name)`;

const RESULTADOS_ESPECIALES = {
  NO_PRESENTADO_LOCAL: 'No presentación del local',
  NO_PRESENTADO_VISITANTE: 'No presentación del visitante',
  GANADO_POR_DEFECTO_LOCAL: 'Ganado por defecto (local)',
  GANADO_POR_DEFECTO_VISITANTE: 'Ganado por defecto (visitante)',
  SUSPENDIDO_DEFINITIVO: 'Suspendido definitivamente'
};

const hoyCR = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function esFecha(t) {
  if (typeof t !== 'string' || !FECHA.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}
const equipoCorto = (e) => (e ? { id: e.id, name: e.name, short_name: e.short_name || null } : null);

function aCompetencia(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    season: c.season,
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date,
    category: c.categoria?.value || null,
    branch: c.rama?.value || null,
    modality: c.modalidad?.value || null
  };
}

const validado = (p) => p.status === 'FINALIZADO' && p.acta_status === 'VALIDADA';

/**
 * Un partido visto desde un equipo de la asociación.
 * @param {object} p  fila de matches
 * @param {Set<string>} propios  ids de los equipos de la asociación
 * @param {object[]} sets  match_sets del partido (solo se usan si el resultado está validado)
 */
function aPartidoPropio(p, propios, sets = []) {
  const esLocal = propios.has(p.home_team_id);
  const propio = esLocal ? p.local : p.visitante;
  const rival = esLocal ? p.visitante : p.local;
  const oficial = validado(p);
  return {
    id: p.id,
    number: p.match_number,
    matchday: p.matchday,
    date: p.scheduled_date,
    time: p.scheduled_time ? String(p.scheduled_time).slice(0, 5) : null,
    status: p.status,
    venue: p.sede?.value || null,
    competition: p.competencia ? { id: p.competencia.id, name: p.competencia.name } : null,
    team: equipoCorto(propio),
    rival: equipoCorto(rival),
    condition: esLocal ? 'LOCAL' : 'VISITA',
    // Ambos equipos son de la asociación (por ejemplo, dos categorías del mismo club).
    both_own: propios.has(p.home_team_id) && propios.has(p.away_team_id),
    pending_validation: p.status === 'FINALIZADO' && !oficial,
    result: oficial
      ? {
          own_sets: esLocal ? p.home_sets_won : p.away_sets_won,
          rival_sets: esLocal ? p.away_sets_won : p.home_sets_won,
          special: RESULTADOS_ESPECIALES[p.result_type] || null,
          sets: sets
            .map((s) => ({ number: s.set_number, own: esLocal ? s.home_points : s.away_points, rival: esLocal ? s.away_points : s.home_points }))
            .sort((a, b) => a.number - b.number)
        }
      : null
  };
}

async function equiposDe(asociacionId) {
  const { data, error } = await supabase
    .from('teams')
    .select(`${SELECT_EQUIPO}, status, categoria:catalog_values!teams_category_value_id_fkey(value), rama:catalog_values!teams_branch_value_id_fkey(value)`)
    .eq('association_id', asociacionId)
    .order('name');
  const err = fromSupabase(error);
  if (err) throw err;
  return data || [];
}

async function setsDe(partidos) {
  const ids = partidos.filter(validado).map((p) => p.id);
  const porPartido = new Map();
  if (!ids.length) return porPartido;
  const { data, error } = await supabase.from('match_sets').select('match_id, set_number, home_points, away_points').in('match_id', ids);
  const err = fromSupabase(error);
  if (err) throw err;
  for (const s of data || []) {
    if (!porPartido.has(s.match_id)) porPartido.set(s.match_id, []);
    porPartido.get(s.match_id).push(s);
  }
  return porPartido;
}

// Tablas de posiciones de varias competencias con dos consultas.
async function posicionesDe(competenciaIds) {
  const porCompetencia = new Map();
  if (!competenciaIds.length) return porCompetencia;
  const [inscritos, vista] = await Promise.all([
    supabase
      .from('competition_teams')
      .select('competition_id, equipo:teams!competition_teams_team_id_fkey(id, name, short_name, primary_color)')
      .in('competition_id', competenciaIds)
      .eq('status', 'INSCRITO'),
    supabase
      .from('v_standings')
      .select('competition_id, team_id, matches_played, matches_won, matches_lost, sets_won, sets_lost, total_points, ratio_sets, ratio_puntos')
      .in('competition_id', competenciaIds)
  ]);
  for (const r of [inscritos, vista]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }
  for (const id of competenciaIds) {
    porCompetencia.set(id, armarPosiciones(
      (inscritos.data || []).filter((f) => f.competition_id === id),
      (vista.data || []).filter((f) => f.competition_id === id)
    ));
  }
  return porCompetencia;
}

const masReciente = (...fechas) => fechas.filter(Boolean).sort().at(-1) || null;

/* ------------------------------------------------------------------------------------------------
   GET /api/participacion -> inscripciones de los equipos de la asociación, con su posición y su
   próximo partido.
   ---------------------------------------------------------------------------------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const asociacionId = await asociacionConsultada(req, TABLA);
  const equipos = await equiposDe(asociacionId);
  const ids = equipos.map((e) => e.id);
  const consultado = new Date().toISOString();
  if (!ids.length) return res.json({ data: [], equipos: [], consultado_en: consultado });

  const { data: inscripciones, error } = await supabase
    .from('competition_teams')
    .select(`id, team_id, status, observaciones, enviada_at, revisada_at, created_at,
      competencia:competitions!competition_teams_competition_id_fkey(${SELECT_COMPETENCIA})`)
    .in('team_id', ids)
    .order('created_at', { ascending: false });
  const err = fromSupabase(error);
  if (err) throw err;

  // Las competencias en planificación son un borrador interno de FECOVOL.
  const visibles = (inscripciones || []).filter((i) => i.competencia && i.competencia.status !== 'PLANIFICACION');
  const competencias = [...new Set(visibles.filter((i) => i.status === 'INSCRITO').map((i) => i.competencia.id))];

  const [posiciones, proximos] = await Promise.all([
    posicionesDe(competencias),
    competencias.length
      ? supabase
          .from('matches')
          .select('id, competition_id, scheduled_date, scheduled_time, home_team_id, away_team_id, sede:catalog_values!fk_matches_venue(value), local:teams!matches_home_team_id_fkey(id, name, short_name), visitante:teams!matches_away_team_id_fkey(id, name, short_name)')
          .in('competition_id', competencias)
          .in('status', POR_JUGAR)
          .gte('scheduled_date', hoyCR())
          .or(`home_team_id.in.(${ids.join(',')}),away_team_id.in.(${ids.join(',')})`)
          .order('scheduled_date')
          .order('scheduled_time')
          .limit(MAX_PARTIDOS)
      : Promise.resolve({ data: [] })
  ]);
  const errProx = fromSupabase(proximos.error);
  if (errProx) throw errProx;

  const porId = new Map(equipos.map((e) => [e.id, e]));
  const data = visibles.map((i) => {
    const tabla = posiciones.get(i.competencia.id) || [];
    const fila = tabla.find((f) => f.team?.id === i.team_id);
    const prox = (proximos.data || []).find((m) => m.competition_id === i.competencia.id && (m.home_team_id === i.team_id || m.away_team_id === i.team_id));
    const local = prox && prox.home_team_id === i.team_id;
    return {
      id: i.id,
      status: i.status,
      notes: i.observaciones || null,
      sent_at: i.enviada_at || i.created_at,
      reviewed_at: i.revisada_at || null,
      team: equipoCorto(porId.get(i.team_id)),
      competition: aCompetencia(i.competencia),
      standing: fila ? { position: fila.position, teams: tabla.length, points: fila.points, played: fila.played, won: fila.won, lost: fila.lost } : null,
      next_match: prox
        ? { id: prox.id, date: prox.scheduled_date, time: prox.scheduled_time ? String(prox.scheduled_time).slice(0, 5) : null, venue: prox.sede?.value || null, condition: local ? 'LOCAL' : 'VISITA', rival: equipoCorto(local ? prox.visitante : prox.local) }
        : null
    };
  });

  res.set('Cache-Control', 'no-store');
  res.json({
    data,
    equipos: equipos.map((e) => ({ ...equipoCorto(e), status: e.status, category: e.categoria?.value || null, branch: e.rama?.value || null })),
    consultado_en: consultado
  });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/participacion/partidos?desde=&hasta=&team_id=&competition_id= -> calendario de los
   equipos de la asociación (por defecto, de hoy a 60 días).
   ---------------------------------------------------------------------------------------------- */
router.get('/partidos', asyncHandler(async (req, res) => {
  const asociacionId = await asociacionConsultada(req, TABLA);
  const hoy = hoyCR();
  const desde = req.query.desde || hoy;
  if (!esFecha(desde)) throw new HttpError(400, 'El rango de fechas no es válido.');
  const hasta = req.query.hasta || sumarDias(desde, 60);
  if (!esFecha(hasta) || hasta < desde) throw new HttpError(400, 'El rango de fechas no es válido.');
  if (sumarDias(desde, 400) < hasta) throw new HttpError(400, 'Consulte como máximo un año a la vez.');
  for (const campo of ['team_id', 'competition_id']) {
    if (req.query[campo] && !UUID.test(req.query[campo])) throw new HttpError(400, `${campo} no es válido.`);
  }

  const equipos = await equiposDe(asociacionId);
  let ids = equipos.map((e) => e.id);
  if (req.query.team_id) {
    if (!ids.includes(req.query.team_id)) {
      await denegarAsociacion(req, `Intento de consultar el calendario de un equipo de otra asociación (${req.query.team_id})`, TABLA);
      throw new HttpError(403, 'Acceso denegado: el equipo no pertenece a su asociación.');
    }
    ids = [req.query.team_id];
  }
  if (!ids.length) return res.json({ data: [], desde, hasta, consultado_en: new Date().toISOString() });

  let query = supabase
    .from('matches')
    .select(SELECT_PARTIDO)
    .gte('scheduled_date', desde)
    .lte('scheduled_date', hasta)
    .neq('status', 'CANCELADO')
    .or(`home_team_id.in.(${ids.join(',')}),away_team_id.in.(${ids.join(',')})`)
    .order('scheduled_date')
    .order('scheduled_time')
    .limit(MAX_PARTIDOS);
  if (req.query.competition_id) query = query.eq('competition_id', req.query.competition_id);

  const { data, error } = await query;
  const err = fromSupabase(error);
  if (err) throw err;

  const propios = new Set(ids);
  const sets = await setsDe(data || []);
  res.set('Cache-Control', 'no-store');
  res.json({
    data: (data || []).map((p) => aPartidoPropio(p, propios, sets.get(p.id))),
    desde,
    hasta,
    consultado_en: new Date().toISOString(),
    actualizado: masReciente(...(data || []).map((p) => p.updated_at))
  });
}));

/* ------------------------------------------------------------------------------------------------
   GET /api/participacion/competencias/:competitionId/equipos/:teamId -> detalle de un equipo en una
   competencia: inscripción, calendario y resultados, tabla de posiciones y nómina (solo lectura).
   ---------------------------------------------------------------------------------------------- */
router.get('/competencias/:competitionId/equipos/:teamId', asyncHandler(async (req, res) => {
  const asociacionId = await asociacionConsultada(req, TABLA);
  const { competitionId, teamId } = req.params;

  const { data: equipo } = await supabase.from('teams').select(SELECT_EQUIPO).eq('id', teamId).maybeSingle();
  if (!equipo) throw new HttpError(404, 'Equipo no encontrado.');
  if (equipo.association_id !== asociacionId) {
    await denegarAsociacion(req, `Intento de consultar la participación de un equipo de otra asociación (${teamId})`, TABLA);
    throw new HttpError(403, 'Acceso denegado: el equipo no pertenece a su asociación.');
  }

  const [inscripcion, competencia] = await Promise.all([
    supabase.from('competition_teams').select('id, status, observaciones, enviada_at, revisada_at, created_at').eq('competition_id', competitionId).eq('team_id', teamId).maybeSingle(),
    supabase.from('competitions').select(SELECT_COMPETENCIA).eq('id', competitionId).maybeSingle()
  ]);
  if (!competencia.data || competencia.data.status === 'PLANIFICACION' || !inscripcion.data) {
    throw new HttpError(404, 'El equipo no participa en esa competencia.');
  }

  const inscrito = inscripcion.data.status === 'INSCRITO';
  const [partidos, posiciones, nomina] = await Promise.all([
    inscrito
      ? supabase
          .from('matches')
          .select(SELECT_PARTIDO)
          .eq('competition_id', competitionId)
          .neq('status', 'CANCELADO')
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .order('scheduled_date')
          .order('scheduled_time')
          .limit(MAX_PARTIDOS)
      : Promise.resolve({ data: [] }),
    inscrito ? posicionesDe([competitionId]) : Promise.resolve(new Map()),
    supabase
      .from('competition_rosters')
      .select('jersey_number, roster_role, is_habilitated, updated_at, persona:persons!competition_rosters_person_id_fkey(first_name, last_name)')
      .eq('competition_id', competitionId)
      .eq('team_id', teamId)
      .eq('status', 'ACTIVO')
  ]);
  for (const r of [partidos, nomina]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }

  const propios = new Set([teamId]);
  const sets = await setsDe(partidos.data || []);
  const integrantes = (nomina.data || [])
    .map((n) => ({
      name: [n.persona?.first_name, n.persona?.last_name].filter(Boolean).join(' '),
      number: n.jersey_number ?? null,
      role: n.roster_role,
      habilitated: n.is_habilitated !== false
    }))
    .sort((a, b) => (a.role === b.role ? (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'es') : a.role === 'JUGADOR' ? -1 : 1));

  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      team: equipoCorto(equipo),
      competition: aCompetencia(competencia.data),
      inscription: {
        status: inscripcion.data.status,
        notes: inscripcion.data.observaciones || null,
        sent_at: inscripcion.data.enviada_at || inscripcion.data.created_at,
        reviewed_at: inscripcion.data.revisada_at || null
      },
      matches: (partidos.data || []).map((p) => aPartidoPropio(p, propios, sets.get(p.id))),
      standings: (posiciones.get(competitionId) || []).map((f) => ({ ...f, own: f.team?.id === teamId })),
      roster: integrantes,
      actualizado: masReciente(
        competencia.data.updated_at,
        ...(partidos.data || []).map((p) => p.updated_at),
        ...(nomina.data || []).map((n) => n.updated_at)
      ),
      consultado_en: new Date().toISOString()
    }
  });
}));

module.exports = router;
