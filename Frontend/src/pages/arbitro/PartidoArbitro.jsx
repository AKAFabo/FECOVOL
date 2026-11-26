// Partido designado (RF-ARB-004, 005 y 006): información del encuentro, nóminas habilitadas,
// cierre del partido por el árbitro principal y evidencias. Pensado para usarse desde el teléfono
// en la sede: formularios de una columna, botones grandes y la cámara para la hoja de anotación.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, Estado, Modal, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { adjuntarEvidencia, ESTADOS_ACTA, guardarCierre, hora, nombrePartido, partidoDesignado } from '../../services/arbitraje.js';
import { diaYHora, fechaCorta } from '../../utils/formato.js';
import '../../styles/arbitraje.css';

const ESTADOS_CIERRE = {
  BORRADOR: { texto: 'Borrador', tono: 'aviso' },
  ENVIADO: { texto: 'Enviado a FECOVOL', tono: 'info' },
  DEVUELTO: { texto: 'Devuelto para corregir', tono: 'error' }
};
const ROLES = { JUGADOR: 'Jugadores', CUERPO_TECNICO: 'Cuerpo técnico' };
const setVacio = () => ({ home_points: '', away_points: '' });

/* ── Nóminas ── */
function Nomina({ n }) {
  const grupos = useMemo(() => {
    const m = new Map();
    for (const x of n.members) {
      const g = ROLES[x.role] || 'Otros';
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(x);
    }
    return [...m];
  }, [n]);
  return (
    <section className="arb-nomina" aria-label={`Nómina de ${n.team.name}`}>
      <header className="arb-nomina__cabeza">
        <h3 className="arb-nomina__equipo">{n.team.name}</h3>
        {n.official
          ? <Estado tono="ok">Nómina oficial{n.version ? ` · v${n.version.number}` : ''}</Estado>
          : <Estado tono="aviso">No oficial</Estado>}
      </header>
      {!n.official && (
        <p className="arb-nomina__aviso">
          {n.members.length ? 'FECOVOL todavía no oficializa esta nómina: úsela solo como referencia.' : 'El equipo no tiene nómina registrada en la competencia.'}
        </p>
      )}
      {grupos.map(([grupo, lista]) => (
        <div key={grupo}>
          <p className="arb-nomina__grupo">{grupo}</p>
          <ul className="arb-nomina__lista">
            {lista.map((x, i) => (
              <li key={`${x.name}-${i}`} className={`arb-nomina__fila${x.habilitated ? '' : ' arb-nomina__fila--no'}`}>
                <span className="arb-nomina__numero" aria-label={x.number != null ? `Número ${x.number}` : 'Sin número'}>{x.number ?? '–'}</span>
                <span className="arb-nomina__nombre">{x.name}</span>
                {!x.habilitated && <Estado tono="error">No habilitado</Estado>}
                {x.habilitated && !x.identity_verified && <Estado tono="neutro">Identidad por verificar</Estado>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {n.last_change && <p className="g-tarjeta__nota arb-nomina__nota">Último cambio: {fechaCorta(String(n.last_change).slice(0, 10))}</p>}
    </section>
  );
}

/* ── Cierre ── */
function FormularioCierre({ d, onGuardado }) {
  const c = d.cierre;
  const [tipo, setTipo] = useState(c?.result_type || 'NORMAL');
  const [sets, setSets] = useState(() => {
    const previos = (c?.sets || []).map((s) => ({ home_points: String(s.home_points), away_points: String(s.away_points) }));
    while (previos.length < 3) previos.push(setVacio());
    return previos;
  });
  const [obs, setObs] = useState(c?.observations || '');
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  const [revisar, setRevisar] = useState(false);
  const local = d.partido.local?.short_name || d.partido.local?.name || 'Local';
  const visita = d.partido.visitante?.short_name || d.partido.visitante?.name || 'Visita';

  const conteo = sets.reduce((acc, s) => {
    const a = Number(s.home_points); const b = Number(s.away_points);
    if (s.home_points === '' || s.away_points === '' || a === b) return acc;
    return a > b ? { ...acc, l: acc.l + 1 } : { ...acc, v: acc.v + 1 };
  }, { l: 0, v: 0 });

  const cambiar = (i, campo) => (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
    setSets((xs) => xs.map((s, k) => (k === i ? { ...s, [campo]: v } : s)));
  };
  const cuerpo = () => ({
    result_type: tipo,
    observations: obs,
    sets: tipo === 'NORMAL'
      ? sets.filter((s) => s.home_points !== '' || s.away_points !== '').map((s) => ({ home_points: Number(s.home_points), away_points: Number(s.away_points) }))
      : []
  });

  async function guardar(enviar) {
    setEstado({ ocupado: true, error: '' });
    try {
      const r = await guardarCierre(d.partido.id, { ...cuerpo(), enviar });
      setRevisar(false);
      onGuardado(r.enviado ? 'El cierre se envió a FECOVOL. El resultado será oficial cuando el Personal valide el acta.' : 'Borrador guardado. Todavía no es información oficial.');
    } catch (e) {
      setEstado({ ocupado: false, error: e.message });
      return;
    }
    setEstado({ ocupado: false, error: '' });
  }

  return (
    <div className="g-tarjeta__cuerpo arb-cierre">
      {c?.status === 'DEVUELTO' && (
        <p className="g-aviso g-aviso--error" role="status">
          <span className="g-aviso__titulo">FECOVOL devolvió el cierre</span>
          {c.return_reason}
        </p>
      )}
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <Campo etiqueta="Resultado del partido">
        {(a) => (
          <select {...a} className="g-control" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(d.resultados).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </Campo>

      {tipo === 'NORMAL' && (
        <fieldset className="arb-sets">
          <legend className="g-campo__etiqueta">Marcador por set</legend>
          <div className="arb-sets__cabeza" aria-hidden="true"><span>Set</span><span>{local}</span><span>{visita}</span></div>
          {sets.map((s, i) => (
            <div key={i} className="arb-sets__fila">
              <span className="arb-sets__n">{i + 1}</span>
              <input className="g-control arb-sets__puntos" inputMode="numeric" pattern="[0-9]*" aria-label={`Set ${i + 1}, puntos de ${local}`} value={s.home_points} onChange={cambiar(i, 'home_points')} />
              <input className="g-control arb-sets__puntos" inputMode="numeric" pattern="[0-9]*" aria-label={`Set ${i + 1}, puntos de ${visita}`} value={s.away_points} onChange={cambiar(i, 'away_points')} />
            </div>
          ))}
          <div className="arb-sets__acciones">
            {sets.length < 5 && <button type="button" className="g-boton g-boton--chico" onClick={() => setSets((x) => [...x, setVacio()])}>Agregar set</button>}
            {sets.length > 3 && <button type="button" className="g-boton g-boton--chico" onClick={() => setSets((x) => x.slice(0, -1))}>Quitar el último</button>}
          </div>
          <p className="arb-sets__total" aria-live="polite">Sets: {local} {conteo.l} – {conteo.v} {visita}</p>
        </fieldset>
      )}

      <Campo etiqueta="Observaciones" ayuda={tipo === 'NORMAL' ? 'Datos que FECOVOL deba conocer del partido.' : 'Explique lo ocurrido: es obligatorio para un resultado especial.'}>
        {(a) => <textarea {...a} className="g-control" rows={3} maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} />}
      </Campo>

      <div className="arb-cierre__acciones">
        <button type="button" className="g-boton" onClick={() => guardar(false)} disabled={estado.ocupado}>Guardar borrador</button>
        <button type="button" className="g-boton g-boton--acento" onClick={() => { setEstado((x) => ({ ...x, error: '' })); setRevisar(true); }} disabled={estado.ocupado}>Revisar y enviar</button>
      </div>

      {revisar && (
        <Modal
          titulo="Enviar el cierre a FECOVOL"
          bajada={nombrePartido(d.partido)}
          onCerrar={() => setRevisar(false)}
          ocupado={estado.ocupado}
          pie={(
            <>
              <button type="button" className="g-boton" onClick={() => setRevisar(false)} disabled={estado.ocupado}>Volver</button>
              <button type="button" className="g-boton g-boton--acento" onClick={() => guardar(true)} disabled={estado.ocupado} data-autofoco>
                {estado.ocupado ? 'Enviando…' : 'Enviar'}
              </button>
            </>
          )}
        >
          {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}
          <dl className="g-datos">
            <div className="g-datos__fila"><dt>Resultado</dt><dd>{d.resultados[tipo]}</dd></div>
            {tipo === 'NORMAL' && (
              <div className="g-datos__fila">
                <dt>Sets</dt>
                <dd>{local} {conteo.l} – {conteo.v} {visita} ({cuerpo().sets.map((s) => `${s.home_points}-${s.away_points}`).join(', ')})</dd>
              </div>
            )}
            {obs.trim() && <div className="g-datos__fila"><dt>Observaciones</dt><dd>{obs.trim()}</dd></div>}
          </dl>
          <p className="g-campo__ayuda">Después de enviarlo no podrá modificarlo; si hay un error, FECOVOL puede devolvérselo.</p>
        </Modal>
      )}
    </div>
  );
}

function ResumenCierre({ d, esPrincipal }) {
  const c = d.cierre;
  if (!c) {
    return (
      <p className="g-tarjeta__vacio">
        {esPrincipal ? 'Todavía no hay un cierre registrado para este partido.' : 'El árbitro principal todavía no registra el cierre.'}
      </p>
    );
  }
  return (
    <div className="g-tarjeta__cuerpo">
      <dl className="g-datos">
        <div className="g-datos__fila"><dt>Resultado</dt><dd>{d.resultados[c.result_type]}</dd></div>
        {c.sets?.length > 0 && <div className="g-datos__fila"><dt>Sets</dt><dd>{c.sets.map((s) => `${s.home_points}-${s.away_points}`).join(', ')}</dd></div>}
        {c.observations && <div className="g-datos__fila"><dt>Observaciones</dt><dd>{c.observations}</dd></div>}
        {c.submitted_at && <div className="g-datos__fila"><dt>Enviado</dt><dd>{new Date(c.submitted_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</dd></div>}
      </dl>
    </div>
  );
}

/* ── Evidencias ── */
function Evidencias({ d, onCambio }) {
  const [tipo, setTipo] = useState('HOJA_ANOTACION');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [sustituye, setSustituye] = useState('');
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  const [clave, setClave] = useState(0);
  const vigentes = d.evidencias.filter((e) => !e.replaced_by);
  const reemplazadas = d.evidencias.filter((e) => e.replaced_by);

  async function subir(e) {
    e.preventDefault();
    if (!archivo) { setEstado({ ocupado: false, error: 'Elija el archivo o tome la fotografía.' }); return; }
    setEstado({ ocupado: true, error: '' });
    try {
      await adjuntarEvidencia(d.partido.id, { archivo, tipo, descripcion: descripcion.trim(), sustituye: sustituye || undefined });
      setArchivo(null); setDescripcion(''); setSustituye(''); setClave((k) => k + 1);
      setEstado({ ocupado: false, error: '' });
      onCambio('Evidencia adjuntada.');
    } catch (err) {
      setEstado({ ocupado: false, error: err.message });
    }
  }

  return (
    <>
      {vigentes.length === 0 ? (
        <p className="g-tarjeta__vacio">Todavía no hay evidencias en este partido.</p>
      ) : (
        <ul className="g-lista">
          {vigentes.map((ev) => (
            <li key={ev.id} className="g-lista__fila">
              <div className="g-lista__texto">
                <p className="g-lista__titulo">{d.tipos_evidencia[ev.file_type] || ev.file_type}</p>
                <p className="g-lista__detalle">{[ev.file_name, ev.uploaded_by, ev.created_at ? fechaCorta(ev.created_at.slice(0, 10)) : null].filter(Boolean).join(' · ')}</p>
                {ev.description && <p className="g-lista__detalle">{ev.description}</p>}
              </div>
              {ev.url && <a className="g-boton g-boton--chico" href={ev.url} target="_blank" rel="noopener noreferrer">Ver<span className="visualmente-oculto"> {ev.file_name}</span></a>}
            </li>
          ))}
        </ul>
      )}
      {reemplazadas.length > 0 && (
        <p className="g-tarjeta__nota arb-evidencias__nota">{reemplazadas.length === 1 ? 'Hay una versión anterior sustituida' : `Hay ${reemplazadas.length} versiones anteriores sustituidas`}; se conservan en el registro del partido.</p>
      )}

      {d.puede_adjuntar && (
        <form className="g-tarjeta__cuerpo g-formulario arb-evidencias__form" onSubmit={subir}>
          {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
          <Campo etiqueta="Tipo">
            {(a) => (
              <select {...a} className="g-control" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(d.tipos_evidencia).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </Campo>
          {vigentes.length > 0 && (
            <Campo etiqueta="¿Sustituye a otra?">
              {(a) => (
                <select {...a} className="g-control" value={sustituye} onChange={(e) => setSustituye(e.target.value)}>
                  <option value="">No, es nueva</option>
                  {vigentes.map((ev) => <option key={ev.id} value={ev.id}>{d.tipos_evidencia[ev.file_type] || ev.file_type} · {ev.file_name}</option>)}
                </select>
              )}
            </Campo>
          )}
          <Campo etiqueta="Archivo" ancho ayuda="PDF, JPG o PNG. En el teléfono puede tomar la fotografía de la hoja.">
            {(a) => <input {...a} key={clave} type="file" className="g-control" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />}
          </Campo>
          <Campo etiqueta="Observación" ancho>
            {(a) => <input {...a} className="g-control" maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
          </Campo>
          <div className="g-campo--ancho">
            <button type="submit" className="g-boton g-boton--acento" disabled={estado.ocupado}>{estado.ocupado ? 'Adjuntando…' : 'Adjuntar'}</button>
          </div>
        </form>
      )}
    </>
  );
}

export default function PartidoArbitro() {
  const { partidoId } = useParams();
  const [version, setVersion] = useState(0);
  const [mensaje, mostrar] = useMensaje();
  const carga = useCarga((signal) => partidoDesignado(partidoId, { signal }), [partidoId, version]);
  const [d, setD] = useState(null);
  useEffect(() => { if (carga.datos) setD(carga.datos); }, [carga.datos]);

  const recargar = (texto) => { if (texto) mostrar(texto); setVersion((v) => v + 1); };

  if (carga.estado === 'error' && !d) return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  if (!d) return <Cargando texto="Cargando el partido…" />;

  const p = d.partido;
  const acta = ESTADOS_ACTA[p.acta_status];
  const cierre = d.cierre ? ESTADOS_CIERRE[d.cierre.status] : null;
  const esPrincipal = d.mi_puesto?.code === 'PRI';
  // Por qué el principal no ve el formulario de cierre (la regla la decide el backend: puede_cerrar).
  const motivoSinCierre = !esPrincipal || d.puede_cerrar ? null
    : p.status === 'CANCELADO' ? 'El partido fue cancelado; no lleva cierre.'
      : p.scheduled_date > d.hoy ? `Podrá registrar el cierre a partir del día del partido (${p.scheduled_date.split('-').reverse().join('/')}).`
        : p.acta_status === 'VALIDADA' ? 'FECOVOL ya validó el acta de este partido.'
          : d.cierre?.status === 'ENVIADO' ? 'Usted ya envió el cierre. FECOVOL lo revisa; si necesita cambios, se lo devolverá.'
            : null;

  return (
    <div className="g-pagina">
      {mensaje}
      <p className="arb-volver"><Link to="/arbitro/actas" className="g-enlace">← Actas</Link> · <Link to="/arbitro" className="g-enlace">Mis designaciones</Link></p>
      <Encabezado
        titulo={nombrePartido(p)}
        bajada={[p.competencia?.name, p.matchday ? `Jornada ${p.matchday}` : null, diaYHora(p.scheduled_date, hora(p.scheduled_time)), p.sede?.value].filter(Boolean).join(' · ')}
      />
      <div className="arb-estados-partido">
        <Estado tono="neutro">Su rol: {d.mi_puesto?.value}</Estado>
        {acta && <Estado tono={acta.tono}>{acta.texto}</Estado>}
        {cierre && <Estado tono={cierre.tono}>Cierre: {cierre.texto.toLowerCase()}</Estado>}
      </div>

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Cierre del partido" nota={esPrincipal ? 'Lo registra y envía el árbitro principal' : 'Lo registra el árbitro principal'}>
            {d.puede_cerrar
              ? <FormularioCierre key={`${d.cierre?.status}-${d.cierre?.updated_at}`} d={d} onGuardado={recargar} />
              : (
                <>
                  {motivoSinCierre && <p className="g-tarjeta__vacio">{motivoSinCierre}</p>}
                  {(!esPrincipal || !motivoSinCierre || d.cierre) && <ResumenCierre d={d} esPrincipal={esPrincipal} />}
                </>
              )}
          </Tarjeta>

          <Tarjeta titulo="Evidencias" nota="Hoja de anotación, fotografías de los equipos y otros documentos">
            <Evidencias d={d} onCambio={recargar} />
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Nóminas" nota="Solo consulta: las nóminas las administra FECOVOL">
            <div className="g-tarjeta__cuerpo arb-nominas">
              {d.nominas.map((n) => <Nomina key={n.team.id} n={n} />)}
            </div>
          </Tarjeta>
          <Tarjeta titulo="Oficiales del partido">
            <ul className="g-lista">
              {d.oficiales.map((o, i) => (
                <li key={i} className="g-lista__fila">
                  <div className="g-lista__texto">
                    <p className="g-lista__titulo">{o.name}{o.propio ? ' (usted)' : ''}</p>
                    <p className="g-lista__detalle">{o.puesto?.value}</p>
                  </div>
                  <Estado tono={o.status === 'PROPUESTA' ? 'aviso' : 'ok'}>{o.status === 'PROPUESTA' ? 'Por confirmar' : 'Confirmado'}</Estado>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
