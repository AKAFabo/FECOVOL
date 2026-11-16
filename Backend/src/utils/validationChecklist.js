const supabase = require('../config/supabase');

// Genera el checklist de validaciones para un partido antes de publicar el resultado.
// Ahora usa min_roster de la competencia para validar la nómina.
async function getMatchValidationChecklist(matchId) {
  // Consulta el partido con la información necesaria
  const { data: match } = await supabase
    .from('matches')
    .select('id, competition_id, home_team_id, away_team_id, status, home_sets_won, away_sets_won, acta_status')
    .eq('id', matchId)
    .single();

  if (!match) return null;

  // Recupera los límites de nómina de la competencia
  const { data: competition } = await supabase
    .from('competitions')
    .select('min_roster, max_roster')
    .eq('id', match.competition_id)
    .single();

  const minRoster = competition?.min_roster ?? 12;

  // Ejecuta todas las consultas de validación en paralelo
  const [
    { count: homeRoster },
    { count: awayRoster },
    { data: refAssignments },
    { data: sets },
    { data: evidence }
  ] = await Promise.all([
    supabase.from('competition_rosters').select('id', { count: 'exact', head: true }).eq('competition_id', match.competition_id).eq('team_id', match.home_team_id).eq('status', 'ACTIVO'),
    supabase.from('competition_rosters').select('id', { count: 'exact', head: true }).eq('competition_id', match.competition_id).eq('team_id', match.away_team_id).eq('status', 'ACTIVO'),
    supabase.from('referee_assignments').select('id').eq('match_id', matchId).neq('status', 'ANULADA'),
    supabase.from('match_sets').select('set_number, home_points, away_points').eq('match_id', matchId).order('set_number'),
    supabase.from('match_evidence').select('id, file_type').eq('match_id', matchId)
  ]);

  const hasHomeRoster = (homeRoster || 0) >= minRoster;
  const hasAwayRoster = (awayRoster || 0) >= minRoster;
  const hasReferee = (refAssignments || []).length > 0;
  const hasEvidence = (evidence || []).some(e => e.file_type === 'HOJA_ANOTACION');

  // Valida la coherencia de los sets registrados
  let setsConsistent = true;
  let setsMessage = 'Los sets son consistentes con el reglamento.';
  if (!sets || sets.length === 0) {
    setsConsistent = false;
    setsMessage = 'Debes registrar al menos un set antes de validar.';
  } else {
    const homeWins = sets.filter(s => s.home_points > s.away_points).length;
    const awayWins = sets.filter(s => s.away_points > s.home_points).length;
    if (homeWins === awayWins) {
      setsConsistent = false;
      setsMessage = 'El resultado tiene empate de sets. Debe haber un ganador claro.';
    } else {
      setsMessage = `Sets consistentes (Local ${homeWins} - Visita ${awayWins}).`;
    }
  }

  // Devuelve el checklist con todos los items y su estado
  return [
    {
      id: 'home_roster',
      label: `Nómina local habilitada (mínimo ${minRoster} integrantes)`,
      passed: hasHomeRoster,
      warning: false,
      message: hasHomeRoster
        ? `Nómina local activa (${homeRoster} integrantes).`
        : `El equipo local tiene ${homeRoster || 0} integrantes activos y la competencia exige al menos ${minRoster}.`
    },
    {
      id: 'away_roster',
      label: `Nómina visitante habilitada (mínimo ${minRoster} integrantes)`,
      passed: hasAwayRoster,
      warning: false,
      message: hasAwayRoster
        ? `Nómina visitante activa (${awayRoster} integrantes).`
        : `El equipo visitante tiene ${awayRoster || 0} integrantes activos y la competencia exige al menos ${minRoster}.`
    },
    {
      id: 'referee',
      label: 'Árbitro designado y acreditado',
      passed: hasReferee,
      warning: true,
      message: hasReferee ? 'Hay árbitro designado para este partido.' : 'No hay árbitro designado para este partido.'
    },
    {
      id: 'sets',
      label: 'Sets consistentes con el reglamento',
      passed: setsConsistent,
      warning: false,
      message: setsMessage
    },
    {
      id: 'evidence',
      label: 'Hoja de anotación adjunta',
      passed: hasEvidence,
      warning: true,
      message: hasEvidence ? 'Hoja de anotación adjunta.' : 'Falta adjuntar la hoja de anotación.'
    }
  ];
}

module.exports = { getMatchValidationChecklist };