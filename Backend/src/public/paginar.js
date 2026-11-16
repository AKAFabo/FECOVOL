const { fallaBaseDatos } = require('./dbError');

// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta aunque se pida más. Cuando una
// ruta necesita todas las filas (por ejemplo, los partidos de varias competencias), las pide por
// bloques con range() hasta que llega un bloque incompleto.
//
// construir: función que devuelve una consulta nueva y ya filtrada (sin range).
// tope: máximo de filas en total, para que una consulta nunca crezca sin límite.
const BLOQUE = 1000;

async function todasLasFilas(construir, tope = 20_000) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += BLOQUE) {
    const hasta = Math.min(desde + BLOQUE, tope) - 1;
    const { data, error } = await construir().range(desde, hasta);
    if (error) throw fallaBaseDatos(error);
    const bloque = data || [];
    filas.push(...bloque);
    if (bloque.length < hasta - desde + 1) break;
  }
  return filas;
}

module.exports = { todasLasFilas };
