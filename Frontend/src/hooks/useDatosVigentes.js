import { useRef } from 'react';

/**
 * Datos de una carga (useCarga) que se mantienen mientras se recarga: después de guardar algo, la
 * pantalla vuelve a pedir los datos sin desmontarse ni mostrar «Cargando…» otra vez.
 * `clave` identifica qué se está mostrando (por ejemplo, el id): si cambia, no se reutiliza nada.
 * @param {{ estado: string, datos: any }} carga
 * @param {unknown} [clave]
 */
export default function useDatosVigentes(carga, clave = null) {
  const ref = useRef({ clave: undefined, datos: null });
  if (carga.datos) {
    ref.current = { clave, datos: carga.datos };
    return carga.datos;
  }
  return carga.estado === 'cargando' && ref.current.clave === clave ? ref.current.datos : null;
}
