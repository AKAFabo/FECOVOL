const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { personaSuspendida } = require('../utils/sanciones');

const router = express.Router();
router.param('id', validateUuidParams);
router.param('teamId', validateUuidParams);
router.param('rosterId', validateUuidParams);
router.param('versionId', validateUuidParams);

const SELECT_COMPETITION = `
  id, name, season, status, start_date, end_date,
  max_teams, registration_deadline, min_roster, max_roster,
  points_win_3_0, points_win_3_2, points_loss_2_3, points_loss_0_3,
  categoria:catalog_values!competitions_category_value_id_fkey(code, value),
  rama:catalog_values!competitions_branch_value_id_fkey(code, value),
  modalidad:catalog_values!competitions_modality_value_id_fkey(code, value)
`;

const requireAuth = (req, res, next) => {
  if (req.userScope?.isPublic) return next(new HttpError(401, 'Se requiere autenticación.'));
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.userScope?.isAdmin) return next(new HttpError(403, 'Solo el personal de FECOVOL puede realizar esta acción.'));
  next();
};

// Valida que un entero positivo sea válido o null
function validarEnteroPositivo(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new HttpError(400, `${nombre} debe ser un entero positivo.`);
  }
  return numero;
}

// Valida que min_roster no supere a max_roster cuando ambos están definidos
function validarRangoRoster(min, max) {
  if (min !== null && max !== null && min > max) {
    throw new HttpError(400, 'El mínimo de integrantes no puede ser mayor que el máximo.');
  }
}

// Construye el snapshot propuesto agregando una persona al snapshot actual
function snapshotConAlta(snapshotActual, persona) {
  const actual = Array.isArray(snapshotActual) ? [...snapshotActual] : [];
  const yaExiste = actual.some(p => p.person_id === persona.person_id);
  if (yaExiste) return actual;
  actual.push({
    person_id: persona.person_id,
    jersey_number: persona.jersey_number ?? null,
    roster_role: persona.roster_role || 'JUGADOR'
  });
  return actual;
}

// Construye el snapshot propuesto quitando una persona del snapshot actual
function snapshotConBaja(snapshotActual, person_id) {
  const actual = Array.isArray(snapshotActual) ? snapshotActual : [];
  return actual.filter(p => p.person_id !== person_id);
}

