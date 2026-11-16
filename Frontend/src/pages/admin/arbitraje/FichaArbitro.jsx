import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../AdminCommon.css';
import './Arbitraje.css';
import {
  ESTADO_ACREDITACION,
  MODALIDADES,
  RESULTADO_CURSO,
  diaMes,
  fechaCorta,
  mesAnio,
  obtenerFicha
} from './arbitrajeDatos.js';

const CLASE_ACTA = { VALIDADA: 'badge-status--activa', ENVIADA: 'badge-status--por-vencer', BORRADOR: 'badge-status--pendiente' };

function resultadoCurso(c) {
  const texto = RESULTADO_CURSO[c.resultado] || c.resultado;
  return c.nota !== null && c.resultado !== 'AUSENTE' ? `${texto} · ${c.nota}` : texto;
}

export default function FichaArbitro() {
  const { id } = useParams();
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    setFicha(null);
    setError('');
    obtenerFicha(id)
      .then((f) => !cancelado && setFicha(f))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <p className="arb-migas"><Link to="/admin/arbitraje">Arbitraje</Link> › Ficha</p>
        <p className="arb-error" role="alert">{error}</p>
      </div>
    );
  }
  if (!ficha) return <p className="arb-vacio">Cargando ficha…</p>;

  const { persona: p, acreditacion: a } = ficha;
  const estado = ESTADO_ACREDITACION[a.estado];
  const activa = a.registro === 'ACTIVA';
  const modalidad = MODALIDADES.find((m) => m.codigo === a.modalidad)?.nombre || a.modalidad;

  return (
    <div>
      <p className="arb-migas"><Link to="/admin/arbitraje">Arbitraje</Link> › {p.nombre}</p>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>{p.nombre}</h1>
          <p className="admin-page-header__subtitle">
            {a.funcion?.value} · {a.nivel?.value} · {p.cedula}
          </p>
          <div className="arb-pildoras">
            {activa ? (
              <span className={`badge-status ${estado.clase}`}>{estado.texto}</span>
            ) : (
              <span className="badge-status badge-status--inactivo">Sin acreditación activa</span>
            )}
            <span className="arb-pildora">{a.estado === 'VENCIDA' ? 'Venció' : 'Vence'} {fechaCorta(a.vence)}</span>
            <span className="arb-pildora">
              {ficha.partidos.length} {ficha.partidos.length === 1 ? 'partido' : 'partidos'} esta temporada
            </span>
          </div>
        </div>
        <div className="admin-page-header__actions">
          {activa && (
            <Link to={`/admin/arbitraje/${p.id}/editar`} className="admin-btn admin-btn--secondary">Editar</Link>
          )}
          <Link to={`/admin/arbitraje/acreditar?persona=${p.id}`} className="admin-btn admin-btn--primary">
            Renovar acreditación
          </Link>
        </div>
      </div>

      <div className="arb-layout">
        <div className="arb-columna">
          <section className="arb-card">
            <div className="arb-card__header">
              <h2 className="arb-card__titulo">Partidos dirigidos</h2>
              <p className="arb-card__subtitulo">Temporada {ficha.temporada}</p>
            </div>
            <div className="arb-tabla-interna arb-tabla-scroll" style={{ paddingTop: 18 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Partido</th>
                    <th>Competencia</th>
                    <th>Función</th>
                    <th>Acta</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.partidos.map((m) => (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{diaMes(m.fecha)}</td>
                      <td>{m.partido}</td>
                      <td>{m.competencia}</td>
                      <td>{m.funcion}</td>
                      <td>
                        <span className={`badge-status ${CLASE_ACTA[m.acta] || 'badge-status--pendiente'}`}>{m.acta}</span>
                      </td>
                    </tr>
                  ))}
                  {ficha.partidos.length === 0 && (
                    <tr><td colSpan={5} className="arb-vacio">No tiene partidos designados esta temporada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="arb-card">
            <div className="arb-card__header"><h2 className="arb-card__titulo">Cursos y evaluaciones</h2></div>
            <div className="arb-tabla-interna" style={{ paddingTop: 18 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Curso o evaluación</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.cursos.map((c) => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{mesAnio(c.fecha)}</td>
                      <td>{c.nombre}</td>
                      <td>{resultadoCurso(c)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{mesAnio(a.vigenteDesde)}</td>
                    <td>Evaluación práctica y prueba física</td>
                    <td>
                      {a.evaluacionPractica === 'APROBADA' && a.pruebaFisica === 'APROBADA'
                        ? 'Aprobadas'
                        : `Práctica: ${a.evaluacionPractica.toLowerCase()} · Física: ${a.pruebaFisica.toLowerCase()}`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="arb-lateral">
          <section className="arb-lateral__card">
            <div className="arb-lateral__header"><h2 className="arb-lateral__titulo">Datos personales</h2></div>
            <ul className="arb-datos arb-datos--tarjeta">
              <li>Identificación <strong>{p.cedula}</strong></li>
              <li>Provincia <strong>{p.provincia || '—'}</strong></li>
              <li>Asociación <strong>{p.asociacion || '—'}</strong></li>
              <li>Correo <strong>{p.correo || '—'}</strong></li>
              <li>Teléfono <strong>{p.telefono || '—'}</strong></li>
              <li>Desde <strong>{p.desde}</strong></li>
            </ul>
          </section>

          <section className="arb-lateral__card">
            <div className="arb-lateral__header"><h2 className="arb-lateral__titulo">Acreditación</h2></div>
            <ul className="arb-datos arb-datos--tarjeta">
              <li>Función <strong>{a.funcion?.value || '—'}</strong></li>
              <li>Nivel <strong>{a.nivel?.value || '—'}</strong></li>
              <li>Categoría <strong>{a.categoria?.value || 'Todas'}</strong></li>
              <li>Modalidades <strong>{modalidad}</strong></li>
              <li>Vigencia <strong>{fechaCorta(a.vigenteDesde)} al {fechaCorta(a.vence)}</strong></li>
              <li>
                Certificado
                <strong>
                  {a.certificado?.url
                    ? <a className="arb-documento" href={a.certificado.url} target="_blank" rel="noreferrer">Ver</a>
                    : a.certificado ? 'Cargado' : '—'}
                </strong>
              </li>
              <li>
                Constancia médica
                <strong>
                  {a.constancia?.url
                    ? <a className="arb-documento" href={a.constancia.url} target="_blank" rel="noreferrer">Ver</a>
                    : a.constancia ? 'Cargada' : '—'}
                </strong>
              </li>
            </ul>
          </section>

          {ficha.historial.length > 1 && (
            <section className="arb-lateral__card">
              <div className="arb-lateral__header"><h2 className="arb-lateral__titulo">Acreditaciones anteriores</h2></div>
              <ul className="arb-datos arb-datos--tarjeta">
                {ficha.historial.filter((h) => h.id !== a.id).map((h) => (
                  <li key={h.id}>{fechaCorta(h.desde)} al {fechaCorta(h.vence)} <strong>{h.registro.toLowerCase()}</strong></li>
                ))}
              </ul>
            </section>
          )}

          <section className="arb-lateral__card">
            <div className="arb-lateral__header"><h2 className="arb-lateral__titulo">Incidentes</h2></div>
            <p className="arb-lateral__vacio">El registro de incidentes disciplinarios todavía no está disponible.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
