// Selecciones nacionales en la administración de FECOVOL. Los permisos los decide el backend.
import { api } from './apiInterna.js';

const enc = encodeURIComponent;
const datos = (promesa) => promesa.then((r) => r.data);

export const resumenSelecciones = (opciones) => datos(api.get('/national-teams', opciones));
export const crearSeleccion = (s) => datos(api.post('/national-teams', s));
export const editarSeleccion = (id, s) => datos(api.patch(`/national-teams/${enc(id)}`, s));
export const crearEvento = (e) => datos(api.post('/national-teams/eventos', e));
export const editarEvento = (id, e) => datos(api.patch(`/national-teams/eventos/${enc(id)}`, e));
export const obtenerConvocatoria = (id, opciones) => datos(api.get(`/national-teams/convocatorias/${enc(id)}`, opciones));
export const crearConvocatoria = (c) => datos(api.post('/national-teams/convocatorias', c));
export const editarConvocatoria = (id, c) => datos(api.patch(`/national-teams/convocatorias/${enc(id)}`, c));
export const agregarConvocado = (id, m) => datos(api.post(`/national-teams/convocatorias/${enc(id)}/integrantes`, m));
export const quitarConvocado = (id, miembroId) => datos(api.del(`/national-teams/convocatorias/${enc(id)}/integrantes/${enc(miembroId)}`));

export const MODALIDADES = { SALA: 'Sala', PLAYA: 'Playa' };
export const ESTADOS_CONVOCATORIA = {
  BORRADOR: { texto: 'Borrador', tono: 'aviso' },
  PUBLICADA: { texto: 'Publicada', tono: 'ok' },
  ARCHIVADA: { texto: 'Archivada', tono: 'neutro' }
};
export const ESTADOS_EVENTO = {
  PROGRAMADO: { texto: 'Programado', tono: 'info' },
  FINALIZADO: { texto: 'Finalizado', tono: 'neutro' },
  CANCELADO: { texto: 'Cancelado', tono: 'error' }
};
export const rutaConvocatoria = (id) => `/admin/selecciones/convocatorias/${enc(id)}`;
