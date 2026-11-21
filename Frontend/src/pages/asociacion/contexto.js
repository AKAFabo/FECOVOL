import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

// Rutas de las pantallas de gestión. Algunas pantallas (detalle y edición de equipo, agregar
// persona) se usan tanto en el entorno del representante como en el de FECOVOL: cada entorno
// pasa sus rutas por el contexto del Outlet y las pantallas las leen con useRutas().
export const RUTA = {
  panel: '/asociacion',
  equipos: '/asociacion/equipos',
  equipo: (id) => `/asociacion/equipos/${id}`,
  editarEquipo: (id) => `/asociacion/equipos/${id}/editar`,
  nuevoEquipo: '/asociacion/equipos/nuevo',
  personas: '/asociacion/personas',
  persona: (id) => `/asociacion/personas/${id}`,
  nuevaPersona: '/asociacion/personas/nueva',
  documentos: '/asociacion/documentos',
  inscripciones: '/asociacion/inscripciones',
  participacion: (competenciaId, equipoId) => `/asociacion/inscripciones/${competenciaId}/equipos/${equipoId}`,
  calendario: '/asociacion/calendario',
  reportes: '/asociacion/reportes',
  miAsociacion: '/asociacion/mi-asociacion'
};

export const RUTA_ADMIN = {
  panel: '/admin/panel',
  equipos: '/admin/asociaciones',
  asociaciones: '/admin/asociaciones',
  asociacion: (id) => `/admin/asociaciones/${id}`,
  afiliar: '/admin/asociaciones/afiliar',
  equipo: (id) => `/admin/equipos/${id}`,
  editarEquipo: (id) => `/admin/equipos/${id}/editar`,
  nuevoEquipo: '/admin/equipos/nuevo',
  personas: '/admin/personas',
  persona: (id) => `/admin/personas/${id}`,
  nuevaPersona: '/admin/personas/nueva',
  documentos: '/admin/documentos'
};

/**
 * Datos del entorno (los pone el layout) y migas de la barra superior. Fuera del entorno del
 * representante (por ejemplo, en Administración) no hay asociación propia ni migas.
 * @param {{ texto: string, to?: string }[]} [migas]
 */
export function useAsociacion(migas) {
  const contexto = useOutletContext() || {};
  const ponerMigas = contexto.ponerMigas;
  const clave = JSON.stringify(migas || []);
  useEffect(() => {
    if (ponerMigas) ponerMigas(JSON.parse(clave));
  }, [clave, ponerMigas]);
  return { modo: 'representante', rutas: RUTA, ...contexto };
}

/** Rutas del entorno actual. */
export function useRutas() {
  return useOutletContext()?.rutas || RUTA;
}

/** ¿La pantalla se está usando desde Administración (FECOVOL)? */
export function useEsFecovol() {
  return useOutletContext()?.modo === 'admin';
}
