// Ficha de árbitro (Figma 02 · Ficha de árbitro): partidos dirigidos, cursos, datos personales,
// acreditación vigente e historial. Desde aquí se renueva la acreditación o se da acceso.
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Encabezado, Estado, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import useDatosVigentes from '../../../hooks/useDatosVigentes.js';
import {
  categoriaArbitral, darAccesoArbitro, ESTADOS_ACREDITACION, ESTADOS_ACTA, ESTADOS_DESIGNACION, fechaNumerica, fichaArbitral,
  hoyCR, MODALIDADES_ARBITRAJE, nombrePartido, RESULTADOS_CURSO, textoAcceso
} from '../../../services/arbitraje.js';
import { esId, nombrePersona } from '../../../services/representante.js';
import { fechaCorta, fechaDiaMesCorto } from '../../../utils/formato.js';
import { RUTA_ARBITRAJE as RUTA } from './rutas.js';
import '../../../styles/arbitraje.css';

function estadoDe(a) {
  if (!a) return 'SIN_ACREDITACION';
  const hoy = hoyCR();
  if (a.valid_until < hoy) return 'VENCIDA';
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 30);
  return a.valid_until <= limite.toISOString().slice(0, 10) ? 'POR_VENCER' : 'AL_DIA';
}

function EstadoPartido({ d }) {
  const p = d.partido;
  if (d.status === 'PROPUESTA' || d.status === 'RECHAZADA') {
    const e = ESTADOS_DESIGNACION[d.status];
    return <Estado tono={e.tono}>{e.texto}</Estado>;
  }
  if (p?.status === 'FINALIZADO') {
    const e = ESTADOS_ACTA[p.acta_status] || ESTADOS_ACTA.BORRADOR;
    return <Estado tono={e.tono}>{e.texto}</Estado>;
  }
  const e = ESTADOS_DESIGNACION[d.status] || ESTADOS_DESIGNACION.CONFIRMADA;
  return <Estado tono={e.tono}>{e.texto}</Estado>;
}

