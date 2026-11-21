// Personas (Figma 04 · Personas): atletas y cuerpo técnico de la asociación.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { coincidePersona, estadoDocumento, listarDocumentos, listarEquipos, listarPersonas, nombrePersona, ROLES_PERSONA } from '../../services/representante.js';
import { RUTA, useAsociacion } from './contexto.js';

const rolesActivos = (p) => (p.person_roles || []).filter((r) => r.is_active).map((r) => r.role_type);

// Resumen de documentos por persona: cuántos tiene y cuántos requieren acción.
function resumenDocumentos(documentos) {
  const r = {};
  for (const d of documentos) {
    if (!d.persona) continue;
    const e = estadoDocumento(d).clave;
    const x = (r[d.persona.id] = r[d.persona.id] || { total: 0, accion: 0, porVencer: 0, revision: 0 });
    x.total += 1;
    if (e === 'rechazado' || e === 'vencido') x.accion += 1;
    if (e === 'por-vencer') x.porVencer += 1;
    if (e === 'revision') x.revision += 1;
  }
  return r;
}

function TextoDocumentos({ r }) {
  if (!r) return <span className="g-tabla__aviso">Sin documentos</span>;
  if (r.accion) return <span className="g-tabla__aviso">{r.accion} por corregir</span>;
  if (r.porVencer) return <span className="g-tabla__aviso">{r.porVencer} por vencer</span>;
  if (r.revision) return <>{r.revision} en revisión</>;
  return <>Al día ({r.total})</>;
}

export default function Personas() {
  const { asociacion } = useAsociacion([{ texto: 'Personas' }]);
  const [filtro, setFiltro] = useState({ rol: '', equipo: '', documentos: '', q: '' });

  const carga = useCarga(
    (signal) => Promise.all([listarPersonas({}, { signal }), listarEquipos({ signal }), listarDocumentos({}, { signal })])
      .then(([personas, equipos, documentos]) => ({
        personas: personas.data,
        total: personas.total ?? personas.data.length,
        equipos,
        docs: resumenDocumentos(documentos)
      })),
    []
  );

  const visibles = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    return carga.datos.personas.filter((p) => {
      if (filtro.rol && !rolesActivos(p).includes(filtro.rol)) return false;
      if (filtro.equipo && !(p.equipos || []).some((e) => e.id === filtro.equipo)) return false;
      const r = carga.datos.docs[p.id];
      if (filtro.documentos === 'sin' && r) return false;
      if (filtro.documentos === 'pendientes' && !(r && (r.accion || r.porVencer))) return false;
      if (filtro.documentos === 'al-dia' && !(r && !r.accion && !r.porVencer)) return false;
      return coincidePersona(p, filtro.q);
    });
  }, [carga, filtro]);

  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const acciones = <Link to={RUTA.nuevaPersona} className="g-boton g-boton--acento">Agregar persona</Link>;

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Personas" bajada={asociacion.name} acciones={acciones} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando personas…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
      </div>
    );
  }

  const { personas, total, equipos, docs } = carga.datos;
  const atletas = personas.filter((p) => rolesActivos(p).includes('JUGADOR')).length;
  const tecnicos = personas.filter((p) => rolesActivos(p).includes('TECNICO')).length;
  const pendientes = personas.filter((p) => !docs[p.id] || docs[p.id].accion).length;

  return (
    <div className="g-pagina">
      <Encabezado titulo="Personas" bajada={`${total} ${total === 1 ? 'persona' : 'personas'} en ${asociacion.name}`} acciones={acciones} />

      <Cifras
        items={[
          { valor: total, texto: 'Personas en la asociación' },
          { valor: atletas, texto: 'Atletas' },
          { valor: tecnicos, texto: 'Cuerpo técnico' },
          { valor: pendientes, texto: 'Sin documentos o por corregir', tono: pendientes ? 'aviso' : undefined }
        ]}
      />

      <div className="g-filtros" role="search" aria-label="Filtrar personas">
        <label className="visualmente-oculto" htmlFor="p-rol">Participa como</label>
        <select id="p-rol" className="g-control" value={filtro.rol} onChange={cambiar('rol')}>
          <option value="">Participa como: todos</option>
          <option value="JUGADOR">Atleta</option>
          <option value="TECNICO">Cuerpo técnico</option>
        </select>
        <label className="visualmente-oculto" htmlFor="p-equipo">Equipo</label>
        <select id="p-equipo" className="g-control" value={filtro.equipo} onChange={cambiar('equipo')}>
          <option value="">Equipo: todos</option>
          {equipos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="visualmente-oculto" htmlFor="p-docs">Documentos</label>
        <select id="p-docs" className="g-control" value={filtro.documentos} onChange={cambiar('documentos')}>
          <option value="">Documentos: todos</option>
          <option value="al-dia">Al día</option>
          <option value="pendientes">Por corregir o por vencer</option>
          <option value="sin">Sin documentos</option>
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="p-q">Buscar por nombre o identificación</label>
          <input id="p-q" type="search" className="g-control" placeholder="Buscar por nombre o identificación…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <section className="g-tarjeta" aria-label="Personas">
        {personas.length === 0 ? (
          <SinResultados titulo="Todavía no hay personas" texto="Registre a los atletas y al cuerpo técnico para armar las nóminas.">
            <Link to={RUTA.nuevaPersona} className="g-boton g-boton--acento">Agregar persona</Link>
          </SinResultados>
        ) : visibles.length === 0 ? (
          <p className="g-tarjeta__vacio">Ninguna persona coincide con los filtros.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Personas de la asociación</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Participa como</th>
                  <th scope="col">Equipos</th>
                  <th scope="col">Documentos</th>
                  <th scope="col">Identidad</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {nombrePersona(p)}
                      <span className="g-tabla__sub">{p.document_number}</span>
                    </th>
                    <td>{rolesActivos(p).map((r) => ROLES_PERSONA[r] || r).join(' · ') || '—'}</td>
                    <td>{(p.equipos || []).map((e) => e.short_name || e.name).join(' · ') || '—'}</td>
                    <td><TextoDocumentos r={docs[p.id]} /></td>
                    <td>{p.is_verified ? <Estado tono="ok">Verificada</Estado> : <Estado tono="neutro">Por verificar</Estado>}</td>
                    <td className="g-tabla__accion">
                      <Link to={RUTA.persona(p.id)} className="g-boton g-boton--chico" aria-label={`Ver ficha de ${nombrePersona(p)}`}>Ver ficha</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {personas.length > 0 && (
          <div className="g-tarjeta__pie">
            {visibles.length} de {personas.length} personas
            {total > personas.length && <span> · Se muestran las primeras {personas.length} en orden alfabético.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
