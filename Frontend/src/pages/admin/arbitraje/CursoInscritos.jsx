import { useCallback, useEffect, useState } from 'react';
import BuscadorPadron from './BuscadorPadron.jsx';
import {
  RESULTADO_CURSO,
  TIPOS_CURSO,
  cargarNota,
  inscribirEnCurso,
  obtenerCurso,
  rangoCurso
} from './arbitrajeDatos.js';

const CLASE_RESULTADO = {
  INSCRITO: 'badge-status--pendiente',
  APROBADO: 'badge-status--activa',
  REPROBADO: 'badge-status--vencida',
  AUSENTE: 'badge-status--inactivo'
};

// Modal con los inscritos de un curso: inscribir personas y cargar las notas al cerrarlo.
export default function CursoInscritos({ cursoId, onCerrar, onCambio }) {
  const [curso, setCurso] = useState(null);
  const [error, setError] = useState('');
  const [notas, setNotas] = useState({});
  const [guardando, setGuardando] = useState(null);
  const [reinicioBuscador, setReinicioBuscador] = useState(0);

  const cargar = useCallback(() => {
    obtenerCurso(cursoId)
      .then((c) => {
        setCurso(c);
        setNotas(Object.fromEntries(c.inscritos.map((i) => [i.id, i.nota ?? ''])));
      })
      .catch((e) => setError(e.message));
  }, [cursoId]);

  useEffect(cargar, [cargar]);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  const inscribir = async (persona) => {
    setError('');
    try {
      await inscribirEnCurso(cursoId, persona.id);
      setReinicioBuscador((n) => n + 1);
      cargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const guardar = async (inscrito, cambios) => {
    setGuardando(inscrito.id);
    setError('');
    try {
      const r = await cargarNota(cursoId, inscrito.id, cambios);
      setCurso((c) => ({
        ...c,
        inscritos: c.inscritos.map((i) => (i.id === inscrito.id ? { ...i, nota: r.nota, resultado: r.resultado } : i))
      }));
      setNotas((n) => ({ ...n, [inscrito.id]: r.nota ?? '' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  };

  const alSalirDeNota = (inscrito) => {
    const valor = notas[inscrito.id];
    const anterior = inscrito.nota ?? '';
    if (String(valor) === String(anterior)) return;
    guardar(inscrito, { grade: valor === '' ? null : Number(valor) });
  };

  const lleno = curso?.cupo && curso.inscritos.length >= curso.cupo;

  return (
    <div className="admin-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="admin-modal admin-modal--wide" role="dialog" aria-modal="true" aria-labelledby="curso-inscritos-titulo">
        <div className="admin-modal__header">
          <h2 id="curso-inscritos-titulo" className="admin-modal__title">{curso ? curso.nombre : 'Curso'}</h2>
          <button type="button" className="admin-modal__close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div className="admin-modal__body">
          {!curso && !error && <p className="arb-vacio">Cargando curso…</p>}
          {error && <p className="arb-error" role="alert">{error}</p>}

          {curso && (
            <>
              <p className="arb-info-curso">
                <span><strong>{TIPOS_CURSO[curso.tipo]}</strong></span>
                <span>{rangoCurso(curso.inicio, curso.fin)}</span>
                {curso.sede && <span>{curso.sede}</span>}
                <span>Nota mínima: <strong>{curso.notaMinima}</strong></span>
                <span>Inscritos: <strong>{curso.inscritos.length}{curso.cupo ? ` de ${curso.cupo}` : ''}</strong></span>
                {curso.instructor && <span>Instructor: <strong>{curso.instructor}</strong></span>}
              </p>

              {curso.estado === 'PUBLICADO' && (
                <div className="arb-campo arb-inscribir">
                  <label className="arb-campo__etiqueta" htmlFor="curso-inscribir">Inscribir a una persona del padrón</label>
                  <BuscadorPadron
                    key={reinicioBuscador}
                    id="curso-inscribir"
                    deshabilitado={lleno}
                    placeholder={lleno ? 'El curso alcanzó su cupo' : 'Nombre o cédula…'}
                    onSeleccionar={inscribir}
                  />
                  {curso.soloVigentes && (
                    <span className="arb-campo__ayuda">Solo se admiten árbitros con acreditación vigente.</span>
                  )}
                </div>
              )}

              <div className="admin-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Nota</th>
                      <th>Resultado</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {curso.inscritos.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <div className="admin-table__user-cell">
                            <span className="admin-table__user-name">{i.nombre}</span>
                            <span className="admin-table__user-email">{i.cedula}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            className="arb-campo__input arb-nota"
                            aria-label={`Nota de ${i.nombre}`}
                            value={notas[i.id] ?? ''}
                            disabled={guardando === i.id}
                            onChange={(e) => setNotas((n) => ({ ...n, [i.id]: e.target.value }))}
                            onBlur={() => alSalirDeNota(i)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                        </td>
                        <td>
                          <span className={`badge-status ${CLASE_RESULTADO[i.resultado]}`}>{RESULTADO_CURSO[i.resultado]}</span>
                        </td>
                        <td className="arb-tabla__accion">
                          {i.resultado !== 'AUSENTE' && (
                            <button
                              type="button"
                              className="admin-btn admin-btn--secondary arb-boton-chico"
                              disabled={guardando === i.id}
                              onClick={() => guardar(i, { result: 'AUSENTE' })}
                            >
                              Marcar ausente
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {curso.inscritos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="arb-vacio">Todavía no hay personas inscritas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="admin-modal__footer">
          <button type="button" className="admin-btn admin-btn--secondary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
