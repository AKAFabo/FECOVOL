const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');

const router = express.Router();
router.param('id', validateUuidParams);

// Exige autenticación para cualquier operación
const requireAuth = (req, res, next) => {
  if (req.userScope?.isPublic) return next(new HttpError(401, 'Se requiere autenticación.'));
  next();
};

// Exige rol de administrador o personal FECOVOL
const requireAdmin = (req, res, next) => {
  if (!req.userScope?.isAdmin) return next(new HttpError(403, 'Solo el personal de FECOVOL puede realizar esta acción.'));
  next();
};

// ==========================================
//     ENVÍO DE INSCRIPCIÓN (Asociación)
// ==========================================

// Envía una solicitud de inscripción. Queda como PENDIENTE hasta que FECOVOL la revise.
// La inscripción directa del administrador se hace por POST /api/competitions/:id/teams.
router.post('/submit', requireAuth, asyncHandler(async (req, res) => {
  const { competition_id, team_id } = req.body;
  if (!competition_id || !team_id) throw new HttpError(400, 'competition_id y team_id son obligatorios.');

  // Consulta la competencia y el equipo para validar
  const [comp, team] = await Promise.all([
    supabase
      .from('competitions')
      .select('id, category_value_id, branch_value_id, modality_value_id, status, end_date, registration_deadline, max_teams')
      .eq('id', competition_id)
      .single(),
    supabase
      .from('teams')
      .select('id, status, association_id, category_value_id, branch_value_id, modality_value_id')
      .eq('id', team_id)
      .single()
  ]);

  if (!comp.data) throw new HttpError(404, 'Competencia no encontrada.');
  if (!team.data) throw new HttpError(404, 'Equipo no encontrado.');

  // Valida que la competencia acepte inscripciones
  if (!['INSCRIPCIONES', 'PLANIFICACION'].includes(comp.data.status)) {
    throw new HttpError(400, 'La competencia no acepta inscripciones en este momento.');
  }

  // Usa la fecha de cierre de inscripciones si existe, si no el fin de la competencia
  const deadline = comp.data.registration_deadline || comp.data.end_date;
  if (deadline && new Date(deadline) < new Date()) {
    throw new HttpError(400, 'La fecha límite de inscripción ya pasó.');
  }

  // Valida que el equipo esté activo
  if (team.data.status !== 'ACTIVO') throw new HttpError(400, 'El equipo debe estar activo para inscribirse.');

  // Valida que si el usuario es asociación, el equipo le pertenezca
  if (req.userScope.isAssociation && team.data.association_id !== req.userScope.organizationId) {
    throw new HttpError(403, 'El equipo no pertenece a su asociación.');
  }

  // Valida que la categoría, rama y modalidad del equipo coincidan con la competencia
  if (
    comp.data.category_value_id !== team.data.category_value_id ||
    comp.data.branch_value_id !== team.data.branch_value_id ||
    comp.data.modality_value_id !== team.data.modality_value_id
  ) {
    throw new HttpError(400, 'La categoría, rama o modalidad del equipo no coincide con la competencia.');
  }

  // Valida que el equipo no esté ya registrado en esta competencia
  const { data: existing } = await supabase
    .from('competition_teams')
    .select('id, status')
    .eq('competition_id', competition_id)
    .eq('team_id', team_id)
    .maybeSingle();

  if (existing) {
    throw new HttpError(400, `El equipo ya está registrado en esta competencia (estado: ${existing.status}).`);
  }

  // Valida el cupo máximo de la competencia
  const maxTeams = comp.data.max_teams || 12;
  const { count: currentCount } = await supabase
    .from('competition_teams')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competition_id)
    .in('status', ['INSCRITO', 'PENDIENTE', 'POR_SUBSANAR', 'DEVUELTA']);

  if ((currentCount || 0) >= maxTeams) {
    throw new HttpError(400, `La competencia alcanzó el cupo máximo de ${maxTeams} equipos.`);
  }

  // Inserta la inscripción con estado PENDIENTE
  const { data, error } = await supabase
    .from('competition_teams')
    .insert({ competition_id, team_id, status: 'PENDIENTE' })
    .select()
    .single();

  if (error) throw fromSupabase(error);

  // Registra la acción en la bitácora manualmente
  await supabase.from('audit_logs').insert([{
    usuario: req.currentUser,
    accion: 'INSERT',
    tabla: 'competition_teams',
    registro_id: data.id,
    registro_nuevo: { competition_id, team_id, status: 'PENDIENTE', submitted_by: req.userScope.userEmail || req.currentUser }
  }]);

  res.status(201).json({ data });
}));

