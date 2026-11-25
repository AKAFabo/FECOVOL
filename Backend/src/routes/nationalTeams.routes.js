// Selecciones nacionales: selecciones, eventos y convocatorias (administración de FECOVOL).
//
// Consultan la Administración y el Personal de FECOVOL; crean y modifican solo los Administradores.
// El portal público lee lo publicado por /api/public/national-teams.
const express = require('express');
const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError, fromSupabase } = require('../utils/httpError');
const validateUuidParams = require('../middleware/validateUuidParams');
const { UUID, esFecha, texto, tieneRol, denegar, hoyCR } = require('../utils/arbitraje');
const { motivoNoElegible, descripcionRequisitos } = require('../utils/elegibilidadSeleccion');

const router = express.Router();
for (const p of ['id', 'miembroId']) router.param(p, validateUuidParams);

const MODALIDADES = ['SALA', 'PLAYA'];

function soloFecovol(req, res, next) {
  const scope = req.userScope || { isPublic: true };
  if (scope.isPublic) return next(new HttpError(401, 'Se requiere iniciar sesión.'));
  if (scope.isAdmin) return next();
  denegar(req, 'Intento de consultar las selecciones nacionales sin rol de FECOVOL', 'national_teams')
    .finally(() => next(new HttpError(403, 'Esta sección es solo para FECOVOL.')));
}

function soloAdministrador(req, res, next) {
  if (tieneRol(req.userScope, 'administrador')) return next();
  denegar(req, 'Intento de modificar las selecciones nacionales sin el rol Administrador', 'national_teams')
    .finally(() => next(new HttpError(403, 'Solo la Administración de FECOVOL modifica las selecciones.')));
}

router.use(soloFecovol);

const lanzar = (error, contexto) => {
  const err = fromSupabase(error, contexto);
  if (err) throw err;
};

/** Id de un valor de catálogo a partir de su código (por ejemplo, Ramas: FEM). */
async function valorCatalogo(catalogo, codigo, etiqueta) {
  if (typeof codigo !== 'string' || !/^[A-Z0-9_]{1,20}$/.test(codigo)) throw new HttpError(400, `Indique ${etiqueta}.`);
  const { data } = await supabase
    .from('catalog_values')
    .select('id, catalogs!inner(name)')
    .eq('code', codigo)
    .eq('is_active', true)
    .eq('catalogs.name', catalogo)
    .maybeSingle();
  if (!data) throw new HttpError(400, `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} no es válida.`);
  return data.id;
}

const SELECT_SELECCION = `id, name, modality, status, created_at,
  rama:catalog_values!national_teams_branch_fkey(code, value),
  categoria:catalog_values!national_teams_category_fkey(code, value)`;
const SELECT_CONVOCATORIA = `id, title, notes, status, published_at, created_at, updated_at, national_team_id, event_id,
  seleccion:national_teams!national_team_callups_team_fkey(id, name, modality,
    rama:catalog_values!national_teams_branch_fkey(code, value),
    categoria:catalog_values!national_teams_category_fkey(code, value)),
  evento:national_team_events!national_team_callups_event_fkey(id, name, start_date, end_date, venue)`;

/* ------------------------------------------------------------------------------------------------
   GET /api/national-teams -> selecciones, eventos y convocatorias (resumen)
   ---------------------------------------------------------------------------------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const [selecciones, eventos, convocatorias, integrantes] = await Promise.all([
    supabase.from('national_teams').select(SELECT_SELECCION).order('name'),
    supabase.from('national_team_events').select('id, name, modality, start_date, end_date, venue, status').order('start_date', { ascending: false }).limit(200),
    supabase.from('national_team_callups').select(SELECT_CONVOCATORIA).order('created_at', { ascending: false }).limit(200),
    supabase.from('national_team_callup_members').select('callup_id, member_type').limit(5000)
  ]);
  for (const r of [selecciones, eventos, convocatorias, integrantes]) lanzar(r.error);
  const conteo = new Map();
  for (const m of integrantes.data || []) {
    const c = conteo.get(m.callup_id) || { jugadores: 0, cuerpo_tecnico: 0 };
    if (m.member_type === 'JUGADOR') c.jugadores += 1; else c.cuerpo_tecnico += 1;
    conteo.set(m.callup_id, c);
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      selecciones: selecciones.data || [],
      eventos: eventos.data || [],
      convocatorias: (convocatorias.data || []).map((c) => ({ ...c, integrantes: conteo.get(c.id) || { jugadores: 0, cuerpo_tecnico: 0 } }))
    }
  });
}));

/* ------------------------------------------------------------------------------------------------
   Selecciones
   ---------------------------------------------------------------------------------------------- */
