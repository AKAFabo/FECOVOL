// Asociaciones afiliadas para el portal público (montado en /api/public/associations).
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { HttpError } = require('../../utils/httpError');
const validateUuidParams = require('../../middleware/validateUuidParams');
const { fallaBaseDatos } = require('../../public/dbError');
const { ESTADOS_PUBLICOS } = require('../../public/competitionsDto');
const {
  ESTADO_PUBLICO_ASOCIACION,
  ESTADO_PUBLICO_EQUIPO,
  aAsociacionResumen,
  aAsociacionDetalle,
  aEquipo
} = require('../../public/associationsDto');

const router = express.Router();
router.param('id', validateUuidParams);

const MAX_ASOCIACIONES = 300;

// Solo las columnas que el DTO publica; nunca select('*').
const SELECT_RESUMEN = 'id, name, short_name, province, canton, home_venue';
const SELECT_DETALLE = `${SELECT_RESUMEN}, website, affiliation_date`;
const SELECT_EQUIPO = `
  id, name, short_name, home_venue,
  categoria:catalog_values!teams_category_value_id_fkey(value),
  rama:catalog_values!teams_branch_value_id_fkey(value),
  modalidad:catalog_values!teams_modality_value_id_fkey(value)
`;

// GET /api/public/associations
// Todas las asociaciones afiliadas con la cantidad de equipos activos. El portal filtra por
// provincia y busca por nombre del lado del navegador, así esta ruta no recibe parámetros.
router.get('/', asyncHandler(async (req, res) => {
  const { data: asociaciones, error } = await supabase
    .from('associations')
    .select(SELECT_RESUMEN)
    .eq('status', ESTADO_PUBLICO_ASOCIACION)
    .order('name')
    .limit(MAX_ASOCIACIONES);
  if (error) throw fallaBaseDatos(error);

  const ids = (asociaciones || []).map((a) => a.id);
  const equiposPorAsociacion = new Map();

  if (ids.length) {
    const { data: equipos, error: errorEquipos } = await supabase
      .from('teams')
      .select('association_id')
      .in('association_id', ids)
      .eq('status', ESTADO_PUBLICO_EQUIPO);
    if (errorEquipos) throw fallaBaseDatos(errorEquipos);

    for (const e of equipos || []) {
      equiposPorAsociacion.set(e.association_id, (equiposPorAsociacion.get(e.association_id) || 0) + 1);
    }
  }

  res.json({ data: (asociaciones || []).map((a) => aAsociacionResumen(a, equiposPorAsociacion.get(a.id) || 0)) });
}));

// GET /api/public/associations/:id
// Datos públicos de la asociación, sus equipos activos y las competencias publicadas en que cada
// equipo está inscrito.
router.get('/:id', asyncHandler(async (req, res) => {
  const { data: asociacion, error } = await supabase
    .from('associations')
    .select(SELECT_DETALLE)
    .eq('id', req.params.id)
    .eq('status', ESTADO_PUBLICO_ASOCIACION)
    .maybeSingle();
  if (error) throw fallaBaseDatos(error);
  // Igual respuesta para "no existe" y "no está afiliada", para no revelar asociaciones provisionales.
  if (!asociacion) throw new HttpError(404, 'Asociación no encontrada');

  const { data: equipos, error: errorEquipos } = await supabase
    .from('teams')
    .select(SELECT_EQUIPO)
    .eq('association_id', req.params.id)
    .eq('status', ESTADO_PUBLICO_EQUIPO)
    .order('name');
  if (errorEquipos) throw fallaBaseDatos(errorEquipos);

  const idsEquipos = (equipos || []).map((e) => e.id);
  const competenciasPorEquipo = new Map();

  if (idsEquipos.length) {
    const { data: inscripciones, error: errorInsc } = await supabase
      .from('competition_teams')
      .select('team_id, competencia:competitions(id, name, status)')
      .in('team_id', idsEquipos)
      .eq('status', 'INSCRITO');
    if (errorInsc) throw fallaBaseDatos(errorInsc);

    for (const i of inscripciones || []) {
      // Las competencias en planificación (borradores) no se muestran.
      if (!i.competencia || !ESTADOS_PUBLICOS.includes(i.competencia.status)) continue;
      if (!competenciasPorEquipo.has(i.team_id)) competenciasPorEquipo.set(i.team_id, []);
      competenciasPorEquipo.get(i.team_id).push(i.competencia);
    }
  }

  const equiposPublicos = (equipos || []).map((e) => aEquipo(e, competenciasPorEquipo.get(e.id)));
  res.json({ data: aAsociacionDetalle(asociacion, equiposPublicos) });
}));

module.exports = router;