// ==========================================
//      LISTADO GLOBAL DE INSCRIPCIONES
// ==========================================

router.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { competition_id, association_id, status } = req.query;

  let query = supabase
    .from('competition_teams')
    .select(`
      id, status, created_at, enviada_at, revisada_at, observaciones,
      equipo:teams(id, name, short_name, association_id,
        asociacion:associations(id, name, short_name)
      ),
      competencia:competitions(id, name, season)
    `)
    .order('created_at', { ascending: false });

  if (competition_id) query = query.eq('competition_id', competition_id);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw fromSupabase(error);

  // Filtra por asociación en memoria para evitar conflictos de join
  const filtered = association_id
    ? (data || []).filter(d => d.equipo?.association_id === association_id)
    : (data || []);

  res.json({ data: filtered });
}));

// ==========================================
// MÉTRICAS DE INSCRIPCIONES POR COMPETENCIA
// ==========================================

router.get('/metrics/:competitionId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const competitionId = req.params.competitionId;

  // Ejecuta todas las consultas en paralelo
  const [
    { data: comp },
    { count: total },
    { count: inscritos },
    { count: pendientes },
    { count: devueltas }
  ] = await Promise.all([
    supabase.from('competitions').select('id, name, end_date, registration_deadline, max_teams, min_roster, max_roster, status').eq('id', competitionId).single(),
    supabase.from('competition_teams').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId).in('status', ['INSCRITO', 'PENDIENTE', 'POR_SUBSANAR', 'DEVUELTA']),
    supabase.from('competition_teams').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId).eq('status', 'INSCRITO'),
    supabase.from('competition_teams').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId).eq('status', 'PENDIENTE'),
    supabase.from('competition_teams').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId).in('status', ['DEVUELTA', 'POR_SUBSANAR'])
  ]);

  if (!comp) throw new HttpError(404, 'Competencia no encontrada.');

  // Usa la fecha de cierre de inscripciones si existe, si no el fin de la competencia
  const deadline = comp.registration_deadline || comp.end_date;
  const diasRestantes = deadline ? Math.max(0, Math.ceil((new Date(deadline) - new Date()) / 86400000)) : 0;
  const maxTeams = comp.max_teams || 12;

  res.json({
    data: {
      competition: comp,
      total_equipos: total || 0,
      inscritos: inscritos || 0,
      pendientes: pendientes || 0,
      devueltas: devueltas || 0,
      cupos_maximos: maxTeams,
      cupos_disponibles: Math.max(0, maxTeams - (total || 0)),
      dias_para_cierre: diasRestantes,
      registration_deadline: deadline,
      // Expone los límites de nómina configurados en la competencia para que la UI los muestre.
      min_roster: comp.min_roster ?? 12,
      max_roster: comp.max_roster ?? 18
    }
  });
}));

// ==========================================
//     REVISIÓN DE INSCRIPCIÓN (FECOVOL)
// ==========================================

router.patch('/:id/review', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { status, observaciones } = req.body;
  const permitidos = ['INSCRITO', 'DEVUELTA', 'POR_SUBSANAR'];
  if (!permitidos.includes(status)) {
    throw new HttpError(400, `status solo admite: ${permitidos.join(', ')}.`);
  }

  // Valida que la inscripción exista
  const { data: current } = await supabase
    .from('competition_teams')
    .select('id, status')
    .eq('id', req.params.id)
    .single();

  if (!current) throw new HttpError(404, 'Inscripción no encontrada.');

  // Actualiza el estado y guarda las observaciones
  const { error } = await supabase
    .from('competition_teams')
    .update({
      status,
      observaciones: observaciones || null,
      revisada_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  if (error) throw fromSupabase(error);

  // Registra la acción en la bitácora
  await supabase.from('audit_logs').insert([{
    usuario: req.currentUser,
    accion: 'UPDATE',
    tabla: 'competition_teams',
    registro_id: req.params.id,
    registro_viejo: { status: current.status },
    registro_nuevo: { status, observaciones, revisada_por: req.currentUser }
  }]);

  const { data } = await supabase.from('competition_teams').select('*').eq('id', req.params.id).single();
  res.json({ data });
}));

module.exports = router;