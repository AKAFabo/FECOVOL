// Detalle de equipo (Figma 04 · Detalle de equipo): nómina, cuerpo técnico y documentos.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { Confirmar, Encabezado, Estado, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import {
  darDeBaja, esId, estadoDocumento, listarDocumentos, listarPersonas, nombrePersona, nominaEquipo, obtenerEquipo, valoresCatalogo, ESTADOS_EQUIPO
} from '../../services/representante.js';
import AgregarIntegrante from './AgregarIntegrante.jsx';
import SubirDocumento from './SubirDocumento.jsx';
import TablaDocumentos from './TablaDocumentos.jsx';
import { useAsociacion, useEsFecovol, useRutas } from './contexto.js';

const PESTANAS = [
  { valor: 'nomina', texto: 'Nómina' },
  { valor: 'tecnico', texto: 'Cuerpo técnico' },
  { valor: 'documentos', texto: 'Documentos' }
];

function Pestanas({ activa, onCambiar }) {
  const refs = useRef([]);
  function alTeclear(e, i) {
    const ultimo = PESTANAS.length - 1;
    const destino = { ArrowRight: i === ultimo ? 0 : i + 1, ArrowLeft: i === 0 ? ultimo : i - 1, Home: 0, End: ultimo }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    onCambiar(PESTANAS[destino].valor);
    refs.current[destino]?.focus();
  }
  return (
    <div className="g-pestanas" role="tablist" aria-label="Información del equipo">
      {PESTANAS.map((p, i) => (
        <button
          key={p.valor}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`tab-${p.valor}`}
          aria-selected={p.valor === activa}
          aria-controls={`panel-${p.valor}`}
          tabIndex={p.valor === activa ? 0 : -1}
          className="g-pestana"
          onClick={() => onCambiar(p.valor)}
          onKeyDown={(e) => alTeclear(e, i)}
        >
          {p.texto}
        </button>
      ))}
    </div>
  );
}

// Resumen de documentos por persona para la columna "Documentos" de la nómina.
function docsPorPersona(documentos) {
  const r = {};
  for (const d of documentos) {
    if (!d.persona) continue;
    const e = estadoDocumento(d);
    const actual = r[d.persona.id];
    const orden = { rechazado: 0, vencido: 1, 'por-vencer': 2, revision: 3, vigente: 4 };
    if (!actual || orden[e.clave] < orden[actual.clave]) r[d.persona.id] = { ...e, tipo: d.tipo?.value };
  }
  return r;
}

function CeldaDocumentos({ estado }) {
  if (!estado) return <span className="g-tabla__aviso">Sin documentos</span>;
  if (estado.clave === 'vigente') return <>Al día</>;
  if (estado.clave === 'revision') return <>En revisión</>;
  return (
    <>
      <span className="g-tabla__aviso">{estado.texto}</span>
      <span className="g-tabla__sub">{estado.tipo}</span>
    </>
  );
}

