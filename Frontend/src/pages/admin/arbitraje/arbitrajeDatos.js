// Fuente de datos del módulo de Arbitraje (acreditaciones y cursos).
// Aquí solo hay peticiones a la API del Backend (/api/referees): las consultas a la base viven allá.
import { supabase } from '../../../supabaseClient.js';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

// La API identifica al administrador con el token de la sesión iniciada.
async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  let body;
  if (cuerpo instanceof Blob) {
    headers['Content-Type'] = cuerpo.type;
    body = cuerpo;
  } else if (cuerpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}/api/referees${ruta}`, { method: metodo, headers, body });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifique que el Backend esté en ejecución.');
  }

  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error || `Error ${respuesta.status} del servidor`);
    error.status = respuesta.status;
    throw error;
  }
  return json.data;
}

const consulta = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const texto = q.toString();
  return texto ? `?${texto}` : '';
};

// ---------- lecturas ----------

export const obtenerResumen = () => pedir('/summary');
export const obtenerOpciones = () => pedir('/options');

/** { items, total, page, page_size } */
export function listarArbitros({ funcion, estado, provincia, busqueda, pagina }) {
  return pedir(`/${consulta({ funcion, estado, provincia, q: busqueda, page: pagina })}`);
}

export const buscarEnPadron = (q) => pedir(`/persons${consulta({ q })}`);
export const obtenerPersona = (id) => pedir(`/persons/${encodeURIComponent(id)}`);
export const obtenerFicha = (id) => pedir(`/${encodeURIComponent(id)}`);
export const obtenerCurso = (id) => pedir(`/courses/${encodeURIComponent(id)}`);
export const listarCursos = () => pedir('/courses');

// ---------- escrituras ----------

/** Sube un requisito (PDF, JPG o PNG) y devuelve { path, name }. */
export async function subirArchivo(archivo) {
  const { path } = await pedir('/files', { metodo: 'POST', cuerpo: archivo });
  return { path, name: archivo.name };
}

export const acreditar = (datos) => pedir('/accreditations', { metodo: 'POST', cuerpo: datos });
export const editarAcreditacion = (id, datos) =>
  pedir(`/accreditations/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo: datos });

export const programarCurso = (datos) => pedir('/courses', { metodo: 'POST', cuerpo: datos });
export const inscribirEnCurso = (cursoId, personaId) =>
  pedir(`/courses/${encodeURIComponent(cursoId)}/enrollments`, { metodo: 'POST', cuerpo: { person_id: personaId } });
export const cargarNota = (cursoId, inscripcionId, cambios) =>
  pedir(`/courses/${encodeURIComponent(cursoId)}/enrollments/${encodeURIComponent(inscripcionId)}`, {
    metodo: 'PATCH',
    cuerpo: cambios
  });

// ---------- formato compartido por las pantallas ----------

// Nombre corto de la función para tablas: 'Árbitro principal' → 'Principal'.
const FUNCION_CORTA = { PRI: 'Principal', SEG: 'Segundo', ANO: 'Anotador', LIN: 'Línea' };
export const funcionCorta = (f) => (f ? FUNCION_CORTA[f.code] || f.value : '—');

export const PROVINCIAS = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'];

export const ESTADO_ACREDITACION = {
  AL_DIA: { texto: 'Al día', clase: 'badge-status--activa' },
  POR_VENCER: { texto: 'Por vencer', clase: 'badge-status--por-vencer' },
  VENCIDA: { texto: 'Vencida', clase: 'badge-status--vencida' }
};

export const MODALIDADES = [
  { codigo: 'SALA', nombre: 'Sala' },
  { codigo: 'PLAYA', nombre: 'Playa' },
  { codigo: 'SALA_PLAYA', nombre: 'Sala y playa' }
];

export const TIPOS_CURSO = {
  FORMACION_INICIAL: 'Formación inicial',
  ACTUALIZACION_ANUAL: 'Actualización anual',
  ASCENSO_NIVEL: 'Ascenso de nivel'
};

export const RESULTADO_CURSO = {
  INSCRITO: 'Inscrito',
  APROBADO: 'Aprobado',
  REPROBADO: 'Reprobado',
  AUSENTE: 'Ausente'
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

const partes = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { a, m, d };
};

/** '2026-12-31' → '31/12/2026' */
export function fechaCorta(iso) {
  if (!iso) return '—';
  const { a, m, d } = partes(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

/** '2026-09-12' → '12 set' */
export function diaMes(iso) {
  if (!iso) return '—';
  const { m, d } = partes(iso);
  return `${String(d).padStart(2, '0')} ${MESES[m - 1]}`;
}

/** '2025-11-20' → 'nov 2025' */
export function mesAnio(iso) {
  if (!iso) return '—';
  const { a, m } = partes(iso);
  return `${MESES[m - 1]} ${a}`;
}

/** Rango de un curso: '28 y 29 de setiembre', '12 de octubre', '30 de nov. al 2 de dic.' */
export function rangoCurso(inicio, fin) {
  const i = partes(inicio);
  const f = partes(fin || inicio);
  if (inicio === fin || !fin) return `${i.d} de ${MESES_LARGOS[i.m - 1]}`;
  if (i.m === f.m && i.a === f.a) {
    return f.d - i.d === 1 ? `${i.d} y ${f.d} de ${MESES_LARGOS[i.m - 1]}` : `${i.d} al ${f.d} de ${MESES_LARGOS[i.m - 1]}`;
  }
  return `${i.d} de ${MESES_LARGOS[i.m - 1]} al ${f.d} de ${MESES_LARGOS[f.m - 1]}`;
}

/** Fecha de hoy en formato de <input type="date">. */
export function hoyIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}
