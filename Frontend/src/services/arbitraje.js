// Datos del módulo de arbitraje: pantallas de FECOVOL (cuerpo arbitral, acreditaciones, cursos y
// designaciones) y el entorno del propio árbitro. Los permisos los decide el backend.
import { api } from './apiInterna.js';

const enc = encodeURIComponent;
const datos = (promesa) => promesa.then((r) => r.data);

function consulta(filtros) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/* FECOVOL ------------------------------------------------------------------------------------ */
export const resumenArbitraje = (opciones) => datos(api.get('/referees/resumen', opciones));
/** Devuelve { data, total, pagina, por_pagina }. */
export const listarCuerpoArbitral = (filtros, opciones) => api.get(`/referees${consulta(filtros)}`, opciones);
export const fichaArbitral = (personaId, opciones) => datos(api.get(`/referees/personas/${enc(personaId)}`, opciones));
/** Devuelve { data: { id }, acceso: { estado, correo?, motivo? } }. */
export const acreditarArbitro = (acreditacion) => api.post('/referees/acreditaciones', acreditacion);
/** Da acceso al entorno arbitral a una persona ya acreditada. Devuelve { acceso }. */
export const darAccesoArbitro = (personaId) => api.post(`/referees/personas/${enc(personaId)}/acceso`);

/** Texto para el resultado de dar acceso (al acreditar o después). */
export function textoAcceso(acceso) {
  switch (acceso?.estado) {
    case 'INVITACION_ENVIADA':
      return { tono: 'ok', texto: `Se envió una invitación a ${acceso.correo} para que defina su contraseña y entre al entorno del cuerpo arbitral.` };
    case 'VINCULADA':
      return { tono: 'ok', texto: `La cuenta ${acceso.correo} ya existía: ahora también tiene acceso al entorno del cuerpo arbitral.` };
    case 'YA_TENIA':
      return { tono: 'ok', texto: 'La persona ya tenía cuenta y conserva su acceso al entorno del cuerpo arbitral.' };
    case 'SIN_CORREO':
      return { tono: 'aviso', texto: 'La persona no tiene correo en el padrón, así que todavía no tiene acceso al sistema. Agréguelo en su ficha del padrón y use «Dar acceso».' };
    default:
      return { tono: 'aviso', texto: acceso?.motivo || 'No fue posible dar acceso al sistema. Inténtelo desde la ficha o desde Usuarios y permisos.' };
  }
}

export const listarCursos = (filtros, opciones) => datos(api.get(`/referees/cursos${consulta(filtros)}`, opciones));
export const obtenerCurso = (id, opciones) => datos(api.get(`/referees/cursos/${enc(id)}`, opciones));
export const crearCurso = (curso) => datos(api.post('/referees/cursos', curso));
export const cambiarEstadoCurso = (id, estado) => datos(api.patch(`/referees/cursos/${enc(id)}`, { status: estado }));
export const inscribirEnCurso = (cursoId, personaId) => datos(api.post(`/referees/cursos/${enc(cursoId)}/inscripciones`, { person_id: personaId }));
/** `resultado`: { grade } o { ausente: true }. */
export const calificarInscripcion = (cursoId, inscripcionId, resultado) =>
  datos(api.patch(`/referees/cursos/${enc(cursoId)}/inscripciones/${enc(inscripcionId)}`, resultado));

export const disponiblesParaPartido = (partidoId, opciones) => api.get(`/referees/disponibles${consulta({ match_id: partidoId })}`, opciones);
/** Devuelve { data, desde, hasta, oficiales_por_partido }. */
export const partidosPorDesignar = (filtros, opciones) => api.get(`/referee-assignments/partidos${consulta(filtros)}`, opciones);
export const designarOficial = (designacion) => datos(api.post('/referee-assignments', designacion));
export const anularDesignacion = (id, motivo) => datos(api.patch(`/referee-assignments/${enc(id)}`, { status: 'ANULADA', notes: motivo || undefined }));

