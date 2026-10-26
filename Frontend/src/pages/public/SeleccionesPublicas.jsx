import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CabeceraSeccion from '../../components/CabeceraSeccion.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { CanchaPlano } from '../../components/Ilustraciones.jsx';
import Migas from '../../components/Migas.jsx';
import Segmentado from '../../components/Segmentado.jsx';
import useCarga from '../../hooks/useCarga.js';
import { iniciales } from '../../utils/sigla.js';
import { obtenerSelecciones } from '../../services/selecciones.js';
import { rangoDias } from '../../utils/formato.js';
import '../../styles/paneles.css';
import './SeleccionesPublicas.css';

const TODAS = 'todas';

// Filtros de la franja azul. Las opciones salen de las selecciones publicadas.
const FILTROS = [
  { parametro: 'modalidad', campo: 'modality', etiqueta: 'Modalidad', primeros: ['Sala', 'Playa'] },
  { parametro: 'rama', campo: 'branch', etiqueta: 'Rama', primeros: ['Femenina', 'Masculina'] },
  { parametro: 'categoria', campo: 'category', etiqueta: 'Categoría', primeros: ['Mayor'] }
];

function opcionesDe(selecciones, { campo, primeros }) {
  const valores = [...new Set(selecciones.map((s) => s[campo]).filter(Boolean))];
  const rango = (v) => (primeros.includes(v) ? primeros.indexOf(v) : primeros.length);
  valores.sort((a, b) => rango(a) - rango(b) || a.localeCompare(b, 'es'));
  return [{ valor: TODAS, texto: 'Todas' }, ...valores.map((v) => ({ valor: v, texto: v }))];
}


/* ----------------------------------------------------------------------------------------------
   Tarjetas de selecciones
   ---------------------------------------------------------------------------------------------- */
