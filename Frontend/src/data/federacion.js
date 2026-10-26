// Contenido institucional de la página "La Federación" y del pie del portal.
//
// IMPORTANTE: aquí solo va información oficial confirmada por FECOVOL. Todo lo que esté vacío
// no se muestra: la página oculta la sección completa en lugar de enseñar textos de ejemplo.
// No agregar organismos, afiliaciones ni aliados externos: hoy FECOVOL no declara ninguno.
//
// Las cifras (asociaciones, equipos, personas y árbitros) no van aquí: salen de la base de datos
// por GET /api/public/federation.
//
// Cómo completar cada parte:
// - quienesSomos: uno o más párrafos de texto plano.
// - mision / vision: un párrafo cada una.
// - junta: periodo ("2025–2029") y miembros [{ nombre, cargo }]. Solo nombre y cargo: sin
//   correos ni teléfonos personales.
// - documentos: [{ titulo, detalle, url, formato, tamano }]. `url` debe ser https:// (por
//   ejemplo, un archivo en Supabase Storage con acceso público); los demás se descartan.
// - contacto: dirección, teléfono, correo y horario de la oficina. Las redes sociales vienen de
//   data/redes.js.

export const FEDERACION = Object.freeze({
  quienesSomos: [
    'La Federación Costarricense de Voleibol (FECOVOL) organiza las competencias nacionales de voleibol y lleva el registro de las asociaciones, los equipos, las personas federadas y el cuerpo arbitral que participan en ellas.'
  ],
  mision: '',
  vision: '',
  junta: {
    periodo: '',
    miembros: []
  },
  documentos: [],
  contacto: {
    direccion: '',
    telefono: '',
    correo: '',
    horario: ''
  }
});

/* ----------------------------------------------------------------------------------------------
   Lectura segura del contenido (descarta lo vacío o mal formado)
   ---------------------------------------------------------------------------------------------- */

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

const CORREO = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;
const TELEFONO = /^[+\d][\d\s()-]{6,}$/;

function urlSegura(valor) {
  try {
    const url = new URL(texto(valor));
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function contenidoFederacion(fuente = FEDERACION) {
  const contacto = fuente.contacto || {};
  const correo = texto(contacto.correo);
  const telefono = texto(contacto.telefono);

  return {
    quienesSomos: (fuente.quienesSomos || []).map(texto).filter(Boolean),
    mision: texto(fuente.mision),
    vision: texto(fuente.vision),
    junta: {
      periodo: texto(fuente.junta?.periodo),
      miembros: (fuente.junta?.miembros || [])
        .map((m) => ({ nombre: texto(m?.nombre), cargo: texto(m?.cargo) }))
        .filter((m) => m.nombre && m.cargo)
    },
    documentos: (fuente.documentos || [])
      .map((d) => ({
        titulo: texto(d?.titulo),
        detalle: texto(d?.detalle),
        formato: texto(d?.formato),
        tamano: texto(d?.tamano),
        url: urlSegura(d?.url)
      }))
      .filter((d) => d.titulo && d.url),
    contacto: {
      direccion: texto(contacto.direccion),
      horario: texto(contacto.horario),
      correo: CORREO.test(correo) ? correo : '',
      telefono: TELEFONO.test(telefono) ? telefono : ''
    }
  };
}