// Genera un resumen legible del cambio para guardarlo en la versión
function resumenCambio(tipo, persona = null) {
  if (tipo === 'ALTA' && persona) {
    return `Alta de ${persona.nombre || persona.person_id}${persona.jersey_number ? ` (#${persona.jersey_number})` : ''}`;
  }
  if (tipo === 'BAJA' && persona) {
    return `Baja de ${persona.nombre || persona.person_id}`;
  }
  return 'Cambio en la nómina';
}

// Aplica el snapshot directamente y crea la versión OFICIALIZADA en una sola pasada.
// Úsalo cuando el usuario que hace el cambio es FECOVOL (isAdmin).
async function aplicarDirectoYVersionar({
  competitionId,
  teamId,
  snapshotPropuesto,
  summary,
  reason,
  currentUser
}) {
  const { error: errApply } = await supabase.rpc('sp_apply_roster_snapshot', {
    p_competition_id: competitionId,
    p_team_id: teamId,
    p_snapshot: snapshotPropuesto,
    p_admin_user: currentUser
  });
  if (errApply) throw fromSupabase(errApply);

  const { data: versionId, error: errVer } = await supabase.rpc('sp_create_roster_version', {
    p_competition_id: competitionId,
    p_team_id: teamId,
    p_snapshot: snapshotPropuesto,
    p_changes_summary: summary,
    p_reason: reason || null,
    p_created_by: currentUser,
    p_status: 'OFICIALIZADA'
  });
  if (errVer) throw fromSupabase(errVer);

  return versionId;
}

// Crea una versión PENDIENTE_APROBACION sin tocar competition_rosters.
// Úsalo cuando el usuario es una asociación y FECOVOL debe aprobar.
async function crearVersionPendiente({
  competitionId,
  teamId,
  snapshotPropuesto,
  summary,
  reason,
  currentUser
}) {
  const { data: pendiente } = await supabase
    .from('competition_roster_versions')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('team_id', teamId)
    .eq('status', 'PENDIENTE_APROBACION')
    .maybeSingle();

  if (pendiente) {
    throw new HttpError(400, 'Ya existe un cambio pendiente de aprobación para esta nómina. Espera a que FECOVOL lo revise.');
  }

  const { data: versionId, error: errVer } = await supabase.rpc('sp_create_roster_version', {
    p_competition_id: competitionId,
    p_team_id: teamId,
    p_snapshot: snapshotPropuesto,
    p_changes_summary: summary,
    p_reason: reason || null,
    p_created_by: currentUser,
    p_status: 'PENDIENTE_APROBACION'
  });
  if (errVer) throw fromSupabase(errVer);

  return versionId;
}

// ==========================================
//    GESTIÓN DE COMPETENCIAS
// ==========================================

router.get('/', asyncHandler(async (req, res) => {
  const { season, status } = req.query;
  let query = supabase.from('competitions').select(SELECT_COMPETITION).order('start_date', { ascending: false });
  if (season) query = query.eq('season', season);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw fromSupabase(error);

  const comps = data || [];
  if (comps.length === 0) return res.json({ data: [] });

  const ids = comps.map(c => c.id);

  // Obtén los conteos de equipos inscritos y jornadas en paralelo
  const [{ data: teamsData }, { data: matchesData }] = await Promise.all([
    supabase.from('competition_teams').select('competition_id').in('competition_id', ids).eq('status', 'INSCRITO'),
    supabase.from('matches').select('competition_id, matchday, status').in('competition_id', ids)
  ]);

  // Agrupa los equipos por competencia
  const equiposMap = {};
  (teamsData || []).forEach(t => {
    equiposMap[t.competition_id] = (equiposMap[t.competition_id] || 0) + 1;
  });

  // Agrupa las jornadas por competencia
  const jornadasTotalesMap = {};
  const jornadasJugadasMap = {};
  (matchesData || []).forEach(m => {
    if (!jornadasTotalesMap[m.competition_id]) jornadasTotalesMap[m.competition_id] = new Set();
    jornadasTotalesMap[m.competition_id].add(m.matchday);
    if (m.status === 'FINALIZADO') {
      if (!jornadasJugadasMap[m.competition_id]) jornadasJugadasMap[m.competition_id] = new Set();
      jornadasJugadasMap[m.competition_id].add(m.matchday);
    }
  });

  // Enriquece cada competencia con los conteos
  const enriched = comps.map(c => ({
    ...c,
    equipos_count: equiposMap[c.id] || 0,
    jornadas_count: jornadasTotalesMap[c.id] ? jornadasTotalesMap[c.id].size : 0,
    jornadas_jugadas: jornadasJugadasMap[c.id] ? jornadasJugadasMap[c.id].size : 0
  }));

  res.json({ data: enriched });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const {
    name, season, category_code, branch_code, modality_code, start_date, end_date, status,
    max_teams, registration_deadline, min_roster, max_roster,
    points_win_3_0, points_win_3_2, points_loss_2_3, points_loss_0_3
  } = req.body;

  if (!name || !season || !category_code || !branch_code || !modality_code || !start_date || !end_date) {
    throw new HttpError(400, 'Faltan campos obligatorios para crear la competencia.');
  }

  if (new Date(end_date) < new Date(start_date)) {
    throw new HttpError(400, 'La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  if (registration_deadline && new Date(registration_deadline) > new Date(end_date)) {
    throw new HttpError(400, 'La fecha de cierre de inscripciones no puede ser posterior al fin de la competencia.');
  }

  const parsedMaxTeams = validarEnteroPositivo(max_teams, 'El cupo máximo de equipos');
  const parsedMinRoster = validarEnteroPositivo(min_roster, 'El mínimo de integrantes');
  const parsedMaxRoster = validarEnteroPositivo(max_roster, 'El máximo de integrantes');
  validarRangoRoster(parsedMinRoster, parsedMaxRoster);

  const { data: existente } = await supabase
    .from('competitions')
    .select('id')
    .eq('name', name)
    .eq('season', season)
    .maybeSingle();

  if (existente) throw new HttpError(400, 'Ya existe una competencia con ese nombre en esta temporada.');

  const { data: id, error } = await supabase.rpc('sp_create_competition', {
    p_name: name,
    p_season: season,
    p_category_code: category_code,
    p_branch_code: branch_code,
    p_modality_code: modality_code,
    p_start_date: start_date,
    p_end_date: end_date,
    p_admin_user: req.currentUser,
    p_status: status || 'PLANIFICACION'
  });

  if (error) throw fromSupabase(error);

  // Actualiza los campos que el procedimiento no recibe
  const extra = {};
  if (parsedMaxTeams !== null) extra.max_teams = parsedMaxTeams;
  if (registration_deadline !== undefined) extra.registration_deadline = registration_deadline || null;
  if (parsedMinRoster !== null) extra.min_roster = parsedMinRoster;
  if (parsedMaxRoster !== null) extra.max_roster = parsedMaxRoster;
  if (points_win_3_0 !== undefined) extra.points_win_3_0 = points_win_3_0;
  if (points_win_3_2 !== undefined) extra.points_win_3_2 = points_win_3_2;
  if (points_loss_2_3 !== undefined) extra.points_loss_2_3 = points_loss_2_3;
  if (points_loss_0_3 !== undefined) extra.points_loss_0_3 = points_loss_0_3;

  if (Object.keys(extra).length > 0) {
    await supabase.from('competitions').update(extra).eq('id', id);
  }

  const { data } = await supabase.from('competitions').select(SELECT_COMPETITION).eq('id', id).single();
  res.status(201).json({ data });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competitions')
    .select(SELECT_COMPETITION)
    .eq('id', req.params.id)
    .single();

  if (error) throw fromSupabase(error, 'Competencia');
  res.json({ data });
}));

router.patch('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body;

  if (b.start_date && b.end_date && new Date(b.end_date) < new Date(b.start_date)) {
    throw new HttpError(400, 'La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  if (b.registration_deadline) {
    const { data: current } = await supabase
      .from('competitions')
      .select('end_date')
      .eq('id', req.params.id)
      .single();

    const endDate = b.end_date || current?.end_date;
    if (endDate && new Date(b.registration_deadline) > new Date(endDate)) {
      throw new HttpError(400, 'La fecha de cierre de inscripciones no puede ser posterior al fin de la competencia.');
    }
  }

  const parsedMaxTeams = b.max_teams !== undefined ? validarEnteroPositivo(b.max_teams, 'El cupo máximo de equipos') : undefined;
  const parsedMinRoster = b.min_roster !== undefined ? validarEnteroPositivo(b.min_roster, 'El mínimo de integrantes') : undefined;
  const parsedMaxRoster = b.max_roster !== undefined ? validarEnteroPositivo(b.max_roster, 'El máximo de integrantes') : undefined;

  if (parsedMinRoster !== undefined || parsedMaxRoster !== undefined) {
    const { data: current } = await supabase
      .from('competitions')
      .select('min_roster, max_roster')
      .eq('id', req.params.id)
      .single();

    const minFinal = parsedMinRoster !== undefined ? parsedMinRoster : current?.min_roster;
    const maxFinal = parsedMaxRoster !== undefined ? parsedMaxRoster : current?.max_roster;
    validarRangoRoster(minFinal, maxFinal);
  }

  const updateData = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) updateData.name = b.name;
  if (b.season !== undefined) updateData.season = b.season;
  if (b.status !== undefined) updateData.status = b.status;
  if (b.start_date !== undefined) updateData.start_date = b.start_date;
  if (b.end_date !== undefined) updateData.end_date = b.end_date;
  if (b.points_win_3_0 !== undefined) updateData.points_win_3_0 = b.points_win_3_0;
  if (b.points_win_3_2 !== undefined) updateData.points_win_3_2 = b.points_win_3_2;
  if (b.points_loss_2_3 !== undefined) updateData.points_loss_2_3 = b.points_loss_2_3;
  if (b.points_loss_0_3 !== undefined) updateData.points_loss_0_3 = b.points_loss_0_3;
  if (parsedMaxTeams !== undefined) updateData.max_teams = parsedMaxTeams;
  if (b.registration_deadline !== undefined) updateData.registration_deadline = b.registration_deadline || null;
  if (parsedMinRoster !== undefined) updateData.min_roster = parsedMinRoster;
  if (parsedMaxRoster !== undefined) updateData.max_roster = parsedMaxRoster;

  const { error } = await supabase
    .from('competitions')
    .update(updateData)
    .eq('id', req.params.id);

  if (error) throw fromSupabase(error, 'Competencia');

  const { data } = await supabase.from('competitions').select(SELECT_COMPETITION).eq('id', req.params.id).single();
  res.json({ data });
}));

