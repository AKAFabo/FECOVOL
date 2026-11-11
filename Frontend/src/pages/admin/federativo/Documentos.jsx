// Documentos y licencias (FECOVOL): bandeja de revisión de los documentos que cargan las
// asociaciones, con los que vencen pronto y los que hay que corregir.
import { useMemo, useState } from 'react';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Cifras, Confirmar, Encabezado, OpcionesCatalogo, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { listarAsociaciones, vencerDocumentos } from '../../../services/administracion.js';
import { estadoDocumento, listarDocumentos, valoresCatalogo } from '../../../services/representante.js';
import TablaDocumentos, { titularDocumento } from '../../asociacion/TablaDocumentos.jsx';
import { plural } from '../../../utils/formato.js';
import RevisarDocumento from './RevisarDocumento.jsx';

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const VISTAS = [
  { valor: 'revision', texto: 'Por revisar' },
  { valor: 'por-vencer', texto: 'Por vencer' },
  { valor: 'corregir', texto: 'Rechazados o vencidos' },
  { valor: 'todos', texto: 'Todos' }
];

function enVista(d, vista) {
  const e = estadoDocumento(d).clave;
  if (vista === 'revision') return e === 'revision';
  if (vista === 'por-vencer') return e === 'por-vencer';
  if (vista === 'corregir') return e === 'rechazado' || e === 'vencido';
  return true;
}

export default function Documentos() {
  const [vista, setVista] = useState('revision');
  const [filtro, setFiltro] = useState({ tipo: '', asociacion: '', q: '' });
  const [modal, setModal] = useState(null);
  const [mensaje, mostrar] = useMensaje();

  const carga = useCarga(
    (signal) => Promise.all([listarDocumentos({}, { signal }), valoresCatalogo('Tipos de documento', { signal }), listarAsociaciones({}, { signal })])
      .then(([documentos, tipos, asociaciones]) => ({ documentos, tipos, asociaciones })),
    []
  );

  const visibles = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    const q = sinTildes(filtro.q.trim());
    return carga.datos.documentos
      .filter((d) => enVista(d, vista))
      .filter((d) => (!filtro.tipo || d.tipo?.code === filtro.tipo)
        && (!filtro.asociacion || d.asociacion?.id === filtro.asociacion)
        && (!q || sinTildes(`${titularDocumento(d).nombre} ${d.asociacion?.name || ''}`).includes(q)))
      // Los que llevan más tiempo esperando, primero.
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }, [carga, vista, filtro]);

  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const acciones = (
    <button type="button" className="g-boton" onClick={() => setModal({ tipo: 'vencer' })} disabled={carga.estado !== 'listo'}>
      Marcar vencidos
    </button>
  );

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Documentos y licencias" acciones={acciones} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando documentos…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
        {mensaje}
      </div>
    );
  }

  const { documentos, tipos, asociaciones } = carga.datos;
  const cuenta = (v) => documentos.filter((d) => enVista(d, v)).length;

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Documentos y licencias"
        bajada="Documentos de asociaciones, equipos y personas. Los nuevos llegan en revisión."
        acciones={acciones}
      />

      <Cifras
        items={[
          { valor: cuenta('revision'), texto: 'Por revisar', tono: cuenta('revision') ? 'aviso' : undefined },
          { valor: cuenta('por-vencer'), texto: 'Vencen en 30 días' },
          { valor: cuenta('corregir'), texto: 'Rechazados o vencidos', tono: cuenta('corregir') ? 'error' : undefined },
          { valor: documentos.length, texto: 'Documentos en total' }
        ]}
      />

      <div className="g-pestanas" role="tablist" aria-label="Bandeja de documentos">
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            type="button"
            role="tab"
            aria-selected={vista === v.valor}
            aria-controls="panel-documentos"
            tabIndex={vista === v.valor ? 0 : -1}
            className="g-pestana"
            onClick={() => setVista(v.valor)}
            onKeyDown={(e) => {
              const i = VISTAS.findIndex((x) => x.valor === vista);
              const destino = { ArrowRight: (i + 1) % VISTAS.length, ArrowLeft: (i - 1 + VISTAS.length) % VISTAS.length }[e.key];
              if (destino === undefined) return;
              e.preventDefault();
              setVista(VISTAS[destino].valor);
              e.currentTarget.parentElement.children[destino]?.focus();
            }}
          >
            {v.texto} ({cuenta(v.valor)})
          </button>
        ))}
      </div>

      <div className="g-filtros" role="search" aria-label="Filtrar documentos">
        <label className="visualmente-oculto" htmlFor="df-tipo">Tipo</label>
        <select id="df-tipo" className="g-control" value={filtro.tipo} onChange={cambiar('tipo')}>
          <OpcionesCatalogo valores={tipos} vacia="Tipo: todos" />
        </select>
        <label className="visualmente-oculto" htmlFor="df-aso">Asociación</label>
        <select id="df-aso" className="g-control" value={filtro.asociacion} onChange={cambiar('asociacion')}>
          <option value="">Asociación: todas</option>
          {asociaciones.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="df-q">Buscar por persona, equipo o asociación</label>
          <input id="df-q" type="search" className="g-control" placeholder="Buscar por persona, equipo o asociación…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <section id="panel-documentos" role="tabpanel" className="g-tarjeta" aria-label="Documentos">
        <TablaDocumentos
          documentos={visibles}
          conAsociacion
          vacio={vista === 'revision' ? 'No hay documentos esperando revisión.' : 'Ningún documento coincide.'}
          onRevisar={(d) => setModal({ tipo: 'revisar', documento: d })}
        />
        <div className="g-tarjeta__pie">{plural(visibles.length, 'documento', 'documentos')}</div>
      </section>

      {modal?.tipo === 'revisar' && (
        <RevisarDocumento
          documento={modal.documento}
          onCerrar={() => setModal(null)}
          onRevisado={(d) => { setModal(null); mostrar(d === 'VIGENTE' ? 'Documento aprobado.' : 'Documento rechazado; la asociación verá el motivo.'); carga.reintentar(); }}
        />
      )}
      {modal?.tipo === 'vencer' && (
        <Confirmar
          titulo="Marcar documentos vencidos"
          texto="Los documentos vigentes cuya fecha de vencimiento ya pasó quedarán como vencidos. Las asociaciones verán que deben renovarlos."
          textoAccion="Marcar vencidos"
          onCerrar={() => setModal(null)}
          onConfirmar={async () => {
            const r = await vencerDocumentos();
            setModal(null);
            mostrar(`${r?.vencidos ?? 0} documentos marcados como vencidos.`);
            carga.reintentar();
          }}
        />
      )}
      {mensaje}
    </div>
  );
}
