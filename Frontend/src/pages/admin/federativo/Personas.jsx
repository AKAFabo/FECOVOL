// Personas federadas (Figma 02 · Personas federadas): registro central de atletas, cuerpo técnico
// y árbitros de todas las asociaciones. La búsqueda y los filtros de asociación y tipo se hacen
// en el servidor; el de documentos, sobre lo que llega.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { listarAsociaciones, listarPersonasFecovol, resumenPadron } from '../../../services/administracion.js';
import { estadoDocumento, listarDocumentos, nombrePersona, ROLES_PERSONA } from '../../../services/representante.js';
import { RUTA_ADMIN as RUTA } from '../../asociacion/contexto.js';

const rolesActivos = (p) => (p.person_roles || []).filter((r) => r.is_active).map((r) => r.role_type);

function resumenDocumentos(documentos) {
  const r = {};
  for (const d of documentos) {
    if (!d.persona) continue;
    const e = estadoDocumento(d).clave;
    const x = (r[d.persona.id] = r[d.persona.id] || { total: 0, corregir: 0, porVencer: 0, revision: 0 });
    x.total += 1;
    if (e === 'rechazado' || e === 'vencido') x.corregir += 1;
    if (e === 'por-vencer') x.porVencer += 1;
    if (e === 'revision') x.revision += 1;
  }
  return r;
}

function TextoDocumentos({ r }) {
  if (!r) return <span className="g-tabla__aviso">Sin documentos</span>;
  if (r.corregir) return <span className="g-tabla__aviso">{r.corregir} por corregir</span>;
  if (r.revision) return <>{r.revision} por revisar</>;
  if (r.porVencer) return <span className="g-tabla__aviso">{r.porVencer} por vencer</span>;
  return <>Al día ({r.total})</>;
}

/** Espera a que se deje de escribir antes de buscar en el servidor. */
function useDemorado(valor, ms = 350) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

export default function Personas() {
  const [filtro, setFiltro] = useState({ asociacion: '', rol: '', documentos: '', q: '' });
  const q = useDemorado(filtro.q.trim());
  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));

  const base = useCarga(
    (signal) => Promise.all([resumenPadron({ signal }), listarAsociaciones({}, { signal }), listarDocumentos({}, { signal })])
      .then(([resumen, asociaciones, documentos]) => ({ resumen, asociaciones, docs: resumenDocumentos(documentos) })),
    []
  );
  const lista = useCarga(
    (signal) => listarPersonasFecovol({ association_id: filtro.asociacion, role: filtro.rol, q: q.length >= 2 ? q : '' }, { signal }),
    [filtro.asociacion, filtro.rol, q]
  );

  const docs = base.datos?.docs || {};
  const visibles = useMemo(() => {
    if (lista.estado !== 'listo') return [];
    return lista.datos.data.filter((p) => {
      const r = docs[p.id];
      if (filtro.documentos === 'sin') return !r;
      if (filtro.documentos === 'corregir') return r && r.corregir;
      if (filtro.documentos === 'revision') return r && r.revision;
      if (filtro.documentos === 'al-dia') return r && !r.corregir && !r.porVencer && !r.revision;
      return true;
    });
  }, [lista, docs, filtro.documentos]);

  const acciones = <Link to={RUTA.nuevaPersona} className="g-boton g-boton--primario">Registrar persona</Link>;
  const resumen = base.datos?.resumen;
  const conPendientes = Object.values(docs).filter((r) => r.corregir).length;
  const nombreAsociacion = Object.fromEntries((base.datos?.asociaciones || []).map((a) => [a.id, a.short_name || a.name]));

  return (
    <div className="g-pagina">
      <Encabezado titulo="Personas federadas" bajada={resumen ? `${resumen.total} personas en el padrón` : null} acciones={acciones} />

      {base.estado === 'error' && <ErrorCarga mensaje={base.error.message} onReintentar={base.reintentar} />}
      {resumen && (
        <Cifras
          items={[
            { valor: resumen.total, texto: 'Personas federadas' },
            { valor: resumen.jugadores, texto: 'Atletas' },
            { valor: resumen.tecnicos, texto: 'Cuerpo técnico' },
            { valor: resumen.arbitros, texto: 'Cuerpo arbitral' },
            { valor: conPendientes, texto: 'Con documentos por corregir', tono: conPendientes ? 'aviso' : undefined }
          ]}
        />
      )}

      <div className="g-filtros" role="search" aria-label="Filtrar personas">
        <label className="visualmente-oculto" htmlFor="pf-aso">Asociación</label>
        <select id="pf-aso" className="g-control" value={filtro.asociacion} onChange={cambiar('asociacion')}>
          <option value="">Asociación: todas</option>
          {(base.datos?.asociaciones || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="pf-rol">Tipo</label>
        <select id="pf-rol" className="g-control" value={filtro.rol} onChange={cambiar('rol')}>
          <option value="">Tipo: todos</option>
          <option value="JUGADOR">Atletas</option>
          <option value="TECNICO">Cuerpo técnico</option>
          <option value="ARBITRO">Árbitros</option>
        </select>
        <label className="visualmente-oculto" htmlFor="pf-docs">Documentos</label>
        <select id="pf-docs" className="g-control" value={filtro.documentos} onChange={cambiar('documentos')}>
          <option value="">Documentos: todos</option>
          <option value="al-dia">Al día</option>
          <option value="revision">Por revisar</option>
          <option value="corregir">Por corregir</option>
          <option value="sin">Sin documentos</option>
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="pf-q">Buscar por nombre o cédula</label>
          <input id="pf-q" type="search" className="g-control" placeholder="Buscar por nombre o cédula…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <section className="g-tarjeta" aria-label="Personas" aria-busy={lista.estado === 'cargando'}>
        {lista.estado === 'cargando' && <Cargando texto="Cargando personas…" />}
        {lista.estado === 'error' && <ErrorCarga mensaje={lista.error.message} onReintentar={lista.reintentar} />}
        {lista.estado === 'listo' && (visibles.length === 0 ? (
          <p className="g-tarjeta__vacio">Ninguna persona coincide con la búsqueda.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Personas federadas</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Asociación</th>
                  <th scope="col">Participa como</th>
                  <th scope="col">Documentos</th>
                  <th scope="col">Identidad</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{nombrePersona(p)}<span className="g-tabla__sub">{p.document_number}</span></th>
                    <td>{p.asociacion?.short_name || p.asociacion?.name || nombreAsociacion[p.association_id] || 'Sin asociación'}</td>
                    <td>{rolesActivos(p).map((r) => ROLES_PERSONA[r] || r).join(' · ') || '—'}</td>
                    <td><TextoDocumentos r={docs[p.id]} /></td>
                    <td>{p.is_verified ? <Estado tono="ok">Verificada</Estado> : <Estado tono="neutro">Por verificar</Estado>}</td>
                    <td className="g-tabla__accion">
                      <Link to={RUTA.persona(p.id)} className="g-boton g-boton--chico">Abrir ficha<span className="visualmente-oculto"> de {nombrePersona(p)}</span></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {lista.estado === 'listo' && (
          <div className="g-tarjeta__pie">
            {visibles.length} de {lista.datos.total ?? lista.datos.data.length} personas
            {(lista.datos.total ?? 0) > lista.datos.data.length && <span> · Se muestran las primeras {lista.datos.data.length}; use la búsqueda o los filtros.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
