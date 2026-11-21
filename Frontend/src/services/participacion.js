// Participación de los equipos en competencias (RF-ASO-007) y reportes de la asociación
// (RF-ASO-008). El alcance (solo la propia asociación) lo aplica el backend.
import { URL_BACKEND } from './backend.js';
import { api, ApiError } from './apiInterna.js';
import { tokenDeSesion } from './sesionBackend.js';

const enc = encodeURIComponent;

function consulta(filtros) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/** { data: inscripciones, equipos, consultado_en } */
export const miParticipacion = (opciones) => api.get('/participacion', opciones);
/** { data: partidos, desde, hasta, consultado_en, actualizado } */
export const calendarioAsociacion = (filtros, opciones) => api.get(`/participacion/partidos${consulta(filtros)}`, opciones);
export const participacionEquipo = (competenciaId, equipoId, opciones) =>
  api.get(`/participacion/competencias/${enc(competenciaId)}/equipos/${enc(equipoId)}`, opciones).then((r) => r.data);

export const reporteAsociacion = (parametros, opciones) => api.get(`/reportes-asociacion${consulta(parametros)}`, opciones).then((r) => r.data);
/** Deja constancia en la bitácora antes de imprimir el reporte. */
export const registrarImpresion = (parametros) => api.post('/reportes-asociacion/exportacion', { ...parametros, formato: 'IMPRESION' });

/**
 * Descarga el reporte en Excel. El archivo lo genera el backend (que además registra la
 * exportación); aquí solo se recibe y se ofrece al navegador.
 */
export async function descargarReporteExcel(parametros) {
  const token = await tokenDeSesion();
  if (!token) throw new ApiError('Su sesión venció. Ingrese de nuevo.', 401);
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 60_000);
  let respuesta;
  try {
    respuesta = await fetch(`${URL_BACKEND}/api/reportes-asociacion/exportacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...parametros, formato: 'XLSX' }),
      credentials: 'omit',
      signal: control.signal
    });
  } catch {
    throw new ApiError('No fue posible descargar el archivo. Intente de nuevo.', 0);
  } finally {
    clearTimeout(temporizador);
  }

  if (!respuesta.ok) {
    const json = await respuesta.json().catch(() => null);
    throw new ApiError(typeof json?.error === 'string' ? json.error : 'No fue posible generar el archivo.', respuesta.status);
  }

  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('spreadsheetml')) throw new ApiError('La respuesta no es un archivo de Excel.', 0);
  const disposicion = respuesta.headers.get('content-disposition') || '';
  const nombre = /filename="([\w.-]+\.xlsx)"/.exec(disposicion)?.[1] || 'reporte.xlsx';

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Textos ------------------------------------------------------------------------------------- */
export const ESTADOS_INSCRIPCION = {
  PENDIENTE: { texto: 'En revisión', tono: 'neutro' },
  POR_SUBSANAR: { texto: 'Por subsanar', tono: 'aviso' },
  DEVUELTA: { texto: 'Devuelta', tono: 'error' },
  INSCRITO: { texto: 'Inscrito', tono: 'ok' },
  RETIRADO: { texto: 'Retirado', tono: 'neutro' },
  DESCALIFICADO: { texto: 'Descalificado', tono: 'error' }
};

export const ESTADOS_COMPETENCIA = {
  INSCRIPCIONES: 'Inscripciones abiertas',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CERRADA: 'Cerrada'
};

export const nombreEquipo = (e) => e?.short_name || e?.name || 'Por definir';

/** "Ganó 3-1", "Perdió 1-3", "Jugado · resultado en validación", "Por jugar"… */
export function textoResultado(p) {
  if (p.result) {
    if (p.result.special) return p.result.special;
    const { own_sets: a, rival_sets: b } = p.result;
    if (a === null || a === undefined || b === null || b === undefined) return 'Finalizado';
    return `${a > b ? 'Ganó' : a < b ? 'Perdió' : 'Empató'} ${a}-${b}`;
  }
  if (p.pending_validation) return 'En validación';
  if (p.status === 'SUSPENDIDO') return 'Suspendido';
  if (p.status === 'EN_CURSO') return 'En juego';
  return 'Por jugar';
}

export function tonoResultado(p) {
  if (p.result && !p.result.special) return p.result.own_sets > p.result.rival_sets ? 'ok' : 'neutro';
  if (p.pending_validation) return 'aviso';
  return null;
}

/** "25-20 · 18-25 · 25-22" desde el punto de vista del equipo propio. */
export const textoSets = (p) => (p.result?.sets || []).map((s) => `${s.own}-${s.rival}`).join(' · ');

/** "2.º de 8" */
export const textoPosicion = (s) => (s ? `${s.position}.º de ${s.teams}` : '—');

/** Fecha y hora de un instante ISO en Costa Rica: "18/11/2026 14:30". */
export function fechaHoraCR(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Costa_Rica'
  }).format(d).replace(',', '');
}
