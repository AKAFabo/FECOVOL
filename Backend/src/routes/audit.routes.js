const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const authorize = require('../middleware/authorize');

const router = express.Router();

/**
 * Normaliza y escapa un campo para formato CSV (RFC 4180).
 */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

// 1. GET /api/audit -> Consulta paginada y filtrada de la bitácora (RF-AUD-004)
router.get('/', authorize({ requiredPermission: '/admin/auditoria', requireAdmin: true, resourceTable: 'audit_logs' }), asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const { usuario, tabla, accion, registroId, fechaDesde, fechaHasta, busqueda } = req.query;

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' });

  // Filtro por usuario
  if (usuario && usuario !== 'todos') {
    query = query.eq('usuario', usuario);
  }

  // Filtro por tabla / entidad afectada
  if (tabla && tabla !== 'todos') {
    query = query.eq('tabla', tabla);
  }

  // Filtro por acción realizada
  if (accion && accion !== 'todas') {
    query = query.eq('accion', accion);
  }

  // Filtro por registro específico afectado
  if (registroId) {
    query = query.eq('registro_id', String(registroId).trim());
  }

  // Filtro por rango de fechas (fechaDesde)
  if (fechaDesde) {
    query = query.gte('fecha_hora', `${fechaDesde}T00:00:00.000Z`);
  }

  // Filtro por rango de fechas (fechaHasta)
  if (fechaHasta) {
    query = query.lte('fecha_hora', `${fechaHasta}T23:59:59.999Z`);
  }

  // Búsqueda de texto libre
  if (busqueda && busqueda.trim()) {
    const term = busqueda.trim();
    query = query.or(`usuario.ilike.%${term}%,tabla.ilike.%${term}%,registro_id.ilike.%${term}%`);
  }

  query = query.order('fecha_hora', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    throw new HttpError(500, `Error al consultar la bitácora: ${error.message}`);
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    data: data || [],
    total,
    page,
    limit,
    totalPages
  });
}));

// 2. GET /api/audit/earliest-date -> Obtener la fecha más antigua registrada en la bitácora (RF-AUD-004 Excepción 3)
router.get('/earliest-date', authorize({ requiredPermission: '/admin/auditoria', requireAdmin: true, resourceTable: 'audit_logs' }), asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('fecha_hora')
    .order('fecha_hora', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, `Error al consultar fecha límite: ${error.message}`);
  }

  res.json({
    earliestDate: data?.fecha_hora || new Date().toISOString()
  });
}));

// 3. GET /api/audit/export -> Exportación a CSV de registros filtrados (RF-AUD-004 Flujo Alternativo 3)
router.get('/export', authorize({ requiredPermission: '/admin/auditoria', requireAdmin: true, resourceTable: 'audit_logs' }), asyncHandler(async (req, res) => {
  const { usuario, tabla, accion, registroId, fechaDesde, fechaHasta, busqueda } = req.query;

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('fecha_hora', { ascending: false })
    .limit(2000); // Límite máximo seguro para descarga administrativa

  if (usuario && usuario !== 'todos') query = query.eq('usuario', usuario);
  if (tabla && tabla !== 'todos') query = query.eq('tabla', tabla);
  if (accion && accion !== 'todas') query = query.eq('accion', accion);
  if (registroId) query = query.eq('registro_id', String(registroId).trim());
  if (fechaDesde) query = query.gte('fecha_hora', `${fechaDesde}T00:00:00.000Z`);
  if (fechaHasta) query = query.lte('fecha_hora', `${fechaHasta}T23:59:59.999Z`);
  if (busqueda && busqueda.trim()) {
    const term = busqueda.trim();
    query = query.or(`usuario.ilike.%${term}%,tabla.ilike.%${term}%,registro_id.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, `Error al exportar bitácora: ${error.message}`);
  }

  const rows = data || [];
  const headers = [
    'Fecha y Hora',
    'Usuario',
    'Acción',
    'Módulo / Tabla',
    'ID de Registro',
    'Detalle / Evento',
    'Datos Anteriores (JSON)',
    'Datos Nuevos (JSON)'
  ];

  const csvRows = [headers.map(escapeCsvField).join(',')];

  rows.forEach((row) => {
    let detalle = '—';
    if (row.registro_nuevo?.evento) {
      detalle = row.registro_nuevo.evento;
    } else if (row.registro_nuevo?.motivo) {
      detalle = row.registro_nuevo.motivo;
    } else if (row.accion === 'INSERT') {
      detalle = `Creación de registro en ${row.tabla}`;
    } else if (row.accion === 'UPDATE') {
      detalle = `Modificación de registro en ${row.tabla}`;
    } else if (row.accion === 'DELETE') {
      detalle = `Eliminación de registro en ${row.tabla}`;
    }

    const rowData = [
      new Date(row.fecha_hora).toLocaleString('es-CR'),
      row.usuario || 'Sistema',
      row.accion,
      row.tabla,
      row.registro_id || '—',
      detalle,
      row.registro_viejo ? JSON.stringify(row.registro_viejo) : '',
      row.registro_nuevo ? JSON.stringify(row.registro_nuevo) : ''
    ];
    csvRows.push(rowData.map(escapeCsvField).join(','));
  });

  // Prefijo UTF-8 BOM para compatibilidad directa con Microsoft Excel en español
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const filename = `bitacora_auditoria_fecovol_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
}));

module.exports = router;
