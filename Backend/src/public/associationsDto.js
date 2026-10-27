// Formato de salida de la API pública de asociaciones y equipos (lista blanca de campos).
//
// Queda fuera a propósito (RF-DIV-004 y sección 5.2 del ERS):
// - cédula jurídica, dirección, correo y teléfono de la asociación;
// - junta directiva (nombres y contactos de personas);
// - integrantes de los equipos (de los equipos inscritos en una competencia se publican solo
//   nombre, número y posición, en competitionsDto.js).
// Si FECOVOL autoriza publicar alguno de esos datos, se agrega aquí y en su prueba, y en ningún
// otro lugar.

// Solo las asociaciones afiliadas aparecen en el portal. PROVISIONAL todavía no está aprobada y
// SUSPENDIDA o DESAFILIADA no deben presentarse como parte de la Federación.
const ESTADO_PUBLICO_ASOCIACION = 'AFILIADA';
const ESTADO_PUBLICO_EQUIPO = 'ACTIVO';

function texto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

function catalogo(valor) {
  return valor && typeof valor === 'object' ? texto(valor.value) : null;
}

// Solo direcciones http(s) bien formadas. Evita que un valor como "javascript:..." guardado por
// error termine como enlace en el portal.
function sitioWeb(valor) {
  const t = texto(valor);
  if (!t) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function aAsociacionResumen(fila, cantidadEquipos = 0) {
  return {
    id: fila.id,
    name: texto(fila.name),
    short_name: texto(fila.short_name),
    province: texto(fila.province),
    canton: texto(fila.canton),
    home_venue: texto(fila.home_venue),
    team_count: cantidadEquipos
  };
}

function aAsociacionDetalle(fila, equipos) {
  return {
    id: fila.id,
    name: texto(fila.name),
    short_name: texto(fila.short_name),
    province: texto(fila.province),
    canton: texto(fila.canton),
    home_venue: texto(fila.home_venue),
    website: sitioWeb(fila.website),
    affiliation_date: fila.affiliation_date || null,
    teams: equipos
  };
}

// competencias: filas de competition_teams con la competencia embebida, ya filtradas a estados
// públicos por quien llama.
function aEquipo(fila, competencias = []) {
  return {
    id: fila.id,
    name: texto(fila.name),
    short_name: texto(fila.short_name),
    category: catalogo(fila.categoria),
    branch: catalogo(fila.rama),
    modality: catalogo(fila.modalidad),
    home_venue: texto(fila.home_venue),
    competitions: competencias
      .filter((c) => c?.id)
      .map((c) => ({ id: c.id, name: texto(c.name), status: c.status }))
  };
}

module.exports = {
  ESTADO_PUBLICO_ASOCIACION,
  ESTADO_PUBLICO_EQUIPO,
  aAsociacionResumen,
  aAsociacionDetalle,
  aEquipo,
  sitioWeb
};