/* Cuerpo arbitral (la persona de la sesión) --------------------------------------------------- */
export const miFichaArbitral = (opciones) => datos(api.get('/referees/me', opciones));
/** Devuelve { data, hoy }. */
export const misDesignaciones = (opciones) => api.get('/referees/me/designaciones', opciones);
export const responderDesignacion = (id, estado, motivo) =>
  datos(api.patch(`/referees/me/designaciones/${enc(id)}`, { status: estado, motivo: motivo || undefined }));
export const actualizarMiContacto = (cambios) => datos(api.patch('/referees/me/contacto', cambios));
export const inscribirmeEnCurso = (cursoId) => datos(api.post(`/referees/me/cursos/${enc(cursoId)}/inscripcion`));

/* Textos ------------------------------------------------------------------------------------- */
export const ESTADOS_ACREDITACION = {
  AL_DIA: { texto: 'Al día', tono: 'ok' },
  POR_VENCER: { texto: 'Por vencer', tono: 'aviso' },
  VENCIDA: { texto: 'Vencida', tono: 'error' },
  SIN_ACREDITACION: { texto: 'Sin acreditación', tono: 'neutro' }
};

export const ESTADOS_DESIGNACION = {
  PROPUESTA: { texto: 'Por confirmar', tono: 'aviso' },
  CONFIRMADA: { texto: 'Confirmada', tono: 'ok' },
  RECHAZADA: { texto: 'Rechazada', tono: 'error' },
  CUMPLIDA: { texto: 'Cumplida', tono: 'neutro' },
  ANULADA: { texto: 'Anulada', tono: 'neutro' }
};

export const ESTADOS_ACTA = {
  BORRADOR: { texto: 'Acta abierta', tono: 'aviso' },
  ENVIADA: { texto: 'Acta enviada', tono: 'info' },
  VALIDADA: { texto: 'Validada', tono: 'ok' }
};

export const MODALIDADES_ARBITRAJE = { SALA: 'Sala', PLAYA: 'Playa', SALA_PLAYA: 'Sala y playa' };

export const TIPOS_CURSO = {
  FORMACION_INICIAL: { texto: 'Formación inicial', detalle: 'Para personas que aún no son árbitros. Al aprobar pueden ser acreditadas.' },
  ACTUALIZACION_ANUAL: { texto: 'Actualización anual', detalle: 'Obligatoria para renovar la acreditación vigente.' },
  ASCENSO_NIVEL: { texto: 'Ascenso de nivel', detalle: 'Para pasar de nivel nacional a internacional.' }
};

export const FORMATOS_CURSO = { PRESENCIAL: 'Presencial', VIRTUAL: 'Virtual', MIXTO: 'Mixto' };

export const ESTADOS_CURSO = {
  PUBLICADO: { texto: 'Publicado', tono: 'ok' },
  CERRADO: { texto: 'Cerrado', tono: 'neutro' },
  CANCELADO: { texto: 'Cancelado', tono: 'error' }
};

export const RESULTADOS_CURSO = {
  INSCRITO: { texto: 'Inscrito', tono: 'aviso' },
  APROBADO: { texto: 'Aprobado', tono: 'ok' },
  REPROBADO: { texto: 'Reprobado', tono: 'error' },
  AUSENTE: { texto: 'Ausente', tono: 'neutro' }
};

// Orden de los puestos de un partido completo.
export const PUESTOS = ['PRI', 'SEG', 'ANO', 'LIN'];

/** "Árbitro principal · Nacional" o "Sin acreditación". */
export function categoriaArbitral(a) {
  const funcion = a?.funcion_value || a?.funcion?.value;
  const nivel = a?.nivel_value || a?.nivel?.value;
  return [funcion, nivel].filter(Boolean).join(' · ') || 'Sin acreditación';
}

/** "dd/mm/aaaa" para una fecha AAAA-MM-DD. */
export function fechaNumerica(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** "18:30" a partir de "18:30:00". */
export const hora = (h) => (typeof h === 'string' ? h.slice(0, 5) : '');

export const nombreEquipo = (e) => e?.short_name || e?.name || 'Por definir';
export const nombrePartido = (p) => `${nombreEquipo(p?.local)} vs ${nombreEquipo(p?.visitante)}`;

/** Fecha de hoy en Costa Rica (AAAA-MM-DD). */
export function hoyCR() {
  return new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}
