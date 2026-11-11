import { useCallback, useEffect, useRef, useState } from 'react';

// Memoria de corta duración para datos que varias vistas piden igual (por ejemplo, los partidos
// de una competencia los usan las pestañas Posiciones, Calendario y Resultados). Si una vista ya
// los cargó hace menos de un minuto, la siguiente los muestra al instante, sin pasar por
// "Cargando…": así cambiar de pestaña no hace saltar la página. La API pública también responde
// con max-age=60, así que no se muestra nada más viejo de lo que ya permitiría el navegador.
const VIGENCIA_MS = 60_000;
const memoria = new Map(); // clave -> { datos, hora }

function leer(clave) {
  if (!clave) return null;
  const entrada = memoria.get(clave);
  if (!entrada) return null;
  if (Date.now() - entrada.hora > VIGENCIA_MS) {
    memoria.delete(clave);
    return null;
  }
  return entrada;
}

function guardar(clave, datos) {
  if (clave) memoria.set(clave, { datos, hora: Date.now() });
}

/**
 * Carga datos en segundo plano para que estén listos cuando se abra la vista que los usa.
 * Los errores se ignoran: la vista los volverá a pedir y mostrará el error ahí.
 * @param {string} clave
 * @param {() => Promise<unknown>} cargar
 */
export function precargar(clave, cargar) {
  if (leer(clave)) return;
  cargar()
    .then((datos) => guardar(clave, datos))
    .catch(() => {});
}

/**
 * Ejecuta una carga asíncrona y expone su estado.
 *
 * - Cancela la solicitud anterior si cambian las dependencias o el componente se desmonta, así una
 *   respuesta vieja nunca pisa a una nueva.
 * - `reintentar()` vuelve a ejecutar la carga (para el botón "Intentar de nuevo").
 * - Con `opciones.clave`, guarda el resultado por un minuto y lo reutiliza (ver arriba).
 *
 * @param {(signal: AbortSignal) => Promise<T>} cargar
 * @param {unknown[]} dependencias
 * @param {{ clave?: string }} [opciones]
 * @returns {{ estado: 'cargando' | 'listo' | 'error', datos: T | null, error: Error | null, reintentar: () => void }}
 */
export default function useCarga(cargar, dependencias, { clave } = {}) {
  const [resultado, setResultado] = useState(() => {
    const enMemoria = leer(clave);
    return enMemoria
      ? { estado: 'listo', datos: enMemoria.datos, error: null }
      : { estado: 'cargando', datos: null, error: null };
  });
  const [intento, setIntento] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    // Un reintento siempre va a la red; la primera carga usa la memoria si está vigente.
    const enMemoria = intento === 0 ? leer(clave) : null;
    if (enMemoria) {
      setResultado((r) => (r.datos === enMemoria.datos ? r : { estado: 'listo', datos: enMemoria.datos, error: null }));
      return undefined;
    }

    const control = new AbortController();
    setResultado((r) => (r.estado === 'cargando' ? r : { estado: 'cargando', datos: null, error: null }));

    cargarRef
      .current(control.signal)
      .then((datos) => {
        if (control.signal.aborted) return;
        guardar(clave, datos);
        setResultado({ estado: 'listo', datos, error: null });
      })
      .catch((error) => {
        // Solo se ignora si la cancelación es de esta carga. Una cancelación ajena (por ejemplo, de
        // una solicitud compartida) se muestra como error: si no, la vista quedaría en "Cargando…".
        if (control.signal.aborted) return;
        setResultado({ estado: 'error', datos: null, error });
      });

    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, clave, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...resultado, reintentar };
}