async function leerSeleccion(b, parcial) {
  const datos = {};
  if (!parcial || b.name !== undefined) {
    const nombre = texto(b.name, 120);
    if (nombre.length < 3) throw new HttpError(400, 'Indique el nombre de la selección.');
    datos.name = nombre;
  }
  if (!parcial || b.modality !== undefined) {
    if (!MODALIDADES.includes(b.modality)) throw new HttpError(400, 'La modalidad debe ser sala o playa.');
    datos.modality = b.modality;
  }
  if (!parcial || b.branch_code !== undefined) datos.branch_value_id = await valorCatalogo('Ramas', b.branch_code, 'la rama');
  if (!parcial || b.category_code !== undefined) datos.category_value_id = await valorCatalogo('Categorías', b.category_code, 'la categoría');
  if (b.status !== undefined) {
    if (!['ACTIVA', 'INACTIVA'].includes(b.status)) throw new HttpError(400, 'Estado no válido.');
    datos.status = b.status;
  }
  return datos;
}

router.post('/', soloAdministrador, asyncHandler(async (req, res) => {
  const datos = await leerSeleccion(req.body || {}, false);
  const { data, error } = await supabase.from('national_teams').insert(datos).select(SELECT_SELECCION).single();
  if (error?.code === '23505') throw new HttpError(409, 'Ya existe una selección con esa modalidad, rama y categoría.');
  lanzar(error);
  res.status(201).json({ data });
}));

router.patch('/:id', soloAdministrador, asyncHandler(async (req, res) => {
  const datos = await leerSeleccion(req.body || {}, true);
  if (!Object.keys(datos).length) throw new HttpError(400, 'No hay cambios.');
  const { data, error } = await supabase.from('national_teams').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', req.params.id).select(SELECT_SELECCION).maybeSingle();
  if (error?.code === '23505') throw new HttpError(409, 'Ya existe una selección con esa modalidad, rama y categoría.');
  lanzar(error);
  if (!data) throw new HttpError(404, 'Selección no encontrada.');
  res.json({ data });
}));

/* ------------------------------------------------------------------------------------------------
   Eventos
   ---------------------------------------------------------------------------------------------- */
function leerEvento(b, parcial) {
  const datos = {};
  if (!parcial || b.name !== undefined) {
    const nombre = texto(b.name, 160);
    if (nombre.length < 3) throw new HttpError(400, 'Indique el nombre del evento.');
    datos.name = nombre;
  }
  if (!parcial || b.modality !== undefined) {
    if (!MODALIDADES.includes(b.modality)) throw new HttpError(400, 'La modalidad debe ser sala o playa.');
    datos.modality = b.modality;
  }
  for (const campo of ['start_date', 'end_date']) {
    if (!parcial || b[campo] !== undefined) {
      if (!esFecha(b[campo])) throw new HttpError(400, 'Las fechas del evento no son válidas.');
      datos[campo] = b[campo];
    }
  }
  if (datos.start_date && datos.end_date && datos.end_date < datos.start_date) throw new HttpError(400, 'El evento no puede terminar antes de empezar.');
  if (b.venue !== undefined) datos.venue = texto(b.venue, 160) || null;
  if (b.status !== undefined) {
    if (!['PROGRAMADO', 'FINALIZADO', 'CANCELADO'].includes(b.status)) throw new HttpError(400, 'Estado no válido.');
    datos.status = b.status;
  }
  return datos;
}

router.post('/eventos', soloAdministrador, asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('national_team_events').insert(leerEvento(req.body || {}, false)).select().single();
  lanzar(error);
  res.status(201).json({ data });
}));

router.patch('/eventos/:id', soloAdministrador, asyncHandler(async (req, res) => {
  const datos = leerEvento(req.body || {}, true);
  if (!Object.keys(datos).length) throw new HttpError(400, 'No hay cambios.');
  const { data, error } = await supabase.from('national_team_events').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(404, 'Evento no encontrado.');
  res.json({ data });
}));

/* ------------------------------------------------------------------------------------------------
   Convocatorias
   ---------------------------------------------------------------------------------------------- */
async function convocatoria(id) {
  const { data, error } = await supabase.from('national_team_callups').select(SELECT_CONVOCATORIA).eq('id', id).maybeSingle();
  lanzar(error);
  if (!data) throw new HttpError(404, 'Convocatoria no encontrada.');
  return data;
}

// Rama, categoría y fecha con que se comprueba quién puede ser convocado (inicio del evento o hoy).
function criterioDe(c, inicioEvento) {
  const inicio = inicioEvento !== undefined ? inicioEvento : c.evento?.start_date;
  return {
    rama: c.seleccion?.rama || null,
    categoria: c.seleccion?.categoria || null,
    fechaReferencia: inicio && esFecha(String(inicio).slice(0, 10)) ? String(inicio).slice(0, 10) : hoyCR()
  };
}

const nombreDe = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Una persona';

// Atletas de la convocatoria que ya no cumplen la categoría o la rama (por ejemplo, al cambiar el
// evento o corregir una fecha de nacimiento en el padrón).
async function atletasFueraDeCategoria(c, criterio) {
  const { data, error } = await supabase
    .from('national_team_callup_members')
    .select('id, persona:persons!callup_members_person_fkey(first_name, last_name, birth_date, sex)')
    .eq('callup_id', c.id)
    .eq('member_type', 'JUGADOR');
  lanzar(error);
  return (data || [])
    .map((m) => ({ nombre: nombreDe(m.persona), motivo: motivoNoElegible(m.persona, criterio) }))
    .filter((m) => m.motivo);
}

function lanzarSiFuera(fuera) {
  if (!fuera.length) return;
  const nombres = fuera.slice(0, 5).map((m) => m.nombre).join(', ') + (fuera.length > 5 ? ` y ${fuera.length - 5} más` : '');
  throw new HttpError(409, `No cumplen la categoría o la rama de la selección: ${nombres}. ${fuera[0].motivo} Quítelos o corrija su ficha antes de continuar.`);
}

router.get('/convocatorias/:id', asyncHandler(async (req, res) => {
  const c = await convocatoria(req.params.id);
  const { data, error } = await supabase
    .from('national_team_callup_members')
    .select(`id, member_type, jersey_number, staff_role, created_at,
      posicion:catalog_values!callup_members_position_fkey(code, value),
      persona:persons!callup_members_person_fkey(id, first_name, last_name, document_number, status, birth_date, sex,
        asociacion:associations(short_name, name))`)
    .eq('callup_id', c.id);
  lanzar(error);
  const criterio = criterioDe(c);
  const integrantes = (data || []).map((m) => ({
    ...m,
    motivo_no_elegible: m.member_type === 'JUGADOR' ? motivoNoElegible(m.persona, criterio) : null
  }));
  res.set('Cache-Control', 'no-store');
  res.json({ data: { ...c, integrantes, requisitos: { fecha_referencia: criterio.fechaReferencia, detalle: descripcionRequisitos(criterio) } } });
}));

router.post('/convocatorias', soloAdministrador, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!UUID.test(b.national_team_id || '')) throw new HttpError(400, 'Elija la selección.');
  if (b.event_id && !UUID.test(b.event_id)) throw new HttpError(400, 'El evento no es válido.');
  const titulo = texto(b.title, 160);
  if (titulo.length < 3) throw new HttpError(400, 'Indique el título de la convocatoria.');
  const { data: sel } = await supabase.from('national_teams').select('id, status').eq('id', b.national_team_id).maybeSingle();
  if (!sel) throw new HttpError(404, 'La selección no existe.');
  if (sel.status !== 'ACTIVA') throw new HttpError(409, 'La selección está inactiva.');
  const { data, error } = await supabase
    .from('national_team_callups')
    .insert({ national_team_id: sel.id, event_id: b.event_id || null, title: titulo, notes: texto(b.notes, 2000) || null })
    .select(SELECT_CONVOCATORIA)
    .single();
  lanzar(error);
  res.status(201).json({ data });
}));

// PATCH /convocatorias/:id { title?, notes?, event_id?, status? } -> editar, publicar o archivar
router.patch('/convocatorias/:id', soloAdministrador, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = await convocatoria(req.params.id);
  const cambios = { updated_at: new Date().toISOString() };
  if (b.title !== undefined) {
    const titulo = texto(b.title, 160);
    if (titulo.length < 3) throw new HttpError(400, 'Indique el título de la convocatoria.');
    cambios.title = titulo;
  }
  if (b.notes !== undefined) cambios.notes = texto(b.notes, 2000) || null;
  let inicioEvento;
  if (b.event_id !== undefined) {
    if (b.event_id && !UUID.test(b.event_id)) throw new HttpError(400, 'El evento no es válido.');
    cambios.event_id = b.event_id || null;
    inicioEvento = null;
    if (b.event_id) {
      const { data: evento, error: errEvento } = await supabase.from('national_team_events').select('id, start_date').eq('id', b.event_id).maybeSingle();
      lanzar(errEvento);
      if (!evento) throw new HttpError(404, 'El evento no existe.');
      inicioEvento = evento.start_date;
    }
  }
  if (b.status !== undefined) {
    if (!['BORRADOR', 'PUBLICADA', 'ARCHIVADA'].includes(b.status)) throw new HttpError(400, 'Estado no válido.');
    if (b.status === 'PUBLICADA') {
      const { count } = await supabase.from('national_team_callup_members').select('id', { count: 'exact', head: true }).eq('callup_id', c.id).eq('member_type', 'JUGADOR');
      if (!count) throw new HttpError(409, 'Agregue al menos un atleta antes de publicar la convocatoria.');
      cambios.published_at = c.published_at || new Date().toISOString();
    }
    cambios.status = b.status;
  }
  // Lo publicado tiene que cumplir la categoría y la rama: al publicar y al cambiar el evento (y con
  // él la fecha de referencia) de una convocatoria publicada.
  const quedaPublicada = (cambios.status || c.status) === 'PUBLICADA';
  if (quedaPublicada && (cambios.status === 'PUBLICADA' || b.event_id !== undefined)) {
    lanzarSiFuera(await atletasFueraDeCategoria(c, criterioDe(c, inicioEvento)));
  }
  const { data, error } = await supabase.from('national_team_callups').update(cambios).eq('id', c.id).select(SELECT_CONVOCATORIA).single();
  lanzar(error);
  res.json({ data });
}));

// POST /convocatorias/:id/integrantes { person_id, member_type, jersey_number?, position_code?, staff_role? }
router.post('/convocatorias/:id/integrantes', soloAdministrador, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = await convocatoria(req.params.id);
  if (c.status === 'ARCHIVADA') throw new HttpError(409, 'La convocatoria está archivada.');
  if (!UUID.test(b.person_id || '')) throw new HttpError(400, 'Elija la persona.');
  if (!['JUGADOR', 'CUERPO_TECNICO'].includes(b.member_type)) throw new HttpError(400, 'Indique si es atleta o del cuerpo técnico.');

  const { data: persona } = await supabase.from('persons').select('id, status, first_name, last_name, birth_date, sex').eq('id', b.person_id).maybeSingle();
  if (!persona) throw new HttpError(404, 'La persona no existe en el padrón.');
  if (persona.status !== 'ACTIVA') throw new HttpError(409, 'La persona no está activa en el padrón.');
  if (b.member_type === 'JUGADOR') {
    const motivo = motivoNoElegible(persona, criterioDe(c));
    if (motivo) throw new HttpError(409, motivo);
  }

  const fila = { callup_id: c.id, person_id: persona.id, member_type: b.member_type, jersey_number: null, position_value_id: null, staff_role: null };
  if (b.member_type === 'JUGADOR') {
    if (b.jersey_number !== undefined && b.jersey_number !== null && b.jersey_number !== '') {
      const n = Number(b.jersey_number);
      if (!Number.isInteger(n) || n < 1 || n > 99) throw new HttpError(400, 'El número debe estar entre 1 y 99.');
      fila.jersey_number = n;
    }
    if (b.position_code) fila.position_value_id = await valorCatalogo('Posiciones', b.position_code, 'la posición');
  } else {
    const cargo = texto(b.staff_role, 80);
    if (cargo.length < 3) throw new HttpError(400, 'Indique el cargo en el cuerpo técnico.');
    fila.staff_role = cargo;
  }

  const { data, error } = await supabase.from('national_team_callup_members').insert(fila).select('id').single();
  if (error?.code === '23505') {
    throw new HttpError(409, /numero|jersey/i.test(error.message || '') ? 'Ese número ya lo tiene otra persona convocada.' : 'La persona ya está en esta convocatoria.');
  }
  lanzar(error);
  res.status(201).json({ data });
}));

router.delete('/convocatorias/:id/integrantes/:miembroId', soloAdministrador, asyncHandler(async (req, res) => {
  const c = await convocatoria(req.params.id);
  if (c.status === 'ARCHIVADA') throw new HttpError(409, 'La convocatoria está archivada.');
  const { data, error } = await supabase.from('national_team_callup_members').delete().eq('id', req.params.miembroId).eq('callup_id', c.id).select('id');
  lanzar(error);
  if (!data?.length) throw new HttpError(404, 'La persona no está en esta convocatoria.');
  res.json({ data: { id: req.params.miembroId, eliminado: true } });
}));

module.exports = router;
