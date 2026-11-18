// Cursos de arbitraje: lista con estado e inscritos.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Encabezado, Estado } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { ESTADOS_CURSO, FORMATOS_CURSO, listarCursos, TIPOS_CURSO } from '../../../services/arbitraje.js';
import { rangoFechas } from '../../../utils/formato.js';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

export default function Cursos() {
  const [estado, setEstado] = useState('');
  const cursos = useCarga((signal) => listarCursos({ estado }, { signal }), [estado]);

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Cursos de arbitraje"
        bajada="Formación, actualización anual y ascenso de nivel."
        acciones={(
          <>
            <Link to={RUTA.inicio} className="g-boton">Volver a Arbitraje</Link>
            <Link to={RUTA.nuevoCurso} className="g-boton g-boton--primario">Programar curso</Link>
          </>
        )}
      />

      <div className="g-filtros">
        <label className="visualmente-oculto" htmlFor="cursos-estado">Estado</label>
        <select id="cursos-estado" className="g-control" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Estado: todos</option>
          {Object.entries(ESTADOS_CURSO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
      </div>

      <section className="g-tarjeta" aria-label="Cursos" aria-busy={cursos.estado === 'cargando'}>
        {cursos.estado === 'cargando' && <Cargando texto="Cargando cursos…" />}
        {cursos.estado === 'error' && <ErrorCarga mensaje={cursos.error.message} onReintentar={cursos.reintentar} />}
        {cursos.estado === 'listo' && (cursos.datos.length === 0 ? (
          <p className="g-tarjeta__vacio">No hay cursos {estado ? 'con ese estado' : 'registrados'}.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Cursos de arbitraje</caption>
              <thead>
                <tr>
                  <th scope="col">Curso</th>
                  <th scope="col">Fechas</th>
                  <th scope="col">Formato</th>
                  <th scope="col">Inscritos</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {cursos.datos.map((c) => {
                  const e = ESTADOS_CURSO[c.status] || ESTADOS_CURSO.PUBLICADO;
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.name}<span className="g-tabla__sub">{TIPOS_CURSO[c.course_type]?.texto}</span></th>
                      <td className="g-tabla__fecha">{rangoFechas(c.start_date, c.end_date)}</td>
                      <td>{[FORMATOS_CURSO[c.format], c.venue].filter(Boolean).join(' · ')}</td>
                      <td>{c.capacity ? `${c.inscritos} de ${c.capacity}` : c.inscritos}</td>
                      <td><Estado tono={e.tono}>{e.texto}</Estado></td>
                      <td className="g-tabla__accion">
                        <Link to={RUTA.curso(c.id)} className="g-boton g-boton--chico">Abrir<span className="visualmente-oculto"> {c.name}</span></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
