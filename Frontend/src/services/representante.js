// Datos del entorno del representante de asociación. Todo pasa por la API privada (con token); el
// backend limita cada consulta a la asociación del usuario, así que aquí no se filtra por
// seguridad, solo por presentación.
import { api, pedir } from './apiInterna.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esId = (id) => typeof id === 'string' && UUID.test(id);

const enc = encodeURIComponent;
const datos = (promesa) => promesa.then((r) => r.data);

/* Perfil y asociación ------------------------------------------------------------------------ */
export const miPerfil = (opciones) => datos(api.get('/users/me', opciones));
export const obtenerAsociacion = (id, opciones) => datos(api.get(`/associations/${enc(id)}`, opciones));
export const actualizarAsociacion = (id, cambios) => datos(api.patch(`/associations/${enc(id)}`, cambios));
export const agregarCargo = (asociacionId, cargo) => datos(api.post(`/associations/${enc(asociacionId)}/board`, cargo));
export const editarCargo = (cargoId, cambios) => datos(api.patch(`/associations/board/${enc(cargoId)}`, cambios));
export const terminarCargo = (cargoId) => datos(api.del(`/associations/board/${enc(cargoId)}`));

/* Catálogos ---------------------------------------------------------------------------------- */
const catalogos = new Map();
/**
 * Valores activos de un catálogo (se guardan mientras dure la página).
 * La solicitud se comparte entre pantallas, así que NO usa la señal de cancelación de quien la
 * pidió primero: si esa pantalla se desmonta (o React monta dos veces en desarrollo), cancelarla
 * dejaría a las demás esperando para siempre.
 */
// eslint-disable-next-line no-unused-vars
export function valoresCatalogo(nombre, _opciones) {
  if (!catalogos.has(nombre)) {
    const promesa = datos(api.get(`/catalogs/${enc(nombre)}/values`)).catch((e) => {
      catalogos.delete(nombre);
      throw e;
    });
    catalogos.set(nombre, promesa);
  }
  return catalogos.get(nombre);
}

/* Equipos ------------------------------------------------------------------------------------ */
export const listarEquipos = (opciones) => datos(api.get('/teams', opciones));
export const obtenerEquipo = (id, opciones) => datos(api.get(`/teams/${enc(id)}`, opciones));
export const crearEquipo = (equipo) => datos(api.post('/teams', equipo));
export const actualizarEquipo = (id, cambios) => datos(api.patch(`/teams/${enc(id)}`, cambios));
export const nominaEquipo = (id, opciones) => datos(api.get(`/teams/${enc(id)}/members`, opciones));
export const agregarIntegrante = (equipoId, integrante) => datos(api.post(`/teams/${enc(equipoId)}/members`, integrante));
export const darDeBaja = (integranteId) => datos(api.del(`/teams/members/${enc(integranteId)}`));

/* Personas ----------------------------------------------------------------------------------- */
export function listarPersonas({ q, rol, asociacion } = {}, opciones) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (rol) p.set('role', rol);
  if (asociacion) p.set('association_id', asociacion);
  const qs = p.toString();
  return pedir(`/persons${qs ? `?${qs}` : ''}`, opciones);
}
export const obtenerPersona = (id, opciones) => datos(api.get(`/persons/${enc(id)}`, opciones));
export const crearPersona = (persona) => datos(api.post('/persons', persona));
export const actualizarPersona = (id, cambios) => datos(api.patch(`/persons/${enc(id)}`, cambios));

/* Documentos --------------------------------------------------------------------------------- */
export function listarDocumentos(filtros = {}, opciones) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) p.set(k, v);
  const qs = p.toString();
  return datos(api.get(`/documents${qs ? `?${qs}` : ''}`, opciones));
}

/**
 * Sube un documento. `titular` es { person_id } | { team_id } | { association_id }.
 * @param {{ archivo: File, tipo: string, titular: object, emision?: string, vencimiento?: string }} d
 */
export function subirDocumento({ archivo, tipo, titular, emision, vencimiento }) {
  const f = new FormData();
  f.append('document_type_code', tipo);
  for (const [k, v] of Object.entries(titular)) if (v) f.append(k, v);
  if (emision) f.append('issue_date', emision);
  if (vencimiento) f.append('expiry_date', vencimiento);
  f.append('archivo', archivo);
  return datos(pedir('/documents', { method: 'POST', body: f, timeoutMs: 60_000 }));
}

/**
 * Abre el archivo de un documento con un enlace firmado de corta duración. La pestaña se abre en
 * el mismo clic (si no, el navegador la bloquea) y recibe el enlace cuando el backend responde.
 */
