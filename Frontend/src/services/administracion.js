// Datos de las pantallas de FECOVOL (Administración): asociaciones, personas y revisión de
// documentos. El backend exige el rol de FECOVOL para cada operación; aquí no se decide nada de
// permisos, solo se arman las solicitudes.
import { api, pedir } from './apiInterna.js';

const enc = encodeURIComponent;
const datos = (promesa) => promesa.then((r) => r.data);

function consulta(filtros) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/* Asociaciones ------------------------------------------------------------------------------- */
export const listarAsociaciones = (filtros, opciones) => datos(api.get(`/associations${consulta(filtros)}`, opciones));
export const crearAsociacion = (asociacion) => datos(api.post('/associations', asociacion));
export const listarEquiposDe = (asociacionId, opciones) => datos(api.get(`/teams${consulta({ association_id: asociacionId })}`, opciones));

/**
 * Cambia datos o estado de una asociación. Si se suspende o inactiva una asociación con equipos o
 * personas, el backend responde 409 y pide confirmar: se reintenta con confirm_deactivation.
 */
export const actualizarAsociacionFecovol = (id, cambios) => pedir(`/associations/${enc(id)}`, { method: 'PATCH', body: cambios });

/* Usuarios (invitar al representante) --------------------------------------------------------- */
export const listarRoles = (opciones) => datos(api.get('/roles', opciones));
export const invitarUsuario = (usuario) => datos(api.post('/users/invite', usuario));

/* Personas ----------------------------------------------------------------------------------- */
export function listarPersonasFecovol(filtros, opciones) {
  return pedir(`/persons${consulta(filtros)}`, opciones);
}
export const verificarPersona = (id) => datos(api.post(`/persons/${enc(id)}/verify`));
export const historialPersona = (id, opciones) => datos(api.get(`/persons/${enc(id)}/historial`, opciones));
export const cambiarRolPersona = (id, rol, activo) => datos(api.post(`/persons/${enc(id)}/roles`, { role_type: rol, is_active: activo }));
export const corregirPersona = (id, cambios) => datos(api.patch(`/persons/${enc(id)}`, cambios));

/* Documentos --------------------------------------------------------------------------------- */
/** Aprueba (VIGENTE), rechaza (RECHAZADO, con motivo) o marca como vencido un documento. */
export const revisarDocumento = (id, estado, notas) => datos(api.patch(`/documents/${enc(id)}/review`, { status: estado, notes: notas || undefined }));
export const vencerDocumentos = () => datos(api.post('/documents/expire'));

export const ESTADOS_ASOCIACION = {
  AFILIADA: { texto: 'Afiliada', tono: 'ok' },
  PROVISIONAL: { texto: 'Afiliación provisional', tono: 'aviso' },
  SUSPENDIDA: { texto: 'Suspendida', tono: 'error' },
  DESAFILIADA: { texto: 'Desafiliada', tono: 'neutro' }
};

export const resumenPadron = (opciones) => datos(api.get('/persons/resumen', opciones));
