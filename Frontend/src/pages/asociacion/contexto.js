import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * Datos del entorno del representante (los pone AsociacionLayout) y migas de la barra superior.
 * @param {{ texto: string, to?: string }[]} [migas]
 */
export function useAsociacion(migas) {
  const contexto = useOutletContext();
  const clave = JSON.stringify(migas || []);
  useEffect(() => {
    contexto.ponerMigas(JSON.parse(clave));
  }, [clave, contexto.ponerMigas]); // eslint-disable-line react-hooks/exhaustive-deps
  return contexto;
}

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
  miAsociacion: '/asociacion/mi-asociacion'
};