// ==========================================
//    MÉTRICAS RÁPIDAS
// ==========================================

router.get('/:id/metrics', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const competitionId = req.params.id;

  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, status')
    .eq('competition_id', competitionId);

  const matchIds = (allMatches || []).map(m => m.id);
  const pendientesResultado = (allMatches || []).filter(m => ['PROGRAMADO', 'EN_CURSO'].includes(m.status)).length;

  let solicitudesPendientes = 0;
  if (matchIds.length > 0) {
    const { count } = await supabase
      .from('match_reschedulings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDIENTE')
      .in('match_id', matchIds);
    solicitudesPendientes = count || 0;
  }

  const programados = (allMatches || []).filter(m => m.status === 'PROGRAMADO').map(m => m.id);
  let partidosSinArbitro = 0;
  if (programados.length > 0) {
    const { data: conArbitro } = await supabase
      .from('referee_assignments')
      .select('match_id')
      .in('match_id', programados)
      .neq('status', 'ANULADA');

    const conArbitroIds = new Set((conArbitro || []).map(r => r.match_id));
    partidosSinArbitro = programados.filter(id => !conArbitroIds.has(id)).length;
  }

  res.json({
    data: {
      resultados_pendientes: pendientesResultado,
      solicitudes_reprogramacion: solicitudesPendientes,
      partidos_sin_arbitro: partidosSinArbitro
    }
  });
}));

