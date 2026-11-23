// Fuente de datos de Incidentes y sanciones. Solo peticiones a la API (/api/incidents).
import { consulta, crearClienteAdmin } from '../../../services/apiAdmin.js';

const pedir = crearClienteAdmin('/api/incidents');
const id = (v) => encodeURIComponent(v);

// ---------- lecturas ----------
export const obtenerResumen = () => pedir('/summary');
export const obtenerOpciones = () => pedir('/options');
export const listarExpedientes = ({ tipo, estado, competencia, busqueda, pagina }) =>
  pedir(`/${consulta({ tipo, estado, competencia, q: busqueda, page: pagina })}`);
export const obtenerExpediente = (casoId) => pedir(`/${id(casoId)}`);
export const listarPartidos = (competenciaId) => pedir(`/matches${consulta({ competition_id: competenciaId })}`);
export const buscarPersonas = (q) => pedir(`/persons${consulta({ q })}`);
export const listarFaltas = () => pedir('/infractions');
export const vistaPreviaSancion = (casoId, s) =>
  pedir(`/${id(casoId)}/sanction-preview${consulta({ party_id: s.party_id, infraction_id: s.infraction_id, sanction_type: s.sanction_type, quantity: s.quantity })}`);

// ---------- escrituras ----------
export async function subirArchivo(archivo) {
  const { path } = await pedir('/files', { metodo: 'POST', cuerpo: archivo });
  return { path, name: archivo.name };
}
export const abrirExpediente = (datos) => pedir('', { metodo: 'POST', cuerpo: datos });
export const guardarFalta = (faltaId, datos) =>
  faltaId ? pedir(`/infractions/${id(faltaId)}`, { metodo: 'PATCH', cuerpo: datos }) : pedir('/infractions', { metodo: 'POST', cuerpo: datos });
export const guardarPropuesta = (casoId, datos) => pedir(`/${id(casoId)}/proposal`, { metodo: 'PATCH', cuerpo: datos });
export const aplicarSancion = (casoId, datos) => pedir(`/${id(casoId)}/sanctions`, { metodo: 'POST', cuerpo: datos });
export const anularSancion = (casoId, sancionId, motivo) =>
  pedir(`/${id(casoId)}/sanctions/${id(sancionId)}/annul`, { metodo: 'POST', cuerpo: { reason: motivo } });
export const archivarExpediente = (casoId, motivo) => pedir(`/${id(casoId)}/archive`, { metodo: 'POST', cuerpo: { reason: motivo } });
export const agregarDocumento = (casoId, datos) => pedir(`/${id(casoId)}/documents`, { metodo: 'POST', cuerpo: datos });
export const reemplazarDocumento = (casoId, docId, file) =>
  pedir(`/${id(casoId)}/documents/${id(docId)}`, { metodo: 'PATCH', cuerpo: { file } });

// ---------- textos compartidos ----------
export const ESTADO_EXPEDIENTE = {
  ABIERTO: { texto: 'Abierto', clase: 'badge-status--abierto' },
  EN_SEGUIMIENTO: { texto: 'En seguimiento', clase: 'badge-status--seguimiento' },
  CON_SANCION: { texto: 'Con sanción', clase: 'badge-status--sancion' },
  RESUELTO: { texto: 'Resuelto', clase: 'badge-status--activa' },
  ARCHIVADO: { texto: 'Archivado', clase: 'badge-status--inactivo' }
};

export const GRAVEDAD = {
  LEVE: { texto: 'Leve', clase: 'inc-gravedad--leve' },
  GRAVE: { texto: 'Grave', clase: 'inc-gravedad--grave' },
  MUY_GRAVE: { texto: 'Muy grave', clase: 'inc-gravedad--muy-grave' }
};

export const APLICA = { PERSONA: 'Persona', EQUIPO: 'Equipo', SEDE: 'Sede' };
export const ROLES = { DENUNCIANTE: 'Denunciante', DENUNCIADO: 'Denunciado', INVOLUCRADO: 'Involucrado', TESTIGO: 'Testigo' };

// Escala de sanciones (mismo orden que el Backend) y qué tipo de involucrado admite cada una.
export const TIPOS_SANCION = [
  { codigo: 'AMONESTACION', nombre: 'Amonestación', unidad: null, aplica: ['PERSONA', 'EQUIPO', 'SEDE'] },
  { codigo: 'MULTA', nombre: 'Multa', unidad: 'colones', aplica: ['PERSONA', 'EQUIPO', 'SEDE'] },
  { codigo: 'SUSPENSION_PARTIDOS', nombre: 'Suspensión por partidos', unidad: 'partidos', aplica: ['PERSONA'] },
  { codigo: 'SUSPENSION_MESES', nombre: 'Suspensión por meses', unidad: 'meses', aplica: ['PERSONA'] },
  { codigo: 'PERDIDA_PARTIDO', nombre: 'Pérdida del partido', unidad: null, aplica: ['EQUIPO'] },
  { codigo: 'PERDIDA_PUNTOS', nombre: 'Pérdida del partido y puntos', unidad: 'puntos', aplica: ['EQUIPO'] },
  { codigo: 'SUSPENSION_SEDE', nombre: 'Suspensión de la sede', unidad: null, aplica: ['SEDE'] },
  { codigo: 'EXPULSION', nombre: 'Expulsión', unidad: null, aplica: ['PERSONA', 'EQUIPO'] }
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const enCR = (iso) => {
  const f = new Date(iso);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(f).map((p) => [p.type, p.value])
  );
  return { a: partes.year, m: Number(partes.month), d: Number(partes.day), h: partes.hour === '24' ? '00' : partes.hour, min: partes.minute };
};

/** '12 set · 09:30' */
export function diaHora(iso) {
  if (!iso) return '—';
  const p = enCR(iso);
  return `${p.d} ${MESES[p.m - 1]} · ${p.h}:${p.min}`;
}

/** '12 set 2026 · 09:30' */
export function fechaHoraLarga(iso) {
  if (!iso) return '—';
  const p = enCR(iso);
  return `${p.d} ${MESES[p.m - 1]} ${p.a} · ${p.h}:${p.min}`;
}

/** '2026-09-11' → '11 set 2026' */
export function fechaLarga(fecha) {
  if (!fecha) return '—';
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Valor actual para un <input type="datetime-local"> en hora de Costa Rica. */
export function ahoraLocal() {
  const p = enCR(new Date().toISOString());
  return `${p.a}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}T${p.h}:${p.min}`;
}
