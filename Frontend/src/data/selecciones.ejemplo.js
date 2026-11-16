// DATOS DE EJEMPLO, SOLO PARA DESARROLLO. Nombres, torneos y fechas son inventados.
// Se cargan únicamente con `npm run dev` abriendo /selecciones?demo (ver services/selecciones.js)
// y la página los marca como ejemplo. No se incluyen en el build de producción.
const id = (n) => `5e1ec000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SEL = {
  mayorF: id(1), mayorM: id(2), sub21F: id(3), sub19M: id(4), playaF: id(5), playaM: id(6)
};
const CONV = { mayorF: id(101), sub19M: id(102) };

export const SELECCIONES_EJEMPLO = {
  national_teams: [
    { id: SEL.mayorF, name: 'Selección Mayor Femenina', modality: 'Sala', branch: 'Femenina', category: 'Mayor', callup_id: CONV.mayorF,
      next_event: { name: 'Torneo internacional de ejemplo', start_date: '2026-11-03', end_date: '2026-11-11', venue: 'Sede de ejemplo' } },
    { id: SEL.mayorM, name: 'Selección Mayor Masculina', modality: 'Sala', branch: 'Masculina', category: 'Mayor', callup_id: null,
      next_event: { name: 'Copa regional de ejemplo', start_date: '2026-11-18', end_date: '2026-11-24', venue: 'Sede de ejemplo' } },
    { id: SEL.sub21F, name: 'Selección Sub-21 Femenina', modality: 'Sala', branch: 'Femenina', category: 'Sub-21', callup_id: null,
      next_event: { name: 'Torneo Sub-21 de ejemplo', start_date: '2026-12-02', end_date: '2026-12-06', venue: 'San José' } },
    { id: SEL.sub19M, name: 'Selección Sub-19 Masculina', modality: 'Sala', branch: 'Masculina', category: 'Sub-19', callup_id: CONV.sub19M,
      next_event: { name: 'Microciclo de preparación', start_date: '2026-11-06', end_date: '2026-11-10', venue: 'Gimnasio de ejemplo' } },
    { id: SEL.playaF, name: 'Selección de Playa Femenina', modality: 'Playa', branch: 'Femenina', category: 'Mayor', callup_id: null,
      next_event: { name: 'Gira de playa de ejemplo', start_date: '2026-11-14', end_date: '2026-11-16', venue: 'Sede de ejemplo' } },
    { id: SEL.playaM, name: 'Selección de Playa Masculina', modality: 'Playa', branch: 'Masculina', category: 'Mayor', callup_id: null, next_event: null }
  ],
  events: [
    { id: id(201), name: 'Torneo internacional de ejemplo', start_date: '2026-11-03', end_date: '2026-11-11', venue: 'Sede de ejemplo', modality: 'Sala', teams: ['Mayor Femenina'] },
    { id: id(202), name: 'Microciclo de preparación', start_date: '2026-11-06', end_date: '2026-11-10', venue: 'Gimnasio de ejemplo', modality: 'Sala', teams: ['Sub-19 Masculina'] },
    { id: id(203), name: 'Gira de playa de ejemplo', start_date: '2026-11-14', end_date: '2026-11-16', venue: 'Sede de ejemplo', modality: 'Playa', teams: ['Playa Femenina'] },
    { id: id(204), name: 'Copa regional de ejemplo', start_date: '2026-11-18', end_date: '2026-11-24', venue: 'Sede de ejemplo', modality: 'Sala', teams: ['Mayor Masculina'] },
    { id: id(205), name: 'Torneo Sub-21 de ejemplo', start_date: '2026-12-02', end_date: '2026-12-06', venue: 'San José', modality: 'Sala', teams: ['Sub-21 Femenina'] }
  ],
  callups: [
    {
      id: CONV.mayorF, team_id: SEL.mayorF, title: 'Torneo internacional de ejemplo', document_url: 'https://ejemplo.invalid/convocatoria.pdf',
      players: [
        [1, 'Atleta de Ejemplo Uno', 'Armadora', 'Club A'], [2, 'Atleta de Ejemplo Dos', 'Opuesta', 'Club B'],
        [4, 'Atleta de Ejemplo Tres', 'Central', 'Club C'], [5, 'Atleta de Ejemplo Cuatro', 'Líbero', 'Club A'],
        [7, 'Atleta de Ejemplo Cinco', 'Receptora', 'Club D'], [8, 'Atleta de Ejemplo Seis', 'Receptora', 'Club E'],
        [9, 'Atleta de Ejemplo Siete', 'Central', 'Club D'], [11, 'Atleta de Ejemplo Ocho', 'Armadora', 'Club C'],
        [12, 'Atleta de Ejemplo Nueve', 'Receptora', 'Club A'], [14, 'Atleta de Ejemplo Diez', 'Opuesta', 'Club F'],
        [15, 'Atleta de Ejemplo Once', 'Líbero', 'Club G'], [17, 'Atleta de Ejemplo Doce', 'Central', 'Club A']
      ].map(([number, name, position, club]) => ({ number, name, position, club })),
      staff: [
        { name: 'Persona de Ejemplo A', role: 'Entrenador principal' },
        { name: 'Persona de Ejemplo B', role: 'Asistente técnica' },
        { name: 'Persona de Ejemplo C', role: 'Preparador físico' },
        { name: 'Persona de Ejemplo D', role: 'Delegada' }
      ]
    },
    {
      id: CONV.sub19M, team_id: SEL.sub19M, title: 'Microciclo de preparación', document_url: null,
      players: [
        [3, 'Atleta de Ejemplo Trece', 'Armador', 'Club H'], [6, 'Atleta de Ejemplo Catorce', 'Central', 'Club I'],
        [10, 'Atleta de Ejemplo Quince', 'Receptor', 'Club H'], [13, 'Atleta de Ejemplo Dieciséis', 'Líbero', 'Club J']
      ].map(([number, name, position, club]) => ({ number, name, position, club })),
      staff: [{ name: 'Persona de Ejemplo E', role: 'Entrenador principal' }]
    }
  ]
};