// ==========================================
//    INSCRIPCIÓN DE EQUIPOS
// ==========================================

router.get('/:id/teams', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competition_teams')
    .select(`
      id, status, created_at,
      equipo:teams(id, name, short_name, status,
        categoria_id:category_value_id, rama_id:branch_value_id, modalidad_id:modality_value_id
      )
    `)
    .eq('competition_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) throw fromSupabase(error);
  res.json({ data });
}));

router.post('/:id/teams', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { team_id } = req.body;
  if (!team_id) throw new HttpError(400, 'team_id es obligatorio');

  const [comp, team] = await Promise.all([
    supabase.from('competitions').select('category_value_id, branch_value_id, modality_value_id, status, max_teams').eq('id', req.params.id).single(),
    supabase.from('teams').select('status, category_value_id, branch_value_id, modality_value_id').eq('id', team_id).single()
  ]);

  if (!comp.data) throw new HttpError(404, 'Competencia no encontrada.');
  if (!team.data) throw new HttpError(404, 'Equipo no encontrado.');

  if (!['PLANIFICACION', 'INSCRIPCIONES'].includes(comp.data.status)) {
    throw new HttpError(400, 'La competencia no admite inscripciones en su estado actual.');
  }

  if (team.data.status !== 'ACTIVO') throw new HttpError(400, 'El equipo debe estar activo para inscribirse.');

  if (
    comp.data.category_value_id !== team.data.category_value_id ||
    comp.data.branch_value_id !== team.data.branch_value_id ||
    comp.data.modality_value_id !== team.data.modality_value_id
  ) {
    throw new HttpError(400, 'La categoría, rama o modalidad del equipo no coincide con la competencia.');
  }

  const { data: id, error } = await supabase.rpc('sp_register_team_in_competition', {
    p_competition_id: req.params.id,
    p_team_id: team_id,
    p_admin_user: req.currentUser,
    p_status: 'INSCRITO'
  });

  if (error) throw fromSupabase(error);

  await supabase
    .from('competition_teams')
    .update({ revisada_at: new Date().toISOString() })
    .eq('id', id);

  res.status(201).json({ data: { id, competition_id: req.params.id, team_id } });
}));

router.delete('/:id/teams/:teamId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data: partidos } = await supabase
    .from('matches')
    .select('id')
    .eq('competition_id', req.params.id)
    .or(`home_team_id.eq.${req.params.teamId},away_team_id.eq.${req.params.teamId}`)
    .eq('status', 'FINALIZADO')
    .limit(1);

  if (partidos && partidos.length > 0) {
    throw new HttpError(400, 'No se puede retirar un equipo que ya disputó partidos finalizados.');
  }

  const { error } = await supabase
    .from('competition_teams')
    .update({ status: 'RETIRADO' })
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId);

  if (error) throw fromSupabase(error);
  res.json({ data: { message: 'Equipo retirado con éxito' } });
}));

// ==========================================
//    NÓMINAS DE COMPETENCIA
// ==========================================

// Consulta la nómina vigente y el cambio pendiente de aprobación (si existe).
// Exige autenticación para no exponer cédulas.
router.get('/:id/teams/:teamId/roster', requireAuth, asyncHandler(async (req, res) => {
  const [resOficial, resPendiente] = await Promise.all([
    supabase
      .from('competition_rosters')
      .select(`
        id, jersey_number, roster_role, is_habilitated, status, start_date, end_date,
        persona:persons(id, first_name, last_name, document_number, is_verified)
      `)
      .eq('competition_id', req.params.id)
      .eq('team_id', req.params.teamId)
      .order('jersey_number', { nullsFirst: false }),
    supabase
      .from('competition_roster_versions')
      .select('id, version_number, roster_snapshot, changes_summary, reason, created_by, created_at')
      .eq('competition_id', req.params.id)
      .eq('team_id', req.params.teamId)
      .eq('status', 'PENDIENTE_APROBACION')
      .maybeSingle()
  ]);

  if (resOficial.error) throw fromSupabase(resOficial.error);

  res.json({
    data: resOficial.data || [],
    pendiente: resPendiente.data || null
  });
}));

