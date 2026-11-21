// Reportes y nóminas de consulta de la asociación (RF-ASO-008).
//
// Listados de los equipos de la propia organización con sus integrantes, para ver en pantalla,
// imprimir o exportar a Excel. Reglas del ERS:
// - Solo la información de la propia organización (RF-SEG-011).
// - Fecha y hora de generación en el reporte.
// - Advertir que el listado NO es la nómina oficial de una competencia (esa es RF-COM-003).
// - Sin datos personales no delegados: no se incluyen teléfonos, correos, contactos de emergencia
//   ni fechas de nacimiento (hay menores en las categorías juveniles).
// - Toda exportación o impresión queda en la bitácora con el usuario, la fecha y el reporte.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const { asociacionConsultada, denegarAsociacion } = require('../utils/asociacionConsultada');
const { libroXlsx } = require('../utils/xlsx');

const router = express.Router();

const TABLA = 'reportes_asociacion';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = {
  EQUIPOS: 'Equipos e integrantes',
  EQUIPO: 'Integrantes de un equipo'
};
const INTEGRANTES = { TODOS: 'Jugadores y cuerpo técnico', JUGADOR: 'Solo jugadores', TECNICO: 'Solo cuerpo técnico' };
const AVISO = 'Listado de consulta generado por la asociación. No constituye la nómina oficial de una competencia.';
const MAX_INTEGRANTES = 3000;

const TIPO_INTEGRANTE = { JUGADOR: 'Jugador', TECNICO: 'Cuerpo técnico' };

// Fecha y hora de Costa Rica (UTC-6) para mostrar en el reporte.
function fechaHoraCR(iso) {
  const d = new Date(new Date(iso).getTime() - 6 * 3600 * 1000);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

function leerParametros(fuente) {
  const tipo = typeof fuente.tipo === 'string' ? fuente.tipo.toUpperCase() : 'EQUIPOS';
  const integrantes = typeof fuente.integrantes === 'string' ? fuente.integrantes.toUpperCase() : 'TODOS';
  const equipo = fuente.team_id || null;
  if (!TIPOS[tipo]) throw new HttpError(400, 'Tipo de reporte no válido.');
  if (!INTEGRANTES[integrantes]) throw new HttpError(400, 'Filtro de integrantes no válido.');
  if (tipo === 'EQUIPO' && !UUID.test(equipo || '')) throw new HttpError(400, 'Seleccione el equipo.');
  if (equipo && !UUID.test(equipo)) throw new HttpError(400, 'El equipo no es válido.');
  return { tipo, integrantes, equipo: tipo === 'EQUIPO' ? equipo : null };
}

/** Arma el reporte con el alcance de la asociación. */
async function armarReporte(req, parametros) {
  const asociacionId = await asociacionConsultada(req, TABLA);
  const { tipo, integrantes, equipo } = parametros;

  const [asociacion, equipos] = await Promise.all([
    supabase.from('associations').select('id, name, short_name').eq('id', asociacionId).maybeSingle(),
    supabase
      .from('teams')
      .select(`id, name, short_name, status, association_id,
        categoria:catalog_values!teams_category_value_id_fkey(value),
        rama:catalog_values!teams_branch_value_id_fkey(value),
        modalidad:catalog_values!teams_modality_value_id_fkey(value)`)
      .eq('association_id', asociacionId)
      .order('name')
  ]);
  for (const r of [asociacion, equipos]) {
    const err = fromSupabase(r.error);
    if (err) throw err;
  }
  if (!asociacion.data) throw new HttpError(404, 'Asociación no encontrada.');

  let lista = equipos.data || [];
  if (equipo) {
    lista = lista.filter((e) => e.id === equipo);
    if (!lista.length) {
      await denegarAsociacion(req, `Intento de generar un reporte de un equipo que no es de su asociación (${equipo})`, TABLA);
      throw new HttpError(403, 'Acceso denegado: el equipo no pertenece a su asociación.');
    }
  } else {
    // El listado general muestra los equipos activos; uno inactivo se consulta con su propio reporte.
    lista = lista.filter((e) => e.status === 'ACTIVO');
  }

  const ids = lista.map((e) => e.id);
  let miembros = [];
  if (ids.length) {
    let query = supabase
      .from('team_members')
      .select(`team_id, member_type, technical_role, jersey_number, start_date,
        posicion:catalog_values!team_members_position_value_id_fkey(value),
        persona:persons!team_members_person_id_fkey(first_name, last_name, document_number, is_verified, status)`)
      .in('team_id', ids)
      .eq('status', 'ACTIVO')
      .limit(MAX_INTEGRANTES);
    if (integrantes !== 'TODOS') query = query.eq('member_type', integrantes);
    const { data, error } = await query;
    const err = fromSupabase(error);
    if (err) throw err;
    miembros = data || [];
  }

  const generado = new Date().toISOString();
  const equiposReporte = lista.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    category: e.categoria?.value || null,
    branch: e.rama?.value || null,
    modality: e.modalidad?.value || null,
    members: miembros
      .filter((m) => m.team_id === e.id && m.persona && m.persona.status !== 'INACTIVA')
      .map((m) => ({
        name: [m.persona.first_name, m.persona.last_name].filter(Boolean).join(' '),
        document_number: m.persona.document_number,
        type: m.member_type,
        number: m.member_type === 'JUGADOR' ? m.jersey_number ?? null : null,
        position_or_role: m.member_type === 'JUGADOR' ? m.posicion?.value || null : m.technical_role || null,
        verified: Boolean(m.persona.is_verified),
        since: m.start_date || null
      }))
      .sort((a, b) => (a.type === b.type
        ? (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'es')
        : a.type === 'JUGADOR' ? -1 : 1))
  }));

  return {
    report: {
      type: tipo,
      title: TIPOS[tipo],
      members_filter: INTEGRANTES[integrantes],
      generated_at: generado,
      generated_at_text: fechaHoraCR(generado),
      association: { id: asociacion.data.id, name: asociacion.data.name },
      notice: AVISO
    },
    teams: equiposReporte,
    total_members: equiposReporte.reduce((n, e) => n + e.members.length, 0)
  };
}

