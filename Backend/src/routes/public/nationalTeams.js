// Selecciones nacionales para el portal público (montado en /api/public/national-teams).
//
// Solo convocatorias PUBLICADAS de selecciones activas, y de cada atleta únicamente nombre, número
// y posición (regla de publicación del portal): nada de cédulas, fechas de nacimiento, contactos
// ni asociación. Del cuerpo técnico, nombre y cargo.
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { fallaBaseDatos } = require('../../public/dbError');
const { aSelecciones } = require('../../public/nationalTeamsDto');

const router = express.Router();

// GET /api/public/national-teams
router.get('/', asyncHandler(async (req, res) => {
  const [selecciones, convocatorias, eventos] = await Promise.all([
    supabase
      .from('national_teams')
      .select('id, name, modality, rama:catalog_values!national_teams_branch_fkey(value), categoria:catalog_values!national_teams_category_fkey(value)')
      .eq('status', 'ACTIVA')
      .order('name'),
    supabase
      .from('national_team_callups')
      .select(`id, title, published_at, national_team_id,
        evento:national_team_events!national_team_callups_event_fkey(id, name, start_date, end_date, venue, status),
        integrantes:national_team_callup_members(member_type, jersey_number, staff_role,
          posicion:catalog_values!callup_members_position_fkey(value),
          persona:persons!callup_members_person_fkey(first_name, last_name, status))`)
      .eq('status', 'PUBLICADA')
      .order('published_at', { ascending: false })
      .limit(100),
    supabase
      .from('national_team_events')
      .select('id, name, modality, start_date, end_date, venue, status')
      .neq('status', 'CANCELADO')
      .order('start_date')
      .limit(100)
  ]);
  for (const r of [selecciones, convocatorias, eventos]) {
    if (r.error) throw fallaBaseDatos(r.error);
  }
  res.json(aSelecciones({ selecciones: selecciones.data || [], convocatorias: convocatorias.data || [], eventos: eventos.data || [] }));
}));

module.exports = router;