// Agrega un integrante. Si es FECOVOL aplica directo; si es asociación crea una
// versión PENDIENTE_APROBACION que FECOVOL debe aprobar.
router.post('/:id/teams/:teamId/roster', requireAuth, asyncHandler(async (req, res) => {
  const { person_id, jersey_number, roster_role, reason } = req.body;
  if (!person_id) throw new HttpError(400, 'person_id es obligatorio.');

  const { data: persona } = await supabase.from('persons').select('is_verified, first_name, last_name').eq('id', person_id).single();
  if (!persona || !persona.is_verified) {
    throw new HttpError(400, 'La persona no existe o no está verificada/habilitada.');
  }

  // Una persona con suspensión o expulsión disciplinaria en curso no puede figurar en una nómina.
  if (await personaSuspendida(person_id)) {
    throw new HttpError(400, 'La persona tiene una sanción disciplinaria vigente (suspensión o expulsión) y no puede inscribirse en la nómina.');
  }

  // Valida que la persona esté vinculada al equipo en la composición general
  const { data: enEquipo } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', req.params.teamId)
    .eq('person_id', person_id)
    .eq('status', 'ACTIVO')
    .maybeSingle();

  if (!enEquipo) {
    throw new HttpError(400, 'La persona debe estar activa en la composición general del equipo antes de inscribirla en la competencia.');
  }

  // Valida que no esté inscrita en otra nómina de la misma competencia
  const { data: enOtraNomina } = await supabase
    .from('competition_rosters')
    .select('id, team_id')
    .eq('competition_id', req.params.id)
    .eq('person_id', person_id)
    .eq('status', 'ACTIVO')
    .maybeSingle();

  if (enOtraNomina) {
    if (enOtraNomina.team_id === req.params.teamId) {
      throw new HttpError(400, 'La persona ya está registrada en esta nómina.');
    }
    throw new HttpError(400, 'La persona ya está inscrita en otro equipo de esta misma competencia.');
  }

  // Valida máximo de integrantes
  const { data: comp } = await supabase
    .from('competitions')
    .select('max_roster')
    .eq('id', req.params.id)
    .single();

  const maxRoster = comp?.max_roster ?? 18;
  const { count: actuales } = await supabase
    .from('competition_rosters')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .eq('status', 'ACTIVO');

  if ((actuales || 0) >= maxRoster) {
    throw new HttpError(400, `La nómina ya alcanzó el máximo de ${maxRoster} integrantes permitidos por la competencia.`);
  }

  // Valida rango del dorsal
  let dorsalFinal = null;
  if (jersey_number !== undefined && jersey_number !== null && jersey_number !== '') {
    const dorsal = Number(jersey_number);
    if (!Number.isInteger(dorsal) || dorsal < 1 || dorsal > 99) {
      throw new HttpError(400, 'El número de camiseta debe estar entre 1 y 99.');
    }
    const { data: dorsalOcupado } = await supabase
      .from('competition_rosters')
      .select('id')
      .eq('competition_id', req.params.id)
      .eq('team_id', req.params.teamId)
      .eq('jersey_number', dorsal)
      .eq('status', 'ACTIVO')
      .maybeSingle();
    if (dorsalOcupado) throw new HttpError(400, 'El número de camiseta ya está ocupado en este equipo.');
    dorsalFinal = dorsal;
  }

  // Construye el snapshot propuesto a partir del actual + esta alta
  const { data: snapshotActual } = await supabase.rpc('fn_roster_snapshot_actual', {
    p_competition_id: req.params.id,
    p_team_id: req.params.teamId
  });

  const snapshotPropuesto = snapshotConAlta(snapshotActual || [], {
    person_id,
    jersey_number: dorsalFinal,
    roster_role: roster_role || 'JUGADOR'
  });

  const summary = resumenCambio('ALTA', {
    nombre: `${persona.first_name} ${persona.last_name}`,
    jersey_number: dorsalFinal
  });

  if (req.userScope?.isAdmin) {
    const versionId = await aplicarDirectoYVersionar({
      competitionId: req.params.id,
      teamId: req.params.teamId,
      snapshotPropuesto,
      summary,
      reason,
      currentUser: req.currentUser
    });
    return res.status(201).json({ status: 'OFICIALIZADA', version_id: versionId });
  }

  // Asociación: obliga motivo y crea versión pendiente
  if (!reason || !String(reason).trim()) {
    throw new HttpError(400, 'Debes indicar el motivo del cambio para que FECOVOL lo revise.');
  }

  const versionId = await crearVersionPendiente({
    competitionId: req.params.id,
    teamId: req.params.teamId,
    snapshotPropuesto,
    summary,
    reason: String(reason).trim(),
    currentUser: req.currentUser
  });

  res.status(202).json({
    status: 'PENDIENTE_APROBACION',
    version_id: versionId,
    message: 'Cambio enviado a revisión de FECOVOL.'
  });
}));