function Detalle({ datos, recargar, mostrar }) {
  const RUTA = useRutas();
  const fecovol = useEsFecovol();
  const { equipo, nomina, personas, documentos, posiciones, tipos } = datos;
  const [params, setParams] = useSearchParams();
  const pestana = PESTANAS.some((p) => p.valor === params.get('vista')) ? params.get('vista') : 'nomina';
  const [modal, setModal] = useState(null); // { tipo: 'agregar', miembro } | { tipo: 'baja', miembro } | { tipo: 'subir' }

  const jugadores = nomina.filter((m) => m.member_type === 'JUGADOR');
  const tecnicos = nomina.filter((m) => m.member_type === 'TECNICO');
  const docs = docsPorPersona(documentos);
  const docsEquipo = documentos.filter((d) => d.equipo?.id === equipo.id);
  const docsIntegrantes = documentos.filter((d) => d.persona && nomina.some((m) => m.persona?.id === d.persona.id));
  const estado = ESTADOS_EQUIPO[equipo.status] || { texto: equipo.status, tono: 'neutro' };
  const verificados = jugadores.filter((m) => m.persona?.is_verified).length;
  const conPendientes = jugadores.filter((m) => {
    const e = docs[m.persona?.id];
    return !e || ['rechazado', 'vencido', 'por-vencer'].includes(e.clave);
  }).length;

  function cambiarPestana(valor) {
    const p = new URLSearchParams(params);
    if (valor === 'nomina') p.delete('vista');
    else p.set('vista', valor);
    setParams(p, { replace: true });
  }

  const tablaIntegrantes = (lista, tipo) => (
    lista.length === 0 ? (
      <p className="g-tarjeta__vacio">{tipo === 'JUGADOR' ? 'Todavía no hay jugadores en la nómina.' : 'Todavía no hay cuerpo técnico asignado.'}</p>
    ) : (
      <div className="g-tabla-envoltura">
        <table className="g-tabla">
          <caption className="visualmente-oculto">{tipo === 'JUGADOR' ? 'Nómina de jugadores' : 'Cuerpo técnico'}</caption>
          <thead>
            <tr>
              {tipo === 'JUGADOR' && <th scope="col"><abbr title="Número">N.º</abbr></th>}
              <th scope="col">Persona</th>
              <th scope="col">{tipo === 'JUGADOR' ? 'Posición' : 'Función'}</th>
              <th scope="col">Documentos</th>
              <th scope="col">Identidad</th>
              <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.id}>
                {tipo === 'JUGADOR' && <td>{m.jersey_number ?? '—'}</td>}
                <th scope="row">
                  <Link className="g-enlace" to={RUTA.persona(m.persona.id)}>{nombrePersona(m.persona)}</Link>
                  <span className="g-tabla__sub">{m.persona.document_number}</span>
                </th>
                <td>{tipo === 'JUGADOR' ? m.posicion?.value || '—' : m.technical_role || '—'}</td>
                <td><CeldaDocumentos estado={docs[m.persona.id]} /></td>
                <td>{m.persona.is_verified ? <Estado tono="ok">Verificada</Estado> : <Estado tono="neutro">Por verificar</Estado>}</td>
                <td className="g-tabla__accion">
                  <button type="button" className="g-enlace g-enlace--peligro" onClick={() => setModal({ tipo: 'baja', miembro: m })}>
                    Dar de baja<span className="visualmente-oculto"> a {nombrePersona(m.persona)}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="g-pagina">
      <Encabezado
        titulo={equipo.name}
        bajada={fecovol && equipo.asociacion
          ? <Link className="g-enlace" to={RUTA.asociacion(equipo.asociacion.id)}>{equipo.asociacion.name}</Link>
          : null}
        acciones={(
          <>
            <Link to={RUTA.editarEquipo(equipo.id)} className="g-boton">Editar equipo</Link>
            <button type="button" className="g-boton g-boton--acento" onClick={() => setModal({ tipo: 'agregar' })} disabled={equipo.status !== 'ACTIVO'}>
              Agregar integrante
            </button>
          </>
        )}
      >
        <div className="g-encabezado__pastillas">
          {[equipo.categoria?.value, equipo.rama?.value, equipo.modalidad?.value].filter(Boolean).map((t) => <Estado key={t} tono="neutro">{t}</Estado>)}
          <Estado tono={estado.tono}>{estado.texto}</Estado>
        </div>
      </Encabezado>

      <Pestanas activa={pestana} onCambiar={cambiarPestana} />

      <div className="g-rejilla">
        <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="g-columna">
          {pestana === 'nomina' && (
            <Tarjeta
              titulo="Nómina inscrita"
              accion={<Estado tono="neutro">{jugadores.length} {jugadores.length === 1 ? 'jugador' : 'jugadores'}</Estado>}
              pie={equipo.status === 'ACTIVO' ? (
                <>
                  <span>{jugadores.length} en la nómina</span>
                  <button type="button" className="g-enlace" onClick={() => setModal({ tipo: 'agregar', miembro: 'JUGADOR' })}>Agregar jugador →</button>
                </>
              ) : null}
            >
              {tablaIntegrantes(jugadores, 'JUGADOR')}
            </Tarjeta>
          )}
          {pestana === 'tecnico' && (
            <Tarjeta
              titulo="Cuerpo técnico"
              pie={equipo.status === 'ACTIVO' ? (
                <>
                  <span>{tecnicos.length} {tecnicos.length === 1 ? 'integrante' : 'integrantes'}</span>
                  <button type="button" className="g-enlace" onClick={() => setModal({ tipo: 'agregar', miembro: 'TECNICO' })}>Agregar al cuerpo técnico →</button>
                </>
              ) : null}
            >
              {tablaIntegrantes(tecnicos, 'TECNICO')}
            </Tarjeta>
          )}
          {pestana === 'documentos' && (
            <>
              <Tarjeta
                titulo="Documentos del equipo"
                accion={<button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => setModal({ tipo: 'subir' })}>Subir documento</button>}
              >
                <TablaDocumentos documentos={docsEquipo} conTitular={false} vacio="El equipo no tiene documentos propios." onReemplazar={(d) => setModal({ tipo: 'subir', tipoDoc: d.tipo?.code })} />
              </Tarjeta>
              <Tarjeta titulo="Documentos de los integrantes" nota="Se cargan desde la ficha de cada persona.">
                <TablaDocumentos documentos={docsIntegrantes} vacio="Los integrantes todavía no tienen documentos." />
              </Tarjeta>
            </>
          )}
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Estado de la nómina">
            <dl className="g-datos">
              <div className="g-datos__fila"><dt>Jugadores</dt><dd>{jugadores.length}</dd></div>
              <div className="g-datos__fila"><dt>Identidad verificada</dt><dd style={{ color: 'var(--ok)' }}>{verificados}</dd></div>
              <div className="g-datos__fila"><dt>Con documentos pendientes</dt><dd style={{ color: conPendientes ? 'var(--aviso)' : undefined }}>{conPendientes}</dd></div>
              <div className="g-datos__fila"><dt>Cuerpo técnico</dt><dd>{tecnicos.length}</dd></div>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Cuerpo técnico">
            {tecnicos.length === 0 ? <p className="g-tarjeta__vacio">Sin asignar.</p> : (
              <ul className="g-lista">
                {tecnicos.map((m) => (
                  <li key={m.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo">{nombrePersona(m.persona)}</p>
                      <p className="g-lista__detalle">{m.technical_role || 'Cuerpo técnico'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          {equipo.home_venue && (
            <Tarjeta titulo="Sede">
              <p className="g-tarjeta__vacio" style={{ color: 'var(--texto)' }}>{equipo.home_venue}</p>
            </Tarjeta>
          )}
        </div>
      </div>

      {modal?.tipo === 'agregar' && (
        <AgregarIntegrante
          equipo={equipo}
          tipo={modal.miembro || (pestana === 'tecnico' ? 'TECNICO' : 'JUGADOR')}
          personas={personas}
          yaEnEquipo={new Set(nomina.map((m) => m.persona?.id))}
          numerosUsados={new Set(jugadores.map((m) => m.jersey_number).filter(Boolean))}
          posiciones={posiciones}
          onCerrar={() => setModal(null)}
          onAgregado={(p) => { setModal(null); mostrar(`${nombrePersona(p)} se agregó a la nómina.`); recargar(); }}
        />
      )}
      {modal?.tipo === 'baja' && (
        <Confirmar
          titulo="Dar de baja"
          texto={`${nombrePersona(modal.miembro.persona)} dejará de estar en la nómina de ${equipo.name}. La persona sigue registrada en la asociación y el cambio queda en la bitácora.`}
          textoAccion="Dar de baja"
          peligro
          onCerrar={() => setModal(null)}
          onConfirmar={async () => {
            await darDeBaja(modal.miembro.id);
            setModal(null);
            mostrar('Integrante dado de baja.');
            recargar();
          }}
        />
      )}
      {modal?.tipo === 'subir' && (
        <SubirDocumento
          tipos={tipos}
          titularFijo={{ texto: equipo.name, titular: { team_id: equipo.id } }}
          tipoInicial={modal.tipoDoc || ''}
          onCerrar={() => setModal(null)}
          onSubido={() => { setModal(null); mostrar('Documento cargado. Queda en revisión de FECOVOL.'); recargar(); }}
        />
      )}
    </div>
  );
}

export default function EquipoDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const [mensaje, mostrar] = useMensaje();
  const valido = esId(id);

  const RUTA = useRutas();
  const fecovol = useEsFecovol();

  // Primero el equipo: personas y documentos se piden de su asociación (para FECOVOL, que ve todas).
  const carga = useCarga(
    (signal) => (valido
      ? obtenerEquipo(id, { signal }).then((equipo) => Promise.all([
        nominaEquipo(id, { signal }),
        listarPersonas({ asociacion: equipo.association_id }, { signal }),
        listarDocumentos({ association_id: equipo.association_id }, { signal }),
        valoresCatalogo('Posiciones', { signal }),
        valoresCatalogo('Tipos de documento', { signal })
      ]).then(([nomina, personas, documentos, posiciones, tipos]) => ({
        equipo, nomina, personas: personas.data, documentos, posiciones, tipos
      })))
      : Promise.resolve(null)),
    [id, valido]
  );

  const nombre = carga.estado === 'listo' ? carga.datos.equipo.name : 'Equipo';
  useAsociacion([{ texto: fecovol ? 'Asociaciones y equipos' : 'Mis equipos', to: RUTA.equipos }, { texto: nombre }]);

  useEffect(() => {
    if (location.state?.mensaje) mostrar(location.state.mensaje);
  }, [location.state, mostrar]);

  if (!valido) return <SinResultados titulo="Equipo no encontrado" texto="El enlace no es válido." />;
  if (carga.estado === 'cargando') return <><Cargando texto="Cargando equipo…" />{mensaje}</>;
  if (carga.estado === 'error') {
    if (carga.error.status === 404 || carga.error.status === 403) {
      return (
        <SinResultados titulo="Equipo no encontrado" texto={fecovol ? 'El equipo no existe.' : 'El equipo no existe o no pertenece a su asociación.'}>
          <Link to={RUTA.equipos} className="g-boton">{fecovol ? 'Ver asociaciones y equipos' : 'Ver mis equipos'}</Link>
        </SinResultados>
      );
    }
    return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  }
  return <><Detalle datos={carga.datos} recargar={carga.reintentar} mostrar={mostrar} />{mensaje}</>;
}
