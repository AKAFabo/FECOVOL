// Documentos (Figma 04 · Documentos): todos los documentos de la asociación, sus equipos y sus
// personas, con filtros y carga de archivos.
import { useMemo, useState } from 'react';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, OpcionesCatalogo, Tarjeta, useMensaje } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { estadoDocumento, listarDocumentos, listarEquipos, listarPersonas, nombrePersona, valoresCatalogo, MAXIMO_MB } from '../../services/representante.js';
import SubirDocumento from './SubirDocumento.jsx';
import TablaDocumentos, { titularDocumento } from './TablaDocumentos.jsx';
import { useAsociacion } from './contexto.js';

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ESTADOS = [
  { valor: 'vigente', texto: 'Vigentes' },
  { valor: 'por-vencer', texto: 'Por vencer' },
  { valor: 'revision', texto: 'En revisión' },
  { valor: 'rechazado', texto: 'Rechazados' },
  { valor: 'vencido', texto: 'Vencidos' }
];

// Opciones de titular: la asociación, sus equipos y sus personas.
function opcionesTitular(asociacion, equipos, personas) {
  return [
    { clave: `a:${asociacion.id}`, texto: `${asociacion.name} (asociación)`, titular: { association_id: asociacion.id } },
    ...equipos.map((e) => ({ clave: `e:${e.id}`, texto: `${e.name} (equipo)`, titular: { team_id: e.id } })),
    ...personas.map((p) => ({ clave: `p:${p.id}`, texto: nombrePersona(p), titular: { person_id: p.id } }))
  ];
}

function claveTitular(d) {
  if (d.persona) return `p:${d.persona.id}`;
  if (d.equipo) return `e:${d.equipo.id}`;
  return `a:${d.asociacion?.id}`;
}

export default function Documentos() {
  const { asociacion } = useAsociacion([{ texto: 'Documentos' }]);
  const [filtro, setFiltro] = useState({ tipo: '', estado: '', equipo: '', q: '' });
  const [subir, setSubir] = useState(null); // null | { tipo?, titular? }
  const [mensaje, mostrar] = useMensaje();

  const carga = useCarga(
    (signal) => Promise.all([
      listarDocumentos({}, { signal }),
      listarEquipos({ signal }),
      listarPersonas({}, { signal }),
      valoresCatalogo('Tipos de documento', { signal })
    ]).then(([documentos, equipos, personas, tipos]) => ({ documentos, equipos, personas: personas.data, tipos })),
    []
  );

  const visibles = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    const { personas } = carga.datos;
    const equiposDe = new Map(personas.map((p) => [p.id, (p.equipos || []).map((e) => e.id)]));
    const q = sinTildes(filtro.q.trim());
    return carga.datos.documentos.filter((d) => {
      if (filtro.tipo && d.tipo?.code !== filtro.tipo) return false;
      if (filtro.estado && estadoDocumento(d).clave !== filtro.estado) return false;
      if (filtro.equipo) {
        const enEquipo = d.equipo?.id === filtro.equipo || (d.persona && (equiposDe.get(d.persona.id) || []).includes(filtro.equipo));
        if (!enEquipo) return false;
      }
      return !q || sinTildes(titularDocumento(d).nombre).includes(q);
    });
  }, [carga, filtro]);

  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const botonSubir = (
    <button type="button" className="g-boton g-boton--acento" onClick={() => setSubir({})} disabled={carga.estado !== 'listo'}>
      Subir documento
    </button>
  );

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Documentos" bajada={asociacion.name} acciones={botonSubir} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando documentos…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
        {mensaje}
      </div>
    );
  }

  const { documentos, equipos, personas, tipos } = carga.datos;
  const cuenta = (clave) => documentos.filter((d) => estadoDocumento(d).clave === clave).length;
  const opciones = opcionesTitular(asociacion, equipos, personas);

  return (
    <div className="g-pagina">
      <Encabezado
        titulo="Documentos"
        bajada={`${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} · ${equipos.length} ${equipos.length === 1 ? 'equipo' : 'equipos'}`}
        acciones={botonSubir}
      />

      <Cifras
        items={[
          { valor: cuenta('vigente'), texto: 'Vigentes', tono: 'ok' },
          { valor: cuenta('por-vencer'), texto: 'Por vencer en 30 días', tono: cuenta('por-vencer') ? 'aviso' : undefined },
          { valor: cuenta('revision'), texto: 'En revisión de FECOVOL' },
          { valor: cuenta('rechazado') + cuenta('vencido'), texto: 'Rechazados o vencidos', tono: cuenta('rechazado') + cuenta('vencido') ? 'error' : undefined }
        ]}
      />

      <div className="g-filtros" role="search" aria-label="Filtrar documentos">
        <label className="visualmente-oculto" htmlFor="d-tipo">Tipo</label>
        <select id="d-tipo" className="g-control" value={filtro.tipo} onChange={cambiar('tipo')}>
          <OpcionesCatalogo valores={tipos} vacia="Tipo: todos" />
        </select>
        <label className="visualmente-oculto" htmlFor="d-estado">Estado</label>
        <select id="d-estado" className="g-control" value={filtro.estado} onChange={cambiar('estado')}>
          <option value="">Estado: todos</option>
          {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="d-equipo">Equipo</label>
        <select id="d-equipo" className="g-control" value={filtro.equipo} onChange={cambiar('equipo')}>
          <option value="">Equipo: todos</option>
          {equipos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="d-q">Buscar por persona o equipo</label>
          <input id="d-q" type="search" className="g-control" placeholder="Buscar por persona o equipo…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <div className="g-rejilla">
        <section className="g-tarjeta" aria-label="Lista de documentos">
          <TablaDocumentos
            documentos={visibles}
            vacio={documentos.length ? 'Ningún documento coincide con los filtros.' : 'Todavía no hay documentos cargados.'}
            onReemplazar={(d) => setSubir({ tipo: d.tipo?.code, titular: claveTitular(d) })}
          />
          <div className="g-tarjeta__pie">{visibles.length} de {documentos.length} documentos</div>
        </section>

        <div className="g-columna">
          <Tarjeta titulo="Subir documentos">
            <div className="g-tarjeta__cuerpo">
              <div className="g-soltar">
                <p className="g-soltar__titulo">PDF o imagen</p>
                <p className="g-soltar__detalle">Hasta {MAXIMO_MB} MB por archivo</p>
                <button type="button" className="g-boton g-boton--chico" onClick={() => setSubir({})}>Seleccionar archivo</button>
              </div>
            </div>
          </Tarjeta>
        </div>
      </div>

      {subir && (
        <SubirDocumento
          key={`${subir.titular || ''}-${subir.tipo || ''}`}
          tipos={tipos}
          titulares={subir.titular ? [opciones.find((o) => o.clave === subir.titular), ...opciones.filter((o) => o.clave !== subir.titular)].filter(Boolean) : opciones}
          tipoInicial={subir.tipo || ''}
          onCerrar={() => setSubir(null)}
          onSubido={() => { setSubir(null); mostrar('Documento cargado. Queda en revisión de FECOVOL.'); carga.reintentar(); }}
        />
      )}
      {mensaje}
    </div>
  );
}