// Da de baja a un integrante. Si es FECOVOL aplica directo; si es asociación crea versión pendiente.
router.delete('/:id/teams/:teamId/roster/:rosterId', requireAuth, asyncHandler(async (req, res) => {
  const { reason } = req.body || {};

  const { data: roster } = await supabase
    .from('competition_rosters')
    .select('id, person_id, persona:persons(first_name, last_name)')
    .eq('id', req.params.rosterId)
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .eq('status', 'ACTIVO')
    .single();

  if (!roster) throw new HttpError(404, 'No existe un integrante activo con ese id en esta nómina.');

  const { data: snapshotActual } = await supabase.rpc('fn_roster_snapshot_actual', {
    p_competition_id: req.params.id,
    p_team_id: req.params.teamId
  });

  const snapshotPropuesto = snapshotConBaja(snapshotActual || [], roster.person_id);
  const nombre = roster.persona ? `${roster.persona.first_name} ${roster.persona.last_name}` : null;
  const summary = resumenCambio('BAJA', { nombre });

  if (req.userScope?.isAdmin) {
    const versionId = await aplicarDirectoYVersionar({
      competitionId: req.params.id,
      teamId: req.params.teamId,
      snapshotPropuesto,
      summary,
      reason,
      currentUser: req.currentUser
    });
    return res.json({ status: 'OFICIALIZADA', version_id: versionId });
  }

  if (!reason || !String(reason).trim()) {
    throw new HttpError(400, 'Debes indicar el motivo de la baja para que FECOVOL lo revise.');
  }

  const versionId = await crearVersionPendiente({
    competitionId: req.params.id,
    teamId: req.params.teamId,
    snapshotPropuesto,
    summary,
    reason: String(reason).trim(),
    currentUser: req.currentUser
  });

  res.status(202).json({
    status: 'PENDIENTE_APROBACION',
    version_id: versionId,
    message: 'Baja enviada a revisión de FECOVOL.'
  });
}));

// Lista el historial de versiones de nómina del equipo en la competencia
router.get('/:id/teams/:teamId/roster/versions', requireAuth, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('competition_roster_versions')
    .select('id, version_number, status, changes_summary, reason, created_by, created_at, approved_by, approved_at, rejection_reason, roster_snapshot')
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .order('version_number', { ascending: false });

  if (error) throw fromSupabase(error);
  res.json({ data: data || [] });
}));

// Aprueba un cambio pendiente. Aplica el snapshot y marca la versión como OFICIALIZADA.
router.post('/:id/teams/:teamId/roster/versions/:versionId/approve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { data: version } = await supabase
    .from('competition_roster_versions')
    .select('*')
    .eq('id', req.params.versionId)
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .eq('status', 'PENDIENTE_APROBACION')
    .single();

  if (!version) throw new HttpError(404, 'No existe una versión pendiente con ese id.');

  const { error: errApply } = await supabase.rpc('sp_apply_roster_snapshot', {
    p_competition_id: req.params.id,
    p_team_id: req.params.teamId,
    p_snapshot: version.roster_snapshot,
    p_admin_user: req.currentUser
  });
  if (errApply) throw fromSupabase(errApply);

  const { data: actualizada, error: errUpd } = await supabase
    .from('competition_roster_versions')
    .update({
      status: 'OFICIALIZADA',
      approved_by: req.currentUser,
      approved_at: new Date().toISOString()
    })
    .eq('id', req.params.versionId)
    .select()
    .single();

  if (errUpd) throw fromSupabase(errUpd);
  res.json({ data: actualizada });
}));

// Rechaza un cambio pendiente. Deja la nómina oficial intacta.
router.post('/:id/teams/:teamId/roster/versions/:versionId/reject', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { rejection_reason } = req.body || {};

  const { data: version } = await supabase
    .from('competition_roster_versions')
    .select('id')
    .eq('id', req.params.versionId)
    .eq('competition_id', req.params.id)
    .eq('team_id', req.params.teamId)
    .eq('status', 'PENDIENTE_APROBACION')
    .single();

  if (!version) throw new HttpError(404, 'No existe una versión pendiente con ese id.');

  const { data: actualizada, error } = await supabase
    .from('competition_roster_versions')
    .update({
      status: 'RECHAZADA',
      approved_by: req.currentUser,
      approved_at: new Date().toISOString(),
      rejection_reason: rejection_reason || 'Sin motivo especificado'
    })
    .eq('id', req.params.versionId)
    .select()
    .single();

  if (error) throw fromSupabase(error);
  res.json({ data: actualizada });
}));

// ==========================================
//    GENERACIÓN AUTOMÁTICA DE CALENDARIO (Berger)
// ==========================================