function TarjetaSeleccion({ seleccion: s, activa, onVerConvocatoria }) {
  const tono = s.modality === 'Playa' ? 'playa' : s.category && s.category !== 'Mayor' ? 'juvenil' : 'mayor';
  const fechas = s.next_event ? rangoDias(s.next_event.start_date, s.next_event.end_date) : null;

  return (
    <li className={`tarjeta-seleccion tarjeta-seleccion--${tono}${activa ? ' tarjeta-seleccion--activa' : ''}`}>
      <div className="tarjeta-seleccion__imagen" aria-hidden="true">
        <CanchaPlano />
      </div>
      <div className="tarjeta-seleccion__cuerpo">
        <p className="tarjeta-seleccion__pastillas">
          {s.modality && <span className="pastilla pastilla--info">{s.modality}</span>}
          {s.branch && <span className="pastilla pastilla--neutra">{s.branch}</span>}
        </p>
        <h3 className="tarjeta-seleccion__nombre">{s.name}</h3>
        {s.next_event ? (
          <div className="tarjeta-seleccion__compromiso">
            <p className="tarjeta-seleccion__etiqueta">Próximo compromiso</p>
            <p className="tarjeta-seleccion__evento">{s.next_event.name}</p>
            <p>{[fechas, s.next_event.venue].filter(Boolean).join(' · ')}</p>
          </div>
        ) : (
          <p className="tarjeta-seleccion__sin">Sin compromisos programados</p>
        )}
        {s.callup_id ? (
          <button
            type="button"
            className="enlace-flecha boton-enlace tarjeta-seleccion__accion"
            aria-controls="convocatoria"
            onClick={() => onVerConvocatoria(s.id)}
          >
            Ver convocatoria<span className="visualmente-oculto"> de la {s.name}</span>
          </button>
        ) : (
          <p className="tarjeta-seleccion__sin tarjeta-seleccion__accion">Convocatoria por anunciar</p>
        )}
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------------------------------------
   Próximos compromisos
   ---------------------------------------------------------------------------------------------- */
function Compromisos({ eventos }) {
  if (!eventos.length) return null;
  return (
    <section className="bloque bloque--arena" aria-labelledby="titulo-compromisos">
      <div className="contenedor">
        <h2 id="titulo-compromisos" className="seccion-titulo selecciones-titulo">Próximos compromisos</h2>
        <div className="tarjeta-panel">
          <div className="tabla-desplazable">
            <table className="tabla-datos tabla-datos--izquierda">
              <caption className="visualmente-oculto">Próximos compromisos de las selecciones</caption>
              <thead>
                <tr>
                  <th scope="col">Fechas</th>
                  <th scope="col">Torneo</th>
                  <th scope="col">Sede</th>
                  <th scope="col">Selección</th>
                  <th scope="col">Modalidad</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td>{rangoDias(e.start_date, e.end_date) || 'Por definir'}</td>
                    <th scope="row" className="tabla-datos__nombre">{e.name}</th>
                    <td className="tabla-datos__nombre">{e.venue || 'Por definir'}</td>
                    <td className="tabla-datos__nombre">{e.teams.join(', ') || '—'}</td>
                    <td>{e.modality && <span className={`pastilla ${e.modality === 'Playa' ? 'pastilla--playa' : 'pastilla--info'}`}>{e.modality}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------
   Convocatoria
   ---------------------------------------------------------------------------------------------- */
function Convocatoria({ convocatoria: c, seleccion }) {
  const femenina = seleccion.branch === 'Femenina';
  return (
    <section className="bloque convocatoria" id="convocatoria" aria-labelledby="titulo-convocatoria" tabIndex={-1}>
      <div className="contenedor">
        <div className="convocatoria__encabezado">
          <div>
            <span className="antetitulo">Convocatoria vigente</span>
            <h2 id="titulo-convocatoria" className="seccion-titulo convocatoria__titulo">
              {seleccion.name}{c.title && ` · ${c.title}`}
            </h2>
          </div>
          {c.document_url && (
            <a href={c.document_url} target="_blank" rel="noopener noreferrer" className="boton boton--chico convocatoria__descarga">
              Descargar convocatoria<span className="visualmente-oculto"> (se abre en otra pestaña)</span>
            </a>
          )}
        </div>

        <div className="rejilla-lateral">
          <section className="tarjeta-panel" aria-labelledby="titulo-atletas">
            <header className="tarjeta-panel__cabecera">
              <h3 id="titulo-atletas" className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">
                {femenina ? 'Atletas convocadas' : 'Atletas convocados'}
              </h3>
              <p className="tarjeta-panel__nota">{c.players.length} en total</p>
            </header>
            {c.players.length ? (
              <ul className="convocatoria__atletas">
                {c.players.map((p, i) => (
                  <li key={`${p.number ?? 's'}-${p.name}-${i}`} className="convocatoria__atleta">
                    <span className="convocatoria__numero">
                      {p.number ? <><span className="visualmente-oculto">Número </span>{p.number}</> : '—'}
                    </span>
                    <div>
                      <p className="convocatoria__nombre">{p.name}</p>
                      <p className="convocatoria__detalle">{[p.position, p.club].filter(Boolean).join(' · ')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tarjeta-panel__vacio">La lista de atletas se publicará pronto.</p>
            )}
          </section>

          {c.staff.length > 0 && (
            <section className="tarjeta-panel" aria-labelledby="titulo-cuerpo">
              <header className="tarjeta-panel__cabecera">
                <h3 id="titulo-cuerpo" className="tarjeta-panel__titulo tarjeta-panel__titulo--chico">Cuerpo técnico</h3>
              </header>
              <ul className="convocatoria__cuerpo">
                {c.staff.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="convocatoria__miembro">
                    <span className="convocatoria__avatar" aria-hidden="true">{iniciales(p.name)}</span>
                    <div>
                      <p className="convocatoria__nombre">{p.name}</p>
                      {p.role && <p className="convocatoria__detalle">{p.role}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------
   Página
   ---------------------------------------------------------------------------------------------- */
export default function SeleccionesPublicas() {
  const [params, setParams] = useSearchParams();
  const carga = useCarga(() => obtenerSelecciones(), []);
  const datos = carga.datos?.datos;
  const selecciones = useMemo(() => datos?.national_teams || [], [datos]);

  const filtros = useMemo(
    () =>
      FILTROS.map((f) => {
        const opciones = opcionesDe(selecciones, f);
        const pedido = params.get(f.parametro);
        return { ...f, opciones, valor: opciones.some((o) => o.valor === pedido) ? pedido : TODAS };
      }),
    [selecciones, params]
  );

  function cambiar(cambios, opciones = {}) {
    const siguiente = new URLSearchParams(params);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === TODAS || valor === null) siguiente.delete(clave);
      else siguiente.set(clave, valor);
    }
    setParams(siguiente, { replace: true, ...opciones });
  }

  function verConvocatoria(seleccionId) {
    cambiar({ seleccion: seleccionId });
    // Se espera a que la sección muestre la nueva convocatoria antes de llevar el foco.
    requestAnimationFrame(() => {
      const destino = document.getElementById('convocatoria');
      destino?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      destino?.focus({ preventScroll: true });
    });
  }

  const cabecera = (
    <CabeceraSeccion
      titulo="Selecciones nacionales"
      bajada="Las selecciones de sala y de playa de Costa Rica: sus convocatorias y próximos compromisos."
      imagen={false}
      antes={<Migas items={[{ texto: 'Inicio', to: '/' }, { texto: 'Selecciones' }]} />}
    >
      {selecciones.length > 0 && (
        <div className="selecciones-filtros">
          {filtros
            .filter((f) => f.opciones.length > 2)
            .map((f) => (
              <Segmentado
                key={f.parametro}
                etiqueta={f.etiqueta}
                valor={f.valor}
                opciones={f.opciones}
                onCambiar={(v) => cambiar({ [f.parametro]: v })}
              />
            ))}
        </div>
      )}
    </CabeceraSeccion>
  );

  if (carga.estado !== 'listo') {
    return (
      <>
        {cabecera}
        <section className="bloque">
          <div className="contenedor">
            {carga.estado === 'cargando' ? (
              <Cargando texto="Cargando selecciones…" />
            ) : (
              <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />
            )}
          </div>
        </section>
      </>
    );
  }

  const visibles = selecciones.filter((s) => filtros.every((f) => f.valor === TODAS || s[f.campo] === f.valor));
  const modalidad = filtros[0].valor;
  const eventos = datos.events.filter((e) => modalidad === TODAS || e.modality === modalidad);

  // Convocatoria que se muestra: la de la selección elegida o, si no hay, la de la selección cuyo
  // próximo compromiso es el más cercano.
  const conConvocatoria = selecciones
    .filter((s) => s.callup_id && datos.callups.some((c) => c.id === s.callup_id))
    .sort((a, b) => (a.next_event?.start_date || '9999').localeCompare(b.next_event?.start_date || '9999'));
  const elegida = conConvocatoria.find((s) => s.id === params.get('seleccion')) || conConvocatoria[0] || null;
  const convocatoria = elegida ? datos.callups.find((c) => c.id === elegida.callup_id) : null;
  const filtrando = filtros.some((f) => f.valor !== TODAS);

  return (
    <>
      {cabecera}

      {carga.datos.ejemplo && (
        <div className="aviso-ejemplo" role="note">
          <div className="contenedor">
            <strong>Vista previa con datos de ejemplo.</strong> Solo aparece en desarrollo (<code>?demo</code>); la versión
            publicada muestra los datos reales o el estado vacío.
          </div>
        </div>
      )}

      {selecciones.length === 0 ? (
        <section className="bloque">
          <div className="contenedor">
            <SinResultados
              titulo="Pronto publicaremos las selecciones nacionales"
              texto="Aquí aparecerán las selecciones de sala y de playa, sus convocatorias y sus próximos compromisos."
            />
          </div>
        </section>
      ) : (
        <>
          <section className="bloque" aria-labelledby="titulo-selecciones-lista">
            <div className="contenedor">
              <h2 id="titulo-selecciones-lista" className="seccion-titulo selecciones-titulo">Nuestras selecciones</h2>
              {visibles.length === 0 ? (
                <SinResultados titulo="Ninguna selección coincide con los filtros">
                  {filtrando && (
                    <button
                      type="button"
                      className="boton boton--primario boton--chico"
                      onClick={() => cambiar({ modalidad: TODAS, rama: TODAS, categoria: TODAS })}
                    >
                      Quitar filtros
                    </button>
                  )}
                </SinResultados>
              ) : (
                <ul className="lista-selecciones">
                  {visibles.map((s) => (
                    <TarjetaSeleccion key={s.id} seleccion={s} activa={elegida?.id === s.id} onVerConvocatoria={verConvocatoria} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <Compromisos eventos={eventos} />

          {convocatoria && <Convocatoria convocatoria={convocatoria} seleccion={elegida} />}
        </>
      )}
    </>
  );
}
