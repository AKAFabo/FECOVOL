// Cifras de la Federación para la página pública "La Federación" (montado en /api/public/federation).
//
// Solo devuelve conteos: ningún nombre ni dato de personas. Se cuentan únicamente registros en
// estado vigente, con el mismo criterio que el resto del portal (asociaciones afiliadas, equipos
// activos de esas asociaciones, personas activas y árbitros con el rol activo).
const express = require('express');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const { fallaBaseDatos } = require('../../public/dbError');

const router = express.Router();

async function contar(consulta) {
  const { count, error } = await consulta;
  if (error) throw fallaBaseDatos(error);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

const SOLO_CONTEO = { count: 'exact', head: true };

// GET /api/public/federation
router.get('/', asyncHandler(async (req, res) => {
  const [asociaciones, equipos, personas, arbitros] = await Promise.all([
    contar(supabase.from('associations').select('id', SOLO_CONTEO).eq('status', 'AFILIADA')),
    contar(
      supabase
        .from('teams')
        .select('id, asociacion:associations!inner(status)', SOLO_CONTEO)
        .eq('status', 'ACTIVO')
        .eq('asociacion.status', 'AFILIADA')
    ),
    contar(supabase.from('persons').select('id', SOLO_CONTEO).eq('status', 'ACTIVA')),
    contar(
      supabase
        .from('person_roles')
        .select('id, persona:persons!inner(status)', SOLO_CONTEO)
        .eq('role_type', 'ARBITRO')
        .eq('is_active', true)
        .eq('persona.status', 'ACTIVA')
    )
  ]);

  res.json({
    data: {
      associations: asociaciones,
      teams: equipos,
      people: personas,
      referees: arbitros
    }
  });
}));

module.exports = router;