export async function abrirDocumento(id) {
  const ventana = window.open('', '_blank');
  if (ventana) {
    ventana.opener = null;
    ventana.document.title = 'Abriendo documento…';
    ventana.document.body.style.font = '16px system-ui, sans-serif';
    ventana.document.body.textContent = 'Abriendo documento…';
  }
  try {
    const { url } = await datos(api.get(`/documents/${enc(id)}/archivo`));
    // Solo enlaces https (los firma Supabase): nunca se navega a otro esquema.
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('El enlace del documento no es válido.');
    if (ventana) ventana.location.replace(url);
    else window.location.assign(url);
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

/* Reglas de presentación --------------------------------------------------------------------- */
export const MAXIMO_MB = 10;
export const FORMATOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const DIA = 86_400_000;
/** Días que faltan para una fecha AAAA-MM-DD (negativo si ya pasó), o null. */
export function diasHasta(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - hoy) / DIA);
}

/** Estado de un documento para mostrar, con los días de aviso antes del vencimiento. */
export function estadoDocumento(doc, diasAviso = 30) {
  const dias = diasHasta(doc.expiry_date);
  if (doc.status === 'RECHAZADO') return { clave: 'rechazado', texto: 'Rechazado', tono: 'error' };
  if (doc.status === 'VENCIDO' || (dias !== null && dias < 0)) return { clave: 'vencido', texto: 'Vencido', tono: 'error' };
  if (doc.status === 'EN_REVISION') return { clave: 'revision', texto: 'En revisión', tono: 'neutro' };
  if (dias !== null && dias <= diasAviso) return { clave: 'por-vencer', texto: 'Por vencer', tono: 'aviso' };
  return { clave: 'vigente', texto: 'Vigente', tono: 'ok' };
}

export const nombrePersona = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

export const ROLES_PERSONA = {
  JUGADOR: 'Atleta',
  TECNICO: 'Cuerpo técnico',
  ARBITRO: 'Árbitro',
  OFICIAL: 'Oficial'
};

export const ESTADOS_EQUIPO = {
  ACTIVO: { texto: 'Activo', tono: 'ok' },
  INACTIVO: { texto: 'Inactivo', tono: 'neutro' }
};

export const PROVINCIAS = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'];

// Tipos de documento que sirven como identificación de una persona.
export const TIPOS_IDENTIFICACION = ['CED', 'DIMEX', 'PAS'];

/** Revisa el formato del número de identificación según el tipo. Devuelve un mensaje o null. */
export function revisarIdentificacion(tipo, numero) {
  const n = normalizarIdentificacion(tipo, numero);
  if (!n) return 'Escriba el número de identificación.';
  if (tipo === 'CED' && !/^\d-\d{4}-\d{4}$/.test(n)) return 'La cédula tiene 9 dígitos, por ejemplo 1-2345-6789 o 123456789.';
  if (tipo === 'DIMEX' && !/^\d{11,12}$/.test(n)) return 'El DIMEX tiene 11 o 12 dígitos.';
  if (tipo === 'PAS' && !/^[A-Z0-9]{5,20}$/.test(n)) return 'El pasaporte tiene entre 5 y 20 letras o números.';
  return null;
}

/**
 * Deja el número de identificación en el formato con que se guarda, sin importar cómo se
 * escribió: la cédula como 1-2345-6789 (con o sin guiones, espacios o puntos), el DIMEX solo con
 * dígitos y el pasaporte en mayúsculas sin espacios.
 */
export function normalizarIdentificacion(tipo, numero) {
  const texto = String(numero || '').trim();
  if (tipo === 'CED') {
    const d = texto.replace(/\D/g, '');
    return d.length === 9 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5)}` : texto;
  }
  if (tipo === 'DIMEX') return texto.replace(/\D/g, '');
  if (tipo === 'PAS') return texto.replace(/[\s-]/g, '').toUpperCase();
  return texto;
}

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * ¿La persona coincide con la búsqueda? Busca por nombre (sin importar tildes) y por
 * identificación, con o sin guiones: "111111111" encuentra a "1-1111-1111".
 */
export function coincidePersona(persona, busqueda) {
  const q = sinTildes(String(busqueda || '').trim());
  if (!q) return true;
  if (sinTildes(`${persona.first_name || ''} ${persona.last_name || ''} ${persona.document_number || ''}`).includes(q)) return true;
  const digitos = q.replace(/\D/g, '');
  return digitos.length >= 3 && String(persona.document_number || '').replace(/\D/g, '').includes(digitos);
}

export const correoValido = (c) => !c || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
