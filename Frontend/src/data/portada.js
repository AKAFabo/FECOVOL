// Contenido de ejemplo de la portada.
// Las noticias ya vienen de la base de datos (GET /api/public/news/portada).
// Mientras los módulos de Competencias y Selecciones no tengan su API,
// la portada se llena con estos datos. Cuando existan los endpoints, cada bloque
// se reemplaza por su llamada (por ejemplo GET /api/public/partidos?recientes=4).

export const destacado = 'Liga Superior Femenina · Jornada 7';

export const partidos = [
  {
    id: 1,
    estado: { texto: 'Final', tono: 'neutra' },
    detalle: '12 set · Jornada 7',
    local: { nombre: 'CD Sarchí', marcador: 3 },
    visita: { nombre: 'AD Turrialba', marcador: 1 }
  },
  {
    id: 2,
    estado: { texto: 'Final', tono: 'neutra' },
    detalle: '12 set · Jornada 7',
    local: { nombre: 'Deportivo Escazú', marcador: 1 },
    visita: { nombre: 'UCR Voleibol', marcador: 3 }
  },
  {
    id: 3,
    estado: { texto: 'Hoy 19:00', tono: 'aviso' },
    detalle: 'Gimnasio Nacional',
    local: { nombre: 'San Carlos VC' },
    visita: { nombre: 'Liceo de Costa Rica' }
  },
  {
    id: 4,
    estado: { texto: 'Vie 20:00', tono: 'neutra' },
    detalle: 'Jornada 8',
    local: { nombre: 'AD Turrialba' },
    visita: { nombre: 'CD Sarchí' }
  }
];

export const cifras = [
  { valor: '12', etiqueta: 'asociaciones afiliadas' },
  { valor: '96', etiqueta: 'equipos federados' },
  { valor: '2 340', etiqueta: 'personas federadas' },
  { valor: '8', etiqueta: 'competencias al año' }
];

export const competencias = [
  {
    id: 1,
    estado: { texto: 'En curso · Jornada 7', tono: 'ok' },
    nombre: 'Liga Superior Femenina 2026',
    detalle: '12 equipos · fase regular hasta noviembre',
    enlace: 'Ver posiciones',
    color: '#0e3b6b'
  },
  {
    id: 2,
    estado: { texto: 'En curso · Jornada 7', tono: 'ok' },
    nombre: 'Liga Superior Masculina 2026',
    detalle: '10 equipos · fase regular hasta noviembre',
    enlace: 'Ver posiciones',
    color: '#12335a'
  },
  {
    id: 3,
    estado: { texto: 'Inscripciones abiertas', tono: 'aviso' },
    nombre: 'Campeonato Nacional U-19',
    detalle: 'Cierre de inscripciones: 30 de setiembre',
    enlace: 'Ver detalles',
    color: '#7a3a12'
  }
];

export const selecciones = [
  {
    id: 1,
    rama: 'Femenina · Mayor',
    nombre: 'Selección Nacional Femenina',
    compromiso: 'Concentración y entrenamientos en el Gimnasio Nacional durante octubre.',
    color: '#0e3b6b'
  },
  {
    id: 2,
    rama: 'Masculina · Mayor',
    nombre: 'Selección Nacional Masculina',
    compromiso: 'Convocatoria abierta para el proceso de selección de noviembre.',
    color: '#12335a'
  }
];