// Genera enfrentamientos con el algoritmo round-robin (Berger).
// Recibe los equipos y devuelve un arreglo de jornadas. Si idaVuelta es true,
// agrega una segunda vuelta invirtiendo local y visitante.
function generarBerger(equipos, idaVuelta = false) {
  const lista = equipos.map(e => ({ ...e }));
  if (lista.length % 2 !== 0) lista.push({ id: null, nombre: 'DESCANSO', _descanso: true });

  const n = lista.length;
  const jornadas = [];
  const fijo = lista[0];
  let rotantes = lista.slice(1);

  for (let j = 0; j < n - 1; j++) {
    const partidos = [];

    const rival = rotantes[rotantes.length - 1];
    if (!fijo._descanso && !rival._descanso) {
      if (j % 2 === 0) partidos.push({ local: fijo, visitante: rival });
      else partidos.push({ local: rival, visitante: fijo });
    }

    for (let i = 0; i < (n - 2) / 2; i++) {
      const a = rotantes[i];
      const b = rotantes[rotantes.length - 2 - i];
      if (a._descanso || b._descanso) continue;
      if (i % 2 === 0) partidos.push({ local: a, visitante: b });
      else partidos.push({ local: b, visitante: a });
    }

    jornadas.push(partidos);
    rotantes = [rotantes[rotantes.length - 1], ...rotantes.slice(0, -1)];
  }

  if (!idaVuelta) return jornadas;

  const vueltas = jornadas.map(j =>
    j.map(p => ({ local: p.visitante, visitante: p.local }))
  );
  return [...jornadas, ...vueltas];
}

// ==========================================
//    TABLA DE POSICIONES
// ==========================================

router.get('/:id/standings', asyncHandler(async (req, res) => {
  // Ordena por puntos, luego por ratio de sets y por ratio de puntos según las reglas de desempate
  const { data, error } = await supabase
    .from('v_standings')
    .select('*')
    .eq('competition_id', req.params.id)
    .order('total_points', { ascending: false })
    .order('ratio_sets', { ascending: false })
    .order('ratio_puntos', { ascending: false });

  if (error) throw fromSupabase(error);

  const { count: partidosPendientes } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', req.params.id)
    .neq('status', 'FINALIZADO');

  res.json({
    data: data || [],
    es_parcial: (partidosPendientes || 0) > 0,
    ultima_actualizacion: new Date().toISOString()
  });
}));

// ==========================================
//    GENERACIÓN Y EDICIÓN DE JORNADAS
// ==========================================

