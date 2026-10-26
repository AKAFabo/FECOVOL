// Fuente de datos de noticias para el panel de administración.
// TODO: reemplazar NOTICIAS_DUMMY por consultas a Supabase dentro de listarNoticias / obtenerNoticia,
// manteniendo la misma forma de objeto para no tocar las pantallas.

const NOTICIAS_DUMMY = [
  {
    id: 1,
    titulo: 'CD Sarchí se impone en el clásico y toma la punta',
    bajada:
      'Las cartaginesas ganaron 3-1 en el Gimnasio Nacional y llegan a 19 puntos, a falta de siete fechas para el cierre de la fase regular.',
    cuerpo:
      '<p>El Gimnasio Nacional se llenó para el partido más esperado de la jornada 7. CD Sarchí y AD Turrialba llegaban empatados en la tabla y el ganador quedaba solo en la punta.</p><h2>Un cuarto set decisivo</h2><p>El tercer set volvió a ser para Sarchí y en el cuarto la diferencia se hizo evidente, con una actuación determinante de la colocadora María Fernanda Rojas.</p>',
    autor: 'Prensa FECOVOL',
    categoria: 'Liga Superior',
    competencia: 'Liga Superior Femenina 2026',
    fechaPublicacion: '2026-09-12T22:40',
    estado: 'PUBLICADA',
    etiquetas: ['CD Sarchí', 'AD Turrialba', 'Jornada 7'],
    destacada: true,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: 3180
  },
  {
    id: 2,
    titulo: 'Convocatoria de la Selección Femenina para NORCECA',
    bajada: 'El cuerpo técnico anunció la lista de 16 jugadoras que iniciarán la concentración el próximo lunes.',
    cuerpo: '<p>La Selección Nacional Femenina inicia su preparación de cara al Campeonato NORCECA.</p>',
    autor: 'Prensa FECOVOL',
    categoria: 'Selecciones',
    competencia: '',
    fechaPublicacion: '2026-09-10T09:00',
    estado: 'PUBLICADA',
    etiquetas: ['Selección Femenina', 'NORCECA'],
    destacada: false,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: 2460
  },
  {
    id: 3,
    titulo: 'Abren las inscripciones del Nacional U-19',
    bajada: 'Los equipos afiliados tienen hasta el 30 de setiembre para inscribir sus planillas.',
    cuerpo: '<p>La Federación abrió el periodo de inscripción para el Campeonato Nacional U-19.</p>',
    autor: 'Andrés Vargas',
    categoria: 'Competencias',
    competencia: 'Campeonato Nacional U-19',
    fechaPublicacion: '2026-09-08T08:30',
    estado: 'PUBLICADA',
    etiquetas: ['U-19'],
    destacada: false,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: 1890
  },
  {
    id: 4,
    titulo: 'Curso de actualización para el cuerpo arbitral',
    bajada: 'La capacitación se realizará de forma presencial durante dos fines de semana.',
    cuerpo: '<p>El curso abordará los cambios recientes al reglamento oficial de juego.</p>',
    autor: 'Prensa FECOVOL',
    categoria: 'Arbitraje',
    competencia: '',
    fechaPublicacion: '2026-09-05T16:00',
    estado: 'PUBLICADA',
    etiquetas: ['Arbitraje', 'Capacitación'],
    destacada: false,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: 940
  },
  {
    id: 5,
    titulo: 'Calendario del circuito de playa 2026',
    bajada: 'Seis paradas en cuatro provincias conforman el circuito nacional de este año.',
    cuerpo: '<p>El circuito nacional de voleibol de playa arranca en octubre.</p>',
    autor: 'Prensa FECOVOL',
    categoria: 'Voleibol de playa',
    competencia: '',
    fechaPublicacion: '2026-09-20T08:00',
    estado: 'PROGRAMADA',
    etiquetas: ['Playa'],
    destacada: false,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: null
  },
  {
    id: 6,
    titulo: 'Balance de la primera vuelta',
    bajada: '',
    cuerpo: '',
    autor: 'Prensa FECOVOL',
    categoria: 'Liga Superior',
    competencia: '',
    fechaPublicacion: '',
    estado: 'BORRADOR',
    etiquetas: [],
    destacada: false,
    imagenUrl: null,
    textoAlternativo: '',
    lecturas: null
  }
];

export async function listarNoticias() {
  return NOTICIAS_DUMMY;
}

// Devuelve la noticia con ese id, o null si no existe.
export async function obtenerNoticia(id) {
  return NOTICIAS_DUMMY.find((n) => String(n.id) === String(id)) ?? null;
}