export default function FichaArbitro() {
  const { id } = useParams();
  const location = useLocation();
  const valido = esId(id);
  const ficha = useCarga((signal) => (valido ? fichaArbitral(id, { signal }) : Promise.reject(new Error('El enlace no es válido.'))), [id]);
  const [acceso, setAcceso] = useState({ enviando: false, resultado: location.state?.acceso || null, error: null });

  async function darAcceso() {
    setAcceso({ enviando: true, resultado: null, error: null });
    try {
      const r = await darAccesoArbitro(id);
      setAcceso({ enviando: false, resultado: r.acceso, error: null });
      ficha.reintentar();
    } catch (e) {
      setAcceso({ enviando: false, resultado: null, error: e.message });
    }
  }

  const datos = useDatosVigentes(ficha, id);
  if (ficha.estado === 'error') return <ErrorCarga mensaje={ficha.error.message} onReintentar={valido ? ficha.reintentar : undefined} />;
  if (!datos) return <Cargando texto="Cargando la ficha…" />;

  const { persona: p, acreditacion: a, acreditaciones, cursos, designaciones } = datos;
  const estado = ESTADOS_ACREDITACION[estadoDe(a)];
  const anio = hoyCR().slice(0, 4);
  const temporada = designaciones.filter((d) => d.partido?.scheduled_date?.startsWith(anio));
  const dirigidos = temporada.filter((d) => ['CONFIRMADA', 'CUMPLIDA'].includes(d.status)).length;
  const esArbitro = (p.person_roles || []).some((r) => r.role_type === 'ARBITRO' && r.is_active);
  const aviso = acceso.resultado ? textoAcceso(acceso.resultado) : null;

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={nombrePersona(p)}
        bajada={[a ? categoriaArbitral(a) : 'Sin acreditación', p.document_number].join(' · ')}
        acciones={(
          <>
            <Link to={RUTA.personaPadron(p.id)} className="g-boton">Ficha en el padrón</Link>
            <Link to={RUTA.acreditar(p.id)} className="g-boton g-boton--primario">{a ? 'Renovar acreditación' : 'Acreditar'}</Link>
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          <Estado tono={estado.tono}>{estado.texto}</Estado>
          {a && <Estado tono="neutro">{a.valid_until < hoyCR() ? 'Venció' : 'Vence'} {fechaNumerica(a.valid_until)}</Estado>}
          <Estado tono="neutro">{dirigidos} {dirigidos === 1 ? 'partido' : 'partidos'} esta temporada</Estado>
        </div>
      </Encabezado>

      {location.state?.acreditada && <p className="g-aviso g-aviso--ok" role="status"><span className="g-aviso__titulo">Acreditación registrada</span>La persona ya puede ser designada en partidos.</p>}
      {aviso && <p className={`g-aviso${aviso.tono === 'ok' ? ' g-aviso--ok' : ' arb-aviso-naranja'}`} role="status">{aviso.texto}</p>}
      {acceso.error && <p className="g-aviso g-aviso--error" role="alert">{acceso.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Partidos dirigidos" nota={`Temporada ${anio}`}>
            {temporada.length === 0 ? (
              <p className="g-tarjeta__vacio">No tiene designaciones esta temporada.</p>
            ) : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Partidos de la temporada</caption>
                  <thead>
                    <tr><th scope="col">Fecha</th><th scope="col">Partido</th><th scope="col">Competencia</th><th scope="col">Función</th><th scope="col">Estado</th></tr>
                  </thead>
                  <tbody>
                    {temporada.map((d) => (
                      <tr key={d.id}>
                        <td className="g-tabla__fecha">{fechaDiaMesCorto(d.partido?.scheduled_date)}</td>
                        <th scope="row">{nombrePartido(d.partido)}</th>
                        <td>{d.partido?.competencia?.name || '—'}</td>
                        <td>{d.puesto?.value}</td>
                        <td><EstadoPartido d={d} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Cursos y evaluaciones">
            {cursos.length === 0 ? (
              <p className="g-tarjeta__vacio">No tiene cursos registrados.</p>
            ) : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Cursos</caption>
                  <thead><tr><th scope="col">Fecha</th><th scope="col">Curso</th><th scope="col">Resultado</th></tr></thead>
                  <tbody>
                    {cursos.map((c) => {
                      const r = RESULTADOS_CURSO[c.result] || RESULTADOS_CURSO.INSCRITO;
                      return (
                        <tr key={c.id}>
                          <td className="g-tabla__fecha">{fechaCorta(c.curso?.end_date)}</td>
                          <th scope="row"><Link to={RUTA.curso(c.curso?.id)} className="arb-enlace-fila">{c.curso?.name}</Link></th>
                          <td><Estado tono={r.tono}>{r.texto}</Estado>{c.grade !== null && c.grade !== undefined && <span className="arb-nota-texto"> · {Number(c.grade)}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          {acreditaciones.length > 1 && (
            <Tarjeta titulo="Historial de acreditaciones">
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Historial de acreditaciones</caption>
                  <thead><tr><th scope="col">Categoría</th><th scope="col">Vigencia</th><th scope="col">Estado</th></tr></thead>
                  <tbody>
                    {acreditaciones.map((x) => (
                      <tr key={x.id}>
                        <th scope="row">{categoriaArbitral(x)}</th>
                        <td className="g-tabla__fecha">{fechaNumerica(x.valid_from)} al {fechaNumerica(x.valid_until)}</td>
                        <td><Estado tono={x.status === 'ACTIVA' ? 'ok' : 'neutro'}>{x.status === 'ACTIVA' ? 'Vigente' : x.status === 'REVOCADA' ? 'Revocada' : 'Reemplazada'}</Estado></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Datos personales">
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Identificación</dt><dd>{p.document_number}</dd></div>
              <div className="g-datos__fila"><dt>Provincia</dt><dd>{p.province || '—'}</dd></div>
              <div className="g-datos__fila"><dt>Asociación</dt><dd>{p.asociacion?.short_name || p.asociacion?.name || 'Sin asociación'}</dd></div>
              <div className="g-datos__fila"><dt>Correo</dt><dd>{p.email || '—'}</dd></div>
              <div className="g-datos__fila"><dt>Teléfono</dt><dd>{p.phone || '—'}</dd></div>
              <div className="g-datos__fila"><dt>Acceso al sistema</dt><dd>{p.tiene_cuenta ? 'Con cuenta' : 'Sin cuenta'}</dd></div>
            </dl>
            {!p.tiene_cuenta && esArbitro && (
              <div className="g-tarjeta__pie">
                <span>{p.email ? 'Se enviará una invitación a su correo.' : 'Agregue su correo en el padrón para darle acceso.'}</span>
                <button type="button" className="g-boton g-boton--chico" onClick={darAcceso} disabled={!p.email || acceso.enviando}>
                  {acceso.enviando ? 'Enviando…' : 'Dar acceso'}
                </button>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Acreditación">
            {a ? (
              <dl className="g-datos">
                <div className="g-datos__fila"><dt>Función</dt><dd>{a.funcion?.value}</dd></div>
                <div className="g-datos__fila"><dt>Nivel</dt><dd>{a.nivel?.value}</dd></div>
                <div className="g-datos__fila"><dt>Modalidad</dt><dd>{MODALIDADES_ARBITRAJE[a.modality] || a.modality}</dd></div>
                <div className="g-datos__fila"><dt>Categorías</dt><dd>{a.categoria?.value || 'Todas'}</dd></div>
                <div className="g-datos__fila"><dt>Vigencia</dt><dd>{fechaNumerica(a.valid_from)} al {fechaNumerica(a.valid_until)}</dd></div>
              </dl>
            ) : (
              <p className="g-tarjeta__vacio">No tiene una acreditación activa.</p>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
