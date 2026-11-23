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

// GET /api/reports/admin-dashboard -> Resumen ejecutivo en tiempo real para el panel de FECOVOL (RF-ADM-001)
router.get('/admin-dashboard', asyncHandler(async (req, res) => {
  const scope = req.userScope || { type: 'PUBLIC', isPublic: true };
  if (!scope.isAdmin) {
    throw new HttpError(403, 'Acceso denegado: Solo el personal administrador de FECOVOL puede consultar este panel.');
  }

  const ahora = new Date();
  const hoyStr = ahora.toISOString().slice(0, 10);
  const enTreintaStr = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Asociaciones y vigencias legales
  const { data: asociaciones, error: errAso } = await supabase
    .from('associations')
    .select('id, name, short_name, status, province, canton, affiliation_date')
    .order('name');
  if (errAso) throw fromSupabase(errAso);

  const listaAso = asociaciones || [];
  const asoIds = listaAso.map(a => a.id);

  let docsPorAso = {};
  if (asoIds.length > 0) {
    try {
      const { data: docs } = await supabase
        .from('v_documentos')
        .select('owner_association_id, status, expiry_date, document_type_code')
        .in('owner_association_id', asoIds);

      (docs || []).forEach(d => {
        const idAso = d.owner_association_id;
        if (!docsPorAso[idAso]) {
          docsPorAso[idAso] = { en_revision: 0, por_vencer: 0, vencidos: 0, vigentes: 0 };
        }
        const esVencido = d.expiry_date && d.expiry_date < hoyStr;
        if (d.status === 'RECHAZADO' || d.status === 'VENCIDO' || esVencido) {
          docsPorAso[idAso].vencidos++;
        } else if (d.status === 'EN_REVISION' || d.status === 'PENDIENTE') {
          docsPorAso[idAso].en_revision++;
        } else if (d.expiry_date && d.expiry_date <= enTreintaStr) {
          docsPorAso[idAso].por_vencer++;
        } else {
          docsPorAso[idAso].vigentes++;
        }
      });
    } catch (_) {}
  }

  let alDiaCount = 0;
  let conObservacionesCount = 0;
  let vencidasCount = 0;

  const asociacionesEnriquecidas = listaAso.map(a => {
    const docInfo = docsPorAso[a.id] || { en_revision: 0, por_vencer: 0, vencidos: 0, vigentes: 0 };
    let estadoLegal = 'AL_DIA';
    if (docInfo.vencidos > 0) {
      estadoLegal = 'VENCIDA';
      vencidasCount++;
    } else if (docInfo.en_revision > 0 || docInfo.por_vencer > 0) {
      estadoLegal = 'CON_OBSERVACIONES';
      conObservacionesCount++;
    } else {
      alDiaCount++;
    }
    return {
      ...a,
      documentos: docInfo,
      estadoLegal
    };
  });

  const totalAfiliadas = listaAso.filter(a => a.status === 'AFILIADA').length;

  // 2. Conteo de atletas, entrenadores y árbitros activos en el padrón central
  let padron = {
    total: 0,
    verificadas: 0,
    atletasActivos: 0,
    entrenadoresActivos: 0,
    arbitrosActivos: 0
  };

  try {
    const [totP, verP, jugP, tecP, arbP] = await Promise.all([
      supabase.from('persons').select('id', { count: 'exact', head: true }),
      supabase.from('persons').select('id', { count: 'exact', head: true }).eq('is_verified', true),
      supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'JUGADOR').eq('is_active', true),
      supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'TECNICO').eq('is_active', true),
      supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'ARBITRO').eq('is_active', true)
    ]);
    padron = {
      total: totP?.count || 0,
      verificadas: verP?.count || 0,
      atletasActivos: jugP?.count || 0,
      entrenadoresActivos: tecP?.count || 0,
      arbitrosActivos: arbP?.count || 0
    };
  } catch (_) {}

  // 3. Competencias en curso y partidos disputados en la semana
  const diaSemana = ahora.getDay() === 0 ? 6 : ahora.getDay() - 1;
  const inicioSemana = new Date(ahora);
  inicioSemana.setDate(ahora.getDate() - diaSemana);
  inicioSemana.setHours(0, 0, 0, 0);
  const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10);

  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6);
  finSemana.setHours(23, 59, 59, 999);
  const finSemanaStr = finSemana.toISOString().slice(0, 10);

  let competenciasResumen = {
    totalEnCurso: 0,
    totalInscripciones: 0,
    totalPlanificacion: 0,
    partidosSemanaDisputados: 0,
    partidosSemanaProgramados: 0,
    listaEnCurso: [],
    partidosRecientes: []
  };

  try {
    const { data: compList } = await supabase
      .from('competitions')
      .select('id, name, season, category_code, branch_code, modality_code, status')
      .in('status', ['EN_CURSO', 'INSCRIPCIONES', 'PLANIFICACION'])
      .order('created_at', { ascending: false });

    const comps = compList || [];
    competenciasResumen.totalEnCurso = comps.filter(c => c.status === 'EN_CURSO').length;
    competenciasResumen.totalInscripciones = comps.filter(c => c.status === 'INSCRIPCIONES').length;
    competenciasResumen.totalPlanificacion = comps.filter(c => c.status === 'PLANIFICACION').length;
    competenciasResumen.listaEnCurso = comps;

    const { data: matchesList } = await supabase
      .from('matches')
      .select(`
        id, scheduled_date, scheduled_time, status, home_sets_won, away_sets_won, matchday,
        competition:competitions(id, name),
        local:teams!matches_home_team_id_fkey(id, name),
        visitante:teams!matches_away_team_id_fkey(id, name)
      `)
      .gte('scheduled_date', inicioSemanaStr)
      .lte('scheduled_date', finSemanaStr)
      .order('scheduled_date', { ascending: false })
      .limit(20);

    const matches = matchesList || [];
    competenciasResumen.partidosSemanaDisputados = matches.filter(m => m.status === 'FINALIZADO').length;
    competenciasResumen.partidosSemanaProgramados = matches.filter(m => m.status === 'PROGRAMADO').length;
    competenciasResumen.partidosRecientes = matches;
  } catch (_) {}

  // 4. Alertas inmediatas sobre documentos pendientes de validación o licencias por expirar
  let alertas = {
    total: 0,
    documentosPendientes: 0,
    licenciasPorVencer: 0,
    documentosVencidos: 0,
    items: []
  };

  try {
    const { data: docsAlertas } = await supabase
      .from('documents')
      .select(`
        id, file_name, document_type_code, status, expiry_date, created_at, notes,
        association:associations(name),
        person:persons(first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(40);

    const items = [];
    (docsAlertas || []).forEach(d => {
      const esVencido = d.status === 'VENCIDO' || (d.expiry_date && d.expiry_date < hoyStr && d.status !== 'RECHAZADO');
      const esPendiente = d.status === 'EN_REVISION' || d.status === 'PENDIENTE';
      const esPorVencer = !esVencido && !esPendiente && d.status === 'VIGENTE' && d.expiry_date && d.expiry_date <= enTreintaStr;

      if (!esVencido && !esPendiente && !esPorVencer) return;

      let tipoAlerta = 'REVISION';
      let urgencia = 'MEDIA';
      let titulo = 'Documento pendiente de revisión';

      if (esVencido) {
        tipoAlerta = 'VENCIDO';
        urgencia = 'ALTA';
        titulo = 'Documento / Licencia vencida';
        alertas.documentosVencidos++;
      } else if (esPendiente) {
        tipoAlerta = 'REVISION';
        urgencia = 'ALTA';
        titulo = 'Documento pendiente de validación';
        alertas.documentosPendientes++;
      } else if (esPorVencer) {
        tipoAlerta = 'POR_VENCER';
        urgencia = 'MEDIA';
        titulo = 'Licencia próxima a expirar (30 días)';
        alertas.licenciasPorVencer++;
      }

      const titular = d.person
        ? `${d.person.first_name} ${d.person.last_name}`
        : (d.association?.name || 'Asociación');

      items.push({
        id: d.id,
        tipoAlerta,
        urgencia,
        titulo,
        titular,
        nombreArchivo: d.file_name,
        tipoDocumento: d.document_type_code,
        fechaVencimiento: d.expiry_date,
        notas: d.notes,
        enlace: '/admin/documentos'
      });
    });

    alertas.items = items;
    alertas.total = items.length;
  } catch (_) {}

  res.json({
    data: {
      asociaciones: {
        total: listaAso.length,
        afiliadas: totalAfiliadas,
        provisionales: listaAso.filter(a => a.status === 'PROVISIONAL').length,
        suspendidas: listaAso.filter(a => a.status === 'SUSPENDIDA').length,
        vigenciaLegal: {
          alDia: alDiaCount,
          conObservaciones: conObservacionesCount,
          vencidas: vencidasCount
        },
        lista: asociacionesEnriquecidas
      },
      padronPersonas: padron,
      competencias: competenciasResumen,
      alertas
    }
  });
}));

module.exports = router;