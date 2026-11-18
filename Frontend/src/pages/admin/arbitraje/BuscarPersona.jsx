// Buscador de personas del padrón federativo (nombre o cédula). Lo usan Acreditar árbitro,
// Programar curso (instructor) y la inscripción a un curso.
import { useEffect, useId, useState } from 'react';
import useCarga from '../../../hooks/useCarga.js';
import { listarPersonasFecovol } from '../../../services/administracion.js';
import { nombrePersona } from '../../../services/representante.js';

function useDemorado(valor, ms = 350) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

/**
 * @param {object} props
 * @param {string} props.etiqueta
 * @param {(persona: object) => void} props.onElegir
 * @param {string} [props.rol]  Filtra por rol en el padrón (por ejemplo, ARBITRO).
 * @param {string} [props.textoBoton]
 * @param {string[]} [props.excluir]  Ids que no se ofrecen (por ejemplo, ya inscritos).
 */
export default function BuscarPersona({ etiqueta, onElegir, rol, textoBoton = 'Elegir', excluir = [], autoFocus }) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const q = useDemorado(texto.trim());
  const buscar = q.length >= 2;

  const resultados = useCarga(
    (signal) => (buscar ? listarPersonasFecovol({ q, role: rol, status: 'ACTIVA' }, { signal }) : Promise.resolve(null)),
    [q, rol, buscar]
  );
  const lista = (resultados.datos?.data || []).filter((p) => !excluir.includes(p.id)).slice(0, 8);

  return (
    <div className="g-campo">
      <label htmlFor={id} className="g-campo__etiqueta">{etiqueta}</label>
      <input
        id={id}
        type="search"
        className="g-control"
        placeholder="Nombre o cédula…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={80}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <div aria-live="polite">
        {buscar && resultados.estado === 'cargando' && <p className="g-campo__ayuda">Buscando…</p>}
        {buscar && resultados.estado === 'error' && <p className="g-campo__error">{resultados.error.message}</p>}
        {buscar && resultados.estado === 'listo' && (lista.length === 0 ? (
          <p className="g-campo__ayuda">No hay personas activas en el padrón que coincidan. Regístrela primero en Personas federadas.</p>
        ) : (
          <ul className="g-resultados">
            {lista.map((p) => (
              <li key={p.id} className="g-resultado">
                <div>
                  <p className="g-resultado__nombre">{nombrePersona(p)}</p>
                  <p className="g-resultado__detalle">
                    {[p.document_number, p.asociacion?.short_name || p.asociacion?.name || 'Sin asociación', p.province].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" className="g-boton g-boton--chico" onClick={() => { onElegir(p); setTexto(''); }}>
                  {textoBoton}<span className="visualmente-oculto"> a {nombrePersona(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
