// Inscripciones (Figma 04 · Inscripciones; RF-ASO-007): en qué competencias participan los equipos
// de la asociación, el estado de cada solicitud, su posición y su próximo partido. Solo consulta:
// la programación y los resultados los administra FECOVOL.
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { ESTADOS_INSCRIPCION, fechaHoraCR, miParticipacion, nombreEquipo, textoPosicion } from '../../services/participacion.js';
import { diaYHora, fechaDiaMesCorto } from '../../utils/formato.js';
import { RUTA, useAsociacion } from './contexto.js';

const detalleCompetencia = (c) => [c.category, c.branch, c.modality].filter(Boolean).join(' · ');

export default function Inscripciones() {
  useAsociacion([{ texto: 'Inscripciones' }]);
  const carga = useCarga((signal) => miParticipacion({ signal }), []);

  if (carga.estado === 'cargando') return <Cargando texto="Cargando inscripciones…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;

  const { data: inscripciones, consultado_en: consultado } = carga.datos;
  const inscritos = inscripciones.filter((i) => i.status === 'INSCRITO');
  const porAtender = inscripciones.filter((i) => ['POR_SUBSANAR', 'DEVUELTA'].includes(i.status));
  const competencias = new Set(inscritos.map((i) => i.competition.id)).size;
  const temporadas = [...new Set(inscripciones.map((i) => i.competition.season).filter(Boolean))].sort().reverse();

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Inscripciones"
        bajada={`${temporadas.length ? `Temporada ${temporadas[0]} · ` : ''}${inscripciones.length} ${inscripciones.length === 1 ? 'solicitud' : 'solicitudes'}`}
        acciones={<Link to={RUTA.calendario} className="g-boton">Ver calendario</Link>}
      />

      <Cifras
        items={[
          { valor: inscritos.length, texto: 'Equipos inscritos' },
          { valor: competencias, texto: 'Competencias con sus equipos' },
          { valor: porAtender.length, texto: 'Solicitudes por corregir', tono: porAtender.length ? 'aviso' : undefined }
        ]}
      />

      {porAtender.map((i) => (
        <p key={i.id} className="g-aviso g-aviso--error">
          <span className="g-aviso__titulo">{ESTADOS_INSCRIPCION[i.status]?.texto}: {nombreEquipo(i.team)} en {i.competition.name}</span>
          {i.notes || 'FECOVOL devolvió la solicitud. Revise los requisitos de la competencia.'}
        </p>
      ))}

      <Tarjeta titulo="Sus solicitudes" nota="Estado de la inscripción de cada equipo y su participación" pie={<span>Consultado el {fechaHoraCR(consultado)}</span>}>
        {inscripciones.length === 0 ? (
          <p className="g-tarjeta__vacio">Sus equipos todavía no participan en ninguna competencia.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Inscripciones de sus equipos</caption>
              <thead>
                <tr>
                  <th scope="col">Equipo</th>
                  <th scope="col">Competencia</th>
                  <th scope="col">Enviada</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Posición</th>
                  <th scope="col">Próximo partido</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {inscripciones.map((i) => {
                  const e = ESTADOS_INSCRIPCION[i.status] || { texto: i.status, tono: 'neutro' };
                  return (
                    <tr key={i.id}>
                      <th scope="row">{nombreEquipo(i.team)}</th>
                      <td>{i.competition.name}<span className="g-tabla__sub">{detalleCompetencia(i.competition)}</span></td>
                      <td className="g-tabla__fecha">{fechaDiaMesCorto(i.sent_at?.slice(0, 10)) || '—'}</td>
                      <td><Estado tono={e.tono}>{e.texto}</Estado></td>
                      <td>{i.standing ? <>{textoPosicion(i.standing)}<span className="g-tabla__sub">{i.standing.points} pts · {i.standing.played} PJ</span></> : '—'}</td>
                      <td>
                        {i.next_match
                          ? <>{diaYHora(i.next_match.date, i.next_match.time)}<span className="g-tabla__sub">vs {nombreEquipo(i.next_match.rival)} · {i.next_match.condition === 'LOCAL' ? 'Local' : 'Visita'}</span></>
                          : '—'}
                      </td>
                      <td className="g-tabla__accion">
                        <Link to={RUTA.participacion(i.competition.id, i.team.id)} className="g-boton g-boton--chico">
                          Ver<span className="visualmente-oculto"> {nombreEquipo(i.team)} en {i.competition.name}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
