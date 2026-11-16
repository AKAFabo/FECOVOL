import { useEffect, useRef, useState } from 'react';
import { buscarEnPadron } from './arbitrajeDatos.js';

// Campo de búsqueda en el padrón federativo (nombre o cédula) con lista de resultados.
// onSeleccionar recibe { id, nombre, cedula, provincia, correo, asociacion, acreditacion }.
export default function BuscadorPadron({ id, valorInicial = '', onSeleccionar, placeholder = 'Nombre o cédula…', deshabilitado }) {
  const [texto, setTexto] = useState(valorInicial);
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState('inactivo'); // inactivo | buscando | listo | error
  const elegido = useRef(valorInicial);

  useEffect(() => {
    setTexto(valorInicial);
    elegido.current = valorInicial;
  }, [valorInicial]);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2 || q === elegido.current) {
      setResultados([]);
      setEstado('inactivo');
      return undefined;
    }
    let cancelado = false;
    setEstado('buscando');
    const espera = setTimeout(() => {
      buscarEnPadron(q)
        .then((lista) => {
          if (cancelado) return;
          setResultados(lista);
          setEstado('listo');
          setAbierto(true);
        })
        .catch(() => {
          if (!cancelado) setEstado('error');
        });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [texto]);

  const elegir = (persona) => {
    const etiqueta = `${persona.nombre} · ${persona.cedula}`;
    elegido.current = etiqueta;
    setTexto(etiqueta);
    setAbierto(false);
    onSeleccionar(persona);
  };

  return (
    <div className="arb-buscador">
      <input
        id={id}
        type="search"
        className="arb-campo__input"
        placeholder={placeholder}
        value={texto}
        disabled={deshabilitado}
        autoComplete="off"
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => resultados.length && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}
      />
      {abierto && estado !== 'inactivo' && (
        <ul className="arb-buscador__resultados" role="listbox">
          {estado === 'buscando' && <li className="arb-buscador__mensaje">Buscando…</li>}
          {estado === 'error' && <li className="arb-buscador__mensaje">No se pudo consultar el padrón.</li>}
          {estado === 'listo' && resultados.length === 0 && (
            <li className="arb-buscador__mensaje">
              No hay personas con ese nombre o cédula. Debe registrarse primero en Personas federadas.
            </li>
          )}
          {estado === 'listo' &&
            resultados.map((p) => (
              <li key={p.id}>
                <button type="button" className="arb-buscador__opcion" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(p)}>
                  <span className="arb-buscador__nombre">{p.nombre}</span>
                  <span className="arb-buscador__detalle">
                    {p.cedula}
                    {p.asociacion ? ` · ${p.asociacion}` : ''}
                    {p.acreditacion ? ' · ya acreditada' : ''}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
