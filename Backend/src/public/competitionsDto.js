// Formato de salida de la API pública de competencias.
//
// Todo lo que sale hacia el portal público pasa por estas funciones. Cada una arma el objeto
// campo por campo (lista blanca): si mañana se agrega una columna a la base de datos, no se
// publica sola. Son funciones puras, sin acceso a la base de datos, para poder probarlas aparte.

// Estados de una competencia que el público puede ver. PLANIFICACION queda fuera porque es un
// borrador interno de la Federación.
const ESTADOS_PUBLICOS = Object.freeze(['INSCRIPCIONES', 'EN_CURSO', 'FINALIZADA', 'CERRADA']);

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

function aCompetencia(fila) {
  return {
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
}

function aEquipo(equipo) {
  if (!equipo || typeof equipo !== 'object') return null;
  return { id: equipo.id, name: texto(equipo.name), short_name: texto(equipo.short_name) };
}

// sets: filas de match_sets del partido. Solo se publican cuando el partido terminó, para no
// mostrar marcadores parciales que todavía pueden corregirse.
function aPartido(fila, sets = []) {
  const terminado = fila.status === 'FINALIZADO';
  return {
    id: fila.id,
    number: entero(fila.match_number),
    matchday: entero(fila.matchday),
    date: fila.scheduled_date || null,
    time: fila.scheduled_time ? String(fila.scheduled_time).slice(0, 5) : null,
    venue: texto(fila.venue),
    status: fila.status,
    home: aEquipo(fila.local),
    away: aEquipo(fila.visitante),
    home_sets: terminado ? entero(fila.home_sets_won) : null,
    away_sets: terminado ? entero(fila.away_sets_won) : null,
    sets: terminado
      ? sets
          .map((s) => ({ number: entero(s.set_number), home: entero(s.home_points), away: entero(s.away_points) }))
          .sort((a, b) => a.number - b.number)
      : []
  };
}

// Une los equipos inscritos con lo que calcula la vista v_standings. La vista solo trae equipos
// que ya jugaron algún partido; aquí los demás aparecen con cero para que la tabla esté completa
// desde la primera jornada.
//
// Orden: puntos, luego sets ganados (el mismo criterio que usa GET /api/competitions/:id/standings)
// y al final el nombre, solo para que el orden sea estable. Las reglas oficiales de desempate
// siguen pendientes (decisión DP-01 del SAD); cuando se definan, se cambian en un solo lugar.
function armarPosiciones(inscritos, filasVista) {
  const porEquipo = new Map();

  for (const insc of inscritos) {
    const equipo = aEquipo(insc.equipo);
    if (!equipo || !equipo.id) continue;
    porEquipo.set(equipo.id, {
      team: equipo,
      played: 0,
      won: 0,
      lost: 0,
      sets_won: 0,
      sets_lost: 0,
      points: 0
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
  }

  return [...porEquipo.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.sets_won - a.sets_won ||
        (a.team.name || '').localeCompare(b.team.name || '', 'es')
    )
    .map((fila, i) => ({ position: i + 1, ...fila }));
}

module.exports = { ESTADOS_PUBLICOS, aCompetencia, aPartido, armarPosiciones };