// Crea el calendario completo en una sola pasada.
// Valida equipos inscritos, sede del catálogo y fechas dentro de la competencia.
// Si ya hay partidos, exige el flag `force: true` para reemplazarlos.
router.post('/:id/generate-calendar', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fecha_inicio, dias_entre, hora_default, sede_default_id, ida_vuelta, force } = req.body;

  if (!fecha_inicio) throw new HttpError(400, 'Debes indicar la fecha de inicio.');
  if (!dias_entre || parseInt(dias_entre) < 1) throw new HttpError(400, 'Los días entre jornadas deben ser al menos 1.');
  if (!hora_default) throw new HttpError(400, 'Debes indicar la hora por defecto.');
  if (!sede_default_id) throw new HttpError(400, 'Debes seleccionar una sede por defecto.');

  const { data: comp, error: errComp } = await supabase
    .from('competitions')
    .select('id, name, status, start_date, end_date')
    .eq('id', id)
    .single();

  if (errComp || !comp) throw new HttpError(404, 'Competencia no encontrada.');
  if (!['PLANIFICACION', 'INSCRIPCIONES', 'EN_CURSO'].includes(comp.status)) {
    throw new HttpError(400, 'La competencia debe estar en planificación, inscripciones o en curso para generar el calendario.');
  }

  // Valida la sede contra el catálogo "Sedes"
  const { data: sede } = await supabase
    .from('catalog_values')
    .select('id, value, catalogs!inner(name)')
    .eq('id', sede_default_id)
    .eq('catalogs.name', 'Sedes')
    .maybeSingle();
  if (!sede) throw new HttpError(400, 'La sede por defecto no es válida.');

  if (new Date(fecha_inicio) > new Date(comp.end_date)) {
    throw new HttpError(400, 'La fecha de inicio no puede ser posterior al fin de la competencia.');
  }

  // Verifica partidos existentes
  if (!force) {
    const { count: existing } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', id);

    if ((existing || 0) > 0) {
      return res.status(409).json({
        requires_confirmation: true,
        message: `Esta competencia ya tiene ${existing} partido(s) programado(s). ¿Deseas reemplazar el calendario existente?`,
        existing_matches: existing
      });
    }
  } else {
    // Valida que no haya partidos finalizados antes de borrar
    const { count: played } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', id)
      .eq('status', 'FINALIZADO');

    if ((played || 0) > 0) {
      throw new HttpError(400, 'No se puede regenerar el calendario porque ya hay partidos jugados.');
    }

    await supabase.from('matches').delete().eq('competition_id', id);
  }

  // Carga equipos inscritos
  const { data: equipos, error: errTeams } = await supabase
    .from('competition_teams')
    .select('equipo:teams(id, name)')
    .eq('competition_id', id)
    .eq('status', 'INSCRITO');

  if (errTeams) throw fromSupabase(errTeams);
  if (!equipos || equipos.length < 2) {
    throw new HttpError(400, 'Se necesitan al menos 2 equipos inscritos para generar el calendario.');
  }

  const equiposNorm = equipos.map(e => ({ id: e.equipo.id, nombre: e.equipo.name }));
  const jornadas = generarBerger(equiposNorm, Boolean(ida_vuelta));

  const matchesToInsert = [];
  let matchNumber = 1;
  const dias = parseInt(dias_entre);

  jornadas.forEach((jornada, idx) => {
    const fechaJ = new Date(fecha_inicio + 'T12:00:00');
    fechaJ.setDate(fechaJ.getDate() + idx * dias);
    const fechaISO = fechaJ.toISOString().slice(0, 10);

    jornada.forEach(p => {
      matchesToInsert.push({
        competition_id: id,
        match_number: matchNumber++,
        matchday: idx + 1,
        home_team_id: p.local.id,
        away_team_id: p.visitante.id,
        scheduled_date: fechaISO,
        scheduled_time: hora_default,
        venue_id: sede_default_id,
        status: 'PROGRAMADO'
      });
    });
  });

  const { data: inserted, error: errInsert } = await supabase
    .from('matches')
    .insert(matchesToInsert)
    .select('id');

  if (errInsert) throw fromSupabase(errInsert);

  try {
    await supabase.from('audit_logs').insert([{
      usuario: req.currentUser,
      accion: 'GENERACION_CALENDARIO',
      tabla: 'matches',
      registro_id: id,
      registro_nuevo: {
        evento: 'Generación automática de calendario (Berger)',
        competition_id: id,
        competition_name: comp.name,
        matchdays: jornadas.length,
        matches: matchesToInsert.length,
        fecha_inicio,
        dias_entre: dias,
        hora_default,
        sede: sede.value,
        ida_vuelta: Boolean(ida_vuelta),
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {}

  res.status(201).json({
    data: {
      matches_created: inserted.length,
      matchdays: jornadas.length,
      sede_usada: sede.value
    }
  });
}));

// Actualiza la fecha de todos los partidos de una jornada.
// Valida que la nueva fecha quede estrictamente entre las jornadas vecinas.
router.patch('/:id/matchdays/:matchday', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { id, matchday } = req.params;
  const { scheduled_date } = req.body;

  if (!scheduled_date) throw new HttpError(400, 'Debes indicar la nueva fecha.');

  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, matchday, scheduled_date')
    .eq('competition_id', id)
    .order('matchday');

  if (!allMatches || allMatches.length === 0) {
    throw new HttpError(404, 'No hay partidos en esta competencia.');
  }

  const matchdayNum = parseInt(matchday);
  const fechasPorJornada = {};
  allMatches.forEach(m => {
    if (!fechasPorJornada[m.matchday]) fechasPorJornada[m.matchday] = m.scheduled_date;
  });

  const numeros = Object.keys(fechasPorJornada).map(Number).sort((a, b) => a - b);
  const idx = numeros.indexOf(matchdayNum);
  if (idx === -1) throw new HttpError(404, 'La jornada no existe.');

  const anterior = idx > 0 ? fechasPorJornada[numeros[idx - 1]] : null;
  const siguiente = idx < numeros.length - 1 ? fechasPorJornada[numeros[idx + 1]] : null;

  if (anterior && scheduled_date <= anterior) {
    throw new HttpError(400, `La fecha debe ser estrictamente posterior a la jornada ${numeros[idx - 1]} (${anterior}).`);
  }
  if (siguiente && scheduled_date >= siguiente) {
    throw new HttpError(400, `La fecha debe ser estrictamente anterior a la jornada ${numeros[idx + 1]} (${siguiente}).`);
  }

  const { data: updated, error } = await supabase
    .from('matches')
    .update({
      scheduled_date,
      status: 'REPROGRAMADO',
      updated_at: new Date().toISOString()
    })
    .eq('competition_id', id)
    .eq('matchday', matchdayNum)
    .select('id');

  if (error) throw fromSupabase(error);

  try {
    await supabase.from('audit_logs').insert([{
      usuario: req.currentUser,
      accion: 'REPROGRAMACION_JORNADA',
      tabla: 'matches',
      registro_id: id,
      registro_nuevo: {
        evento: 'Reprogramación de jornada completa',
        competition_id: id,
        matchday: matchdayNum,
        nueva_fecha: scheduled_date,
        fecha_anterior: fechasPorJornada[matchdayNum],
        partidos_afectados: updated.length,
        timestamp: new Date().toISOString()
      }
    }]);
  } catch (errAudit) {}

  res.json({
    data: {
      matchday: matchdayNum,
      scheduled_date,
      updated_matches: updated.length
    }
  });
}));

module.exports = router;