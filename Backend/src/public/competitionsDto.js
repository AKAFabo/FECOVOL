// Formato de salida de la API pública de competencias.
//
// Todo lo que sale hacia el portal público pasa por estas funciones. Cada una arma el objeto
// campo por campo (lista blanca): si mañana se agrega una columna a la base de datos, no se
// publica sola. Son funciones puras, sin acceso a la base de datos, para poder probarlas aparte.
//
// Datos de personas: de los integrantes de un equipo solo se publican nombre, número y posición
// (decisión del equipo, oct 2026). Nunca cédula, fecha o año de nacimiento, contactos ni el
// estado de habilitación: hay categorías juveniles con menores de edad.

// Estados de una competencia que el público puede ver. PLANIFICACION queda fuera porque es un
// borrador interno de la Federación.
const ESTADOS_PUBLICOS = Object.freeze(['INSCRIPCIONES', 'EN_CURSO', 'FINALIZADA', 'CERRADA']);

// Estado de inscripción de un equipo que se muestra (los retirados y descalificados no).
const EQUIPO_INSCRITO = 'INSCRITO';

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

function texto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function entero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function catalogo(valor) {
  return valor && typeof valor === 'object' ? texto(valor.value) : null;
}

// Solo "#rrggbb". El color se usa en estilos del portal; cualquier otro valor se descarta.
function color(valor) {
  return typeof valor === 'string' && COLOR_HEX.test(valor.trim()) ? valor.trim().toLowerCase() : null;
}

// Cociente redondeado a dos decimales; null cuando no hay divisor (por ejemplo, ningún set perdido).
function cociente(a, b) {
  return b > 0 ? Math.round((a / b) * 100) / 100 : null;
}

function nombrePersona(persona) {
  if (!persona || typeof persona !== 'object') return null;
  const nombre = [texto(persona.first_name), texto(persona.last_name)].filter(Boolean).join(' ');
  return nombre || null;
}

/* ----------------------------------------------------------------------------------------------
   Competencias
   ---------------------------------------------------------------------------------------------- */

// resumen: lo que arma resumirAvance(); se agrega tal cual porque ya viene en formato público.
function aCompetencia(fila, resumen = null) {
  const base = {
    id: fila.id,
    name: texto(fila.name),
    season: texto(fila.season),
    status: fila.status,
    start_date: fila.start_date || null,
    end_date: fila.end_date || null,
    category: catalogo(fila.categoria),
    branch: catalogo(fila.rama),
    modality: catalogo(fila.modalidad)
  };
  return resumen ? { ...base, ...resumen } : base;
}

// Avance de una competencia a partir de sus partidos (basta con matchday y status), la cantidad de
// equipos inscritos y la tabla ya armada con armarPosiciones().
// - Los partidos cancelados no cuentan.
// - La jornada actual es la última que tiene algún partido finalizado.
// - El primer lugar solo se informa cuando ya se jugó algún partido.
function resumirAvance({ partidos = [], equipos = 0, posiciones = [] } = {}) {
  const validos = partidos.filter((p) => p?.status && p.status !== 'CANCELADO');
  const jugados = validos.filter((p) => p.status === 'FINALIZADO');
  const ultima = (lista) => lista.reduce((max, p) => Math.max(max, entero(p.matchday)), 0);
  const primero = posiciones.find((f) => f.position === 1 && f.played > 0);

  return {
    team_count: entero(equipos),
    matchdays_total: ultima(validos),
    matchday_current: ultima(jugados),
    matches_total: validos.length,
    matches_played: jugados.length,
    leader: primero ? primero.team : null
  };
}

/* ----------------------------------------------------------------------------------------------
   Equipos
   ---------------------------------------------------------------------------------------------- */

function aEquipo(equipo) {
  if (!equipo || typeof equipo !== 'object') return null;
  return { id: equipo.id, name: texto(equipo.name), short_name: texto(equipo.short_name), color: color(equipo.primary_color) };
}

// Asociación de un equipo. El enlace (id) solo se publica si la asociación está afiliada, que es
// la única que tiene página propia en el portal; de las demás se muestra solo el nombre.
function aAsociacionDeEquipo(asociacion) {
  if (!asociacion || typeof asociacion !== 'object') return null;
  return {
    id: asociacion.status === 'AFILIADA' ? asociacion.id : null,
    name: texto(asociacion.name)
  };
}

// fila: equipo con su asociación embebida (`asociacion`) y, si se pidieron, sus valores de
// catálogo. jugadores: cuántos jugadores tiene en la nómina de esta competencia.
function aEquipoInscrito(fila, jugadores = 0) {
  const asociacion = fila.asociacion && typeof fila.asociacion === 'object' ? fila.asociacion : null;
  return {
    ...aEquipo(fila),
    association: aAsociacionDeEquipo(asociacion),
    province: texto(asociacion?.province),
    home_venue: texto(fila.home_venue) || texto(asociacion?.home_venue),
    players: entero(jugadores)
  };
}

function aEquipoDetalle(fila) {
  return {
    ...aEquipoInscrito(fila),
    category: catalogo(fila.categoria),
    branch: catalogo(fila.rama),
    modality: catalogo(fila.modalidad)
  };
}

// Integrantes de un equipo para la página pública.
//
// filasNomina: competition_rosters de la competencia (activas), con la persona embebida.
// filasMiembros: team_members activos del equipo, con la persona y la posición embebidas. Se usan
// para la posición de cada jugador y, si la competencia todavía no tiene nómina cargada, como
// lista de integrantes del equipo (source = 'equipo').
//
// person_id se usa solo para unir las dos listas; no sale en la respuesta.
const CUERPO_TECNICO = 'Cuerpo técnico';

const personaActiva = (f) => f?.persona?.status === 'ACTIVA' && Boolean(nombrePersona(f.persona));
const numeroCamiseta = (n) => (Number.isInteger(n) && n > 0 ? n : null);
const porNumero = (a, b) => (a.number ?? 1000) - (b.number ?? 1000) || a.name.localeCompare(b.name, 'es');
const porNombre = (a, b) => a.name.localeCompare(b.name, 'es');

// Nómina de la competencia: jugadores y cuerpo técnico (técnicos y delegados).
function desdeNominaCompetencia(nomina, miembros) {
  const posicionDe = new Map(miembros.map((m) => [m.person_id, catalogo(m.posicion)]));
  const funcionDe = new Map(miembros.map((m) => [m.person_id, texto(m.technical_role)]));
  const funcion = (f) => (f.roster_role === 'DELEGADO' ? 'Delegado(a)' : funcionDe.get(f.person_id) || CUERPO_TECNICO);

  return {
    jugadores: nomina
      .filter((f) => f.roster_role === 'JUGADOR')
      .map((f) => ({ number: numeroCamiseta(f.jersey_number), name: nombrePersona(f.persona), position: posicionDe.get(f.person_id) || null })),
    cuerpoTecnico: nomina
      .filter((f) => f.roster_role === 'TECNICO' || f.roster_role === 'DELEGADO')
      .map((f) => ({ name: nombrePersona(f.persona), role: funcion(f) }))
  };
}

// Sin nómina de la competencia: integrantes activos del equipo.
function desdeMiembrosEquipo(miembros) {
  return {
    jugadores: miembros
      .filter((m) => m.member_type === 'JUGADOR')
      .map((m) => ({ number: numeroCamiseta(m.jersey_number), name: nombrePersona(m.persona), position: catalogo(m.posicion) })),
    cuerpoTecnico: miembros
      .filter((m) => m.member_type === 'TECNICO')
      .map((m) => ({ name: nombrePersona(m.persona), role: texto(m.technical_role) || CUERPO_TECNICO }))
  };
}

function armarNomina(filasNomina = [], filasMiembros = []) {
  const miembros = filasMiembros.filter(personaActiva);
  const nomina = filasNomina.filter(personaActiva);
  const desdeCompetencia = nomina.length > 0;
  const { jugadores, cuerpoTecnico } = desdeCompetencia
    ? desdeNominaCompetencia(nomina, miembros)
    : desdeMiembrosEquipo(miembros);

  return {
    source: desdeCompetencia ? 'competencia' : 'equipo',
    players: jugadores.toSorted(porNumero),
    staff: cuerpoTecnico.toSorted(porNombre)
  };
}

/* ----------------------------------------------------------------------------------------------
   Partidos
   ---------------------------------------------------------------------------------------------- */

// Resultados especiales que registra el personal de competencias (módulo de resultados). Se
// publican con un texto para el público; el resto de los valores internos no sale del backend.
const RESULTADOS_ESPECIALES = {
  NO_PRESENTADO_LOCAL: 'No presentación del local',
  NO_PRESENTADO_VISITANTE: 'No presentación del visitante',
  GANADO_POR_DEFECTO_LOCAL: 'Ganado por defecto (local)',
  GANADO_POR_DEFECTO_VISITANTE: 'Ganado por defecto (visitante)',
  SUSPENDIDO_DEFINITIVO: 'Suspendido definitivamente'
};

// Sets del marcador, o null si no hay (por ejemplo, un partido suspendido definitivamente).
const setsMarcador = (valor) => (valor === null || valor === undefined ? null : entero(valor));

// sets: filas de match_sets del partido. Solo se publican cuando el partido terminó, para no
// mostrar marcadores parciales que todavía pueden corregirse.
function aPartido(fila, sets = []) {
  const terminado = fila.status === 'FINALIZADO';
  const especial = terminado ? RESULTADOS_ESPECIALES[fila.result_type] || null : null;
  return {
    id: fila.id,
    number: entero(fila.match_number),
    matchday: entero(fila.matchday),
    date: fila.scheduled_date || null,
    time: fila.scheduled_time ? String(fila.scheduled_time).slice(0, 5) : null,
    // La sede sale del catálogo "Sedes" (antes era texto libre en matches.venue).
    venue: texto(fila.sede?.value ?? fila.venue),
    status: fila.status,
    home: aEquipo(fila.local),
    away: aEquipo(fila.visitante),
    home_sets: terminado ? setsMarcador(fila.home_sets_won) : null,
    away_sets: terminado ? setsMarcador(fila.away_sets_won) : null,
    special_result: especial,
    sets: terminado
      ? sets
          .map((s) => ({ number: entero(s.set_number), home: entero(s.home_points), away: entero(s.away_points) }))
          .toSorted((a, b) => a.number - b.number)
      : []
  };
}

/* ----------------------------------------------------------------------------------------------
   Tabla de posiciones
   ---------------------------------------------------------------------------------------------- */

// Une los equipos inscritos con lo que calcula la vista v_standings. La vista solo trae equipos
// que ya jugaron algún partido; aquí los demás aparecen con cero para que la tabla esté completa
// desde la primera jornada.
//
// Orden: puntos, cociente de sets y cociente de puntos, el mismo criterio que usa el módulo de
// competencias (GET /api/reports/team-stats, vista v_standings), y al final el nombre, solo para
// que el orden sea estable.
function armarPosiciones(inscritos, filasVista) {
  const porEquipo = new Map();

  for (const insc of inscritos) {
    const equipo = aEquipo(insc.equipo);
    if (!equipo?.id) continue;
    porEquipo.set(equipo.id, {
      team: equipo,
      played: 0,
      won: 0,
      lost: 0,
      sets_won: 0,
      sets_lost: 0,
      points: 0,
      ratio_sets: 0,
      ratio_puntos: 0
    });
  }

  for (const f of filasVista) {
    const fila = porEquipo.get(f.team_id);
    // Un equipo que ya no está inscrito (retirado o descalificado) no se muestra.
    if (!fila) continue;
    fila.played = entero(f.matches_played);
    fila.won = entero(f.matches_won);
    fila.lost = entero(f.matches_lost);
    fila.sets_won = entero(f.sets_won);
    fila.sets_lost = entero(f.sets_lost);
    fila.points = entero(f.total_points);
    fila.ratio_sets = Number.isFinite(Number(f.ratio_sets)) ? Number(f.ratio_sets) : 0;
    fila.ratio_puntos = Number.isFinite(Number(f.ratio_puntos)) ? Number(f.ratio_puntos) : 0;
  }

  return [...porEquipo.values()]
    .toSorted(
      (a, b) =>
        b.points - a.points ||
        b.ratio_sets - a.ratio_sets ||
        b.ratio_puntos - a.ratio_puntos ||
        (a.team.name || '').localeCompare(b.team.name || '', 'es')
    )
    // Los cocientes solo sirven para ordenar; la tabla pública muestra puntos y sets.
    .map(({ ratio_sets: _rs, ratio_puntos: _rp, ...fila }, i) => ({ position: i + 1, ...fila }));
}

/* ----------------------------------------------------------------------------------------------
   Estadísticas
   ---------------------------------------------------------------------------------------------- */

const cronologico = (a, b) =>
  (a.date || '').localeCompare(b.date || '') ||
  (a.time || '').localeCompare(b.time || '') ||
  a.number - b.number;

// Estadísticas por equipo y totales de la competencia, calculadas solo con partidos finalizados.
// posiciones: salida de armarPosiciones() (da el orden y la lista de equipos inscritos).
// partidos: salida de aPartido() de todos los partidos de la competencia.
const filaEstadistica = (f) => ({
  position: f.position,
  team: f.team,
  played: 0,
  won: 0,
  lost: 0,
  sets_won: 0,
  sets_lost: 0,
  points_for: 0,
  points_against: 0,
  five_set_matches: 0,
  resultados: []
});

const sumar = (sets, lado) => sets.reduce((total, s) => total + s[lado], 0);

// Suma un partido finalizado a la fila de un equipo. `lado` es 'home' o 'away'.
function sumarPartido(fila, partido, lado) {
  const rival = lado === 'home' ? 'away' : 'home';
  const propios = partido[`${lado}_sets`];
  const ajenos = partido[`${rival}_sets`];
  const gano = propios > ajenos;
  fila.played += 1;
  fila.won += gano ? 1 : 0;
  fila.lost += gano ? 0 : 1;
  fila.sets_won += propios;
  fila.sets_lost += ajenos;
  fila.points_for += sumar(partido.sets, lado);
  fila.points_against += sumar(partido.sets, rival);
  fila.five_set_matches += propios + ajenos === 5 ? 1 : 0;
  fila.resultados.push(gano);
}

// Racha: cuántos resultados iguales seguidos tiene el equipo contando desde el último partido.
function racha(resultados) {
  if (!resultados.length) return null;
  const ultimo = resultados.at(-1);
  const distinto = resultados.findLastIndex((r) => r !== ultimo);
  return { type: ultimo ? 'VICTORIAS' : 'DERROTAS', count: resultados.length - 1 - distinto };
}

const promedio = (total, cantidad) => (cantidad ? Math.round((total / cantidad) * 10) / 10 : null);

// Estadísticas por equipo y totales de la competencia, calculadas solo con partidos finalizados.
// posiciones: salida de armarPosiciones() (da el orden y la lista de equipos inscritos).
// partidos: salida de aPartido() de todos los partidos de la competencia.
function armarEstadisticas(posiciones, partidos) {
  // Un partido suspendido definitivamente no tiene marcador: no suma a las estadísticas.
  const jugados = partidos
    .filter((p) => p.status === 'FINALIZADO' && p.home && p.away && p.home_sets !== null && p.away_sets !== null)
    .toSorted(cronologico);
  const validos = partidos.filter((p) => p.status !== 'CANCELADO');
  const porEquipo = new Map(posiciones.map((f) => [f.team.id, filaEstadistica(f)]));

  for (const p of jugados) {
    // Un equipo retirado o descalificado no tiene fila: su partido cuenta solo en los totales.
    const local = porEquipo.get(p.home.id);
    const visita = porEquipo.get(p.away.id);
    if (local) sumarPartido(local, p, 'home');
    if (visita) sumarPartido(visita, p, 'away');
  }

  const setsJugados = jugados.reduce((t, p) => t + p.home_sets + p.away_sets, 0);
  const setsConPuntos = jugados.flatMap((p) => p.sets);
  const puntosTotales = setsConPuntos.reduce((t, s) => t + s.home + s.away, 0);

  const equipos = [...porEquipo.values()].map(({ resultados, ...fila }) => ({
    ...fila,
    sets_ratio: cociente(fila.sets_won, fila.sets_lost),
    points_ratio: cociente(fila.points_for, fila.points_against),
    streak: racha(resultados)
  }));

  return {
    totals: {
      matches_played: jugados.length,
      matches_total: validos.length,
      matchday_current: jugados.reduce((m, p) => Math.max(m, p.matchday), 0),
      sets_played: setsJugados,
      sets_per_match: promedio(setsJugados, jugados.length),
      five_set_matches: jugados.filter((p) => p.home_sets + p.away_sets === 5).length,
      points_per_set: promedio(puntosTotales, setsConPuntos.length)
    },
    teams: equipos.toSorted((a, b) => a.position - b.position)
  };
}

module.exports = {
  ESTADOS_PUBLICOS,
  EQUIPO_INSCRITO,
  aCompetencia,
  resumirAvance,
  aEquipoInscrito,
  aEquipoDetalle,
  armarNomina,
  aPartido,
  armarPosiciones,
  armarEstadisticas
};
