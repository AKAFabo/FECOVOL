const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('competitionId', validateUuidParams);

// Trae la sede como objeto y agrega venue (string) para compatibilidad con los consumidores del reporte.
const SELECT_REPORT_MATCH = `
  id, match_number, matchday, venue_id, scheduled_date, scheduled_time, status,
  home_sets_won, away_sets_won,
  sede:catalog_values!fk_matches_venue(id, code, value),
  local:teams!matches_home_team_id_fkey(id, name),
  visitante:teams!matches_away_team_id_fkey(id, name)
`;

// Mapea un partido para que los reportes sigan recibiendo venue como string.
const mapMatch = (m) => ({
  ...m,
  venue: m.sede?.value || null
});

// ==========================================
//    GENERACIÓN DE REPORTES (consultas)
// ==========================================

router.get('/results/:competitionId/:matchday', asyncHandler(async (req, res) => {
  const { competitionId, matchday } = req.params;

  const { data: matches, error } = await supabase
    .from('matches')
    .select(`${SELECT_REPORT_MATCH}, match_sets(id, set_number, home_points, away_points)`)
    .eq('competition_id', competitionId)
    .eq('matchday', matchday)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (error) throw fromSupabase(error);

  const formatted = (matches || []).map(m => ({
    ...mapMatch(m),
    match_sets: (m.match_sets || []).sort((a, b) => a.set_number - b.set_number)
  }));

  res.json({ data: formatted });
}));

router.get('/next-matchday/:competitionId', asyncHandler(async (req, res) => {
  const { competitionId } = req.params;

  const { data: nextMatch, error: errNext } = await supabase
    .from('matches')
    .select('matchday')
    .eq('competition_id', competitionId)
    .eq('status', 'PROGRAMADO')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (errNext) throw fromSupabase(errNext);
  if (!nextMatch) return res.json({ data: { matchday: null, matches: [] } });

  const { data: matches, error: errMatches } = await supabase
    .from('matches')
    .select(SELECT_REPORT_MATCH)
    .eq('competition_id', competitionId)
    .eq('matchday', nextMatch.matchday)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (errMatches) throw fromSupabase(errMatches);

  res.json({
    data: {
      matchday: nextMatch.matchday,
      matches: (matches || []).map(mapMatch)
    }
  });
}));

router.get('/consolidated/:competitionId', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .select(SELECT_REPORT_MATCH)
    .eq('competition_id', req.params.competitionId)
    .eq('status', 'FINALIZADO')
    .order('matchday', { ascending: true })
    .order('scheduled_date', { ascending: true });

  if (error) throw fromSupabase(error);
  res.json({ data: (data || []).map(mapMatch) });
}));

router.get('/roster-compliance/:competitionId', asyncHandler(async (req, res) => {
  const MINIMO = 6;

  const { data: teams, error } = await supabase
    .from('competition_teams')
    .select(`
      id, status,
      equipo:teams(id, name, short_name,
        asociacion:associations(id, name, short_name)
      )
    `)
    .eq('competition_id', req.params.competitionId)
    .eq('status', 'INSCRITO');

  if (error) throw fromSupabase(error);

  const results = [];

  for (const team of (teams || [])) {
    const { count: rosterCount } = await supabase
      .from('competition_rosters')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', req.params.competitionId)
      .eq('team_id', team.equipo.id)
      .eq('status', 'ACTIVO');

    const { data: docs } = await supabase
      .from('documents')
      .select('id, status, expiry_date')
      .eq('team_id', team.equipo.id);

    const expiredDocs = (docs || []).filter(d =>
      d.status === 'VENCIDO' || (d.expiry_date && new Date(d.expiry_date) < new Date())
    ).length;

    const count = rosterCount || 0;
    const isComplete = count >= MINIMO;
    const docsOk = expiredDocs === 0;

    results.push({
      equipo: team.equipo,
      integrantes: count,
      minimo_requerido: MINIMO,
      cumple_nomina: isComplete,
      documentos_vencidos: expiredDocs,
      cumple_documentos: docsOk,
      estado_general: isComplete && docsOk ? 'COMPLETO' : 'INCOMPLETO',
      detalle: !isComplete
        ? `Faltan ${MINIMO - count} integrantes`
        : (!docsOk ? `${expiredDocs} documentos vencidos` : 'Todo en orden')
    });
  }

  res.json({ data: results, minimo_requerido: MINIMO });
}));

router.get('/team-stats/:competitionId', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('v_standings')
    .select('*')
    .eq('competition_id', req.params.competitionId)
    .order('total_points', { ascending: false })
    .order('ratio_sets', { ascending: false })
    .order('ratio_puntos', { ascending: false });

  if (error) throw fromSupabase(error);

  const enriched = (data || []).map(t => ({
    ...t,
    ratio_sets: t.ratio_sets !== null && t.ratio_sets !== undefined
      ? Number(Number(t.ratio_sets).toFixed(2))
      : (t.sets_lost > 0 ? Number((t.sets_won / t.sets_lost).toFixed(2)) : (t.sets_won > 0 ? t.sets_won : 0)),
    ratio_puntos: t.ratio_puntos !== null && t.ratio_puntos !== undefined
      ? Number(Number(t.ratio_puntos).toFixed(2))
      : (t.matches_played > 0 ? Number((t.total_points / t.matches_played).toFixed(2)) : 0)
  }));

  res.json({ data: enriched });
}));

// ==========================================
//    SNAPSHOTS (Guardar y consultar reportes generados)
// ==========================================

router.post('/snapshot', asyncHandler(async (req, res) => {
  const { report_type, competition_id, parameters, data } = req.body;
  
  if (!report_type || !competition_id || !data) {
    throw new HttpError(400, 'report_type, competition_id y data son obligatorios.');
  }

  const { data: snapshot, error } = await supabase
    .from('report_snapshots')
    .insert({
      report_type,
      competition_id,
      parameters: parameters || {},
      data,
      generated_by: req.currentUser
    })
    .select()
    .single();

  if (error) throw fromSupabase(error);
  res.status(201).json({ data: snapshot });
}));

router.get('/snapshots/:competitionId', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('report_snapshots')
    .select('id, report_type, parameters, generated_by, created_at')
    .eq('competition_id', req.params.competitionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw fromSupabase(error);
  res.json({ data: data || [] });
}));

router.get('/snapshot/:snapshotId', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('report_snapshots')
    .select('*')
    .eq('id', req.params.snapshotId)
    .single();

  if (error) throw fromSupabase(error, 'Snapshot');
  res.json({ data });
}));

module.exports = router;