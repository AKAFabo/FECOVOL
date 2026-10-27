import { useCallback, useEffect, useRef, useState } from 'react';
import { esCancelacion } from '../services/apiPublica.js';

/**
 * Ejecuta una carga asíncrona y expone su estado.
 *
 * - Cancela la solicitud anterior si cambian las dependencias o el componente se desmonta, así una
 *   respuesta vieja nunca pisa a una nueva.
 * - `reintentar()` vuelve a ejecutar la carga (para el botón "Intentar de nuevo").
 *
 * @param {(signal: AbortSignal) => Promise<T>} cargar
 * @param {unknown[]} dependencias
 * @returns {{ estado: 'cargando' | 'listo' | 'error', datos: T | null, error: Error | null, reintentar: () => void }}
 */
export default function useCarga(cargar, dependencias) {
  const [resultado, setResultado] = useState({ estado: 'cargando', datos: null, error: null });
  const [intento, setIntento] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    const control = new AbortController();
    setResultado((r) => (r.estado === 'cargando' ? r : { estado: 'cargando', datos: null, error: null }));

    cargarRef
      .current(control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setResultado({ estado: 'listo', datos, error: null });
      })
      .catch((error) => {
        if (control.signal.aborted || esCancelacion(error)) return;
        setResultado({ estado: 'error', datos: null, error });
      });

    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...resultado, reintentar };
}