async function registrarEnBitacora(req, reporte, formato) {
  await supabase.from('audit_logs').insert([{
    usuario: req.currentUser,
    accion: 'EXPORTACION',
    tabla: TABLA,
    registro_id: reporte.report.association.id,
    registro_nuevo: {
      evento: formato === 'XLSX' ? 'Exportación de reporte a Excel' : 'Impresión de reporte',
      reporte: reporte.report.title,
      integrantes: reporte.report.members_filter,
      equipos: reporte.teams.map((e) => e.name),
      filas: reporte.total_members,
      generado_en: reporte.report.generated_at
    }
  }]);
}

/* GET /api/reportes-asociacion?tipo=EQUIPOS|EQUIPO&team_id=&integrantes=TODOS|JUGADOR|TECNICO */
router.get('/', asyncHandler(async (req, res) => {
  const reporte = await armarReporte(req, leerParametros(req.query));
  res.set('Cache-Control', 'no-store');
  res.json({ data: reporte });
}));

/* POST /api/reportes-asociacion/exportacion { tipo, team_id, integrantes, formato: XLSX | IMPRESION }
   XLSX devuelve el archivo; IMPRESION solo deja constancia (el navegador imprime la vista). */
router.post('/exportacion', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const formato = typeof b.formato === 'string' ? b.formato.toUpperCase() : '';
  if (!['XLSX', 'IMPRESION'].includes(formato)) throw new HttpError(400, 'Formato de exportación no válido.');
  const reporte = await armarReporte(req, leerParametros(b));
  if (!reporte.total_members && formato === 'XLSX') {
    throw new HttpError(404, 'No hay integrantes que cumplan los parámetros; no se generó el archivo.');
  }

  await registrarEnBitacora(req, reporte, formato);
  if (formato === 'IMPRESION') return res.status(201).json({ data: { registrado: true } });

  const r = reporte.report;
  const filas = [
    [`${r.association.name} · ${r.title}`],
    [`Generado: ${r.generated_at_text} (hora de Costa Rica) · ${r.members_filter}`],
    [r.notice],
    [],
    ['Equipo', 'Categoría', 'Rama', 'Integrante', 'Identificación', 'Tipo', 'Número', 'Posición o cargo', 'Identidad verificada']
  ];
  for (const e of reporte.teams) {
    for (const m of e.members) {
      filas.push([e.name, e.category, e.branch, m.name, m.document_number, TIPO_INTEGRANTE[m.type] || m.type, m.number, m.position_or_role, m.verified ? 'Sí' : 'No']);
    }
  }
  const archivo = libroXlsx({ hoja: r.title, filas, negritas: [0, 4], anchos: [26, 12, 12, 30, 16, 16, 9, 22, 12] });
  const nombre = `reporte-${r.type.toLowerCase()}-${r.generated_at.slice(0, 10)}.xlsx`;

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${nombre}"`,
    // El frontend corre en otro origen: sin esto no puede leer el nombre del archivo.
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(archivo);
}));

module.exports = router;
