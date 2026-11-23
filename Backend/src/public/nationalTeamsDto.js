// Lista blanca de campos de las selecciones nacionales para el portal público (RF-DIV-004).
const nombre = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

function aEvento(e) {
  if (!e) return null;
  return { name: e.name, start_date: e.start_date, end_date: e.end_date, venue: e.venue || null };
}

/**
 * Arma { national_teams, events, callups } solo con lo publicable. Las convocatorias llegan
 * ordenadas de la más reciente a la más antigua; cada selección muestra la más reciente.
 */
function aSelecciones({ selecciones, convocatorias, eventos }, hoy = new Date().toISOString().slice(0, 10)) {
  const activas = new Map(selecciones.map((s) => [s.id, s]));
  const publicadas = convocatorias.filter((c) => activas.has(c.national_team_id));

  const ultima = new Map();
  for (const c of publicadas) if (!ultima.has(c.national_team_id)) ultima.set(c.national_team_id, c);

  // Equipos que participan en cada evento, según las convocatorias publicadas.
  const equiposPorEvento = new Map();
  for (const c of publicadas) {
    if (!c.evento?.id) continue;
    const lista = equiposPorEvento.get(c.evento.id) || new Set();
    lista.add(activas.get(c.national_team_id).name);
    equiposPorEvento.set(c.evento.id, lista);
  }

  const proximoDe = (equipoId) => {
    const futuros = publicadas
      .filter((c) => c.national_team_id === equipoId && c.evento && c.evento.status !== 'CANCELADO' && c.evento.end_date >= hoy)
      .map((c) => c.evento)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return aEvento(futuros[0]);
  };

  return {
    national_teams: selecciones.map((s) => ({
      id: s.id,
      name: s.name,
      modality: s.modality,
      branch: s.rama?.value || null,
      category: s.categoria?.value || null,
      next_event: proximoDe(s.id),
      callup_id: ultima.get(s.id)?.id || null
    })),
    events: eventos
      .filter((e) => equiposPorEvento.has(e.id))
      .map((e) => ({ id: e.id, ...aEvento(e), modality: e.modality, teams: [...equiposPorEvento.get(e.id)] })),
    callups: [...ultima.values()].map((c) => {
      const integrantes = (c.integrantes || []).filter((m) => m.persona && m.persona.status === 'ACTIVA');
      return {
        id: c.id,
        team_id: c.national_team_id,
        title: c.title,
        document_url: null,
        players: integrantes
          .filter((m) => m.member_type === 'JUGADOR')
          .map((m) => ({ number: m.jersey_number ?? null, name: nombre(m.persona), position: m.posicion?.value || null }))
          .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000)),
        staff: integrantes
          .filter((m) => m.member_type === 'CUERPO_TECNICO')
          .map((m) => ({ name: nombre(m.persona), role: m.staff_role }))
      };
    })
  };
}

module.exports = { aSelecciones };
