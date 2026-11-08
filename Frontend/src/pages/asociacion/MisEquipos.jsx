// Mis equipos (Figma 04 · Mis equipos): lista con filtros y estado de la documentación.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, SinResultados } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, OpcionesCatalogo } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { estadoDocumento, listarDocumentos, listarEquipos, listarPersonas, valoresCatalogo, ESTADOS_EQUIPO } from '../../services/representante.js';
import { RUTA, useAsociacion } from './contexto.js';

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Documentos sin resolver por equipo: los del equipo y los de sus integrantes.
function pendientesPorEquipo(documentos, personas) {
  const equiposDe = new Map(personas.map((p) => [p.id, (p.equipos || []).map((e) => e.id)]));
  const conteo = {};
  for (const d of documentos) {
    if (estadoDocumento(d).clave === 'vigente') continue;
    const equipos = d.equipo ? [d.equipo.id] : d.persona ? equiposDe.get(d.persona.id) || [] : [];
    for (const id of equipos) conteo[id] = (conteo[id] || 0) + 1;
  }
  return conteo;
}

export default function MisEquipos() {
  const { asociacion } = useAsociacion([{ texto: 'Mis equipos' }]);
  const [filtro, setFiltro] = useState({ categoria: '', rama: '', estado: '', q: '' });

  const carga = useCarga(
    (signal) => Promise.all([
      listarEquipos({ signal }),
      listarDocumentos({}, { signal }),
      listarPersonas({}, { signal }),
      valoresCatalogo('Categorías', { signal }),
      valoresCatalogo('Ramas', { signal })
    ]).then(([equipos, documentos, personas, categorias, ramas]) => ({
      equipos,
      pendientes: pendientesPorEquipo(documentos, personas.data),
      totalPersonas: personas.total ?? personas.data.length,
      categorias,
      ramas
    })),
    []
  );

  const visibles = useMemo(() => {
    if (carga.estado !== 'listo') return [];
    const q = sinTildes(filtro.q.trim());
    return carga.datos.equipos.filter((e) =>
      (!filtro.categoria || e.categoria?.code === filtro.categoria) &&
      (!filtro.rama || e.rama?.code === filtro.rama) &&
      (!filtro.estado || e.status === filtro.estado) &&
      (!q || sinTildes(`${e.name} ${e.short_name || ''}`).includes(q)));
  }, [carga, filtro]);

  const cambiar = (campo) => (e) => setFiltro((f) => ({ ...f, [campo]: e.target.value }));
  const acciones = <Link to={RUTA.nuevoEquipo} className="g-boton g-boton--acento">Registrar equipo</Link>;

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Mis equipos" bajada={asociacion.name} acciones={acciones} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando equipos…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
      </div>
    );
  }

  const { equipos, pendientes, totalPersonas, categorias, ramas } = carga.datos;
  const enNomina = equipos.reduce((s, e) => s + (e.jugadores || 0) + (e.tecnicos || 0), 0);
  const conPendientes = equipos.filter((e) => pendientes[e.id]).length;

  return (
    <div className="g-pagina">
      <Encabezado titulo="Mis equipos" bajada={asociacion.name} acciones={acciones} />

      <Cifras
        items={[
          { valor: equipos.length, texto: 'Equipos registrados' },
          { valor: enNomina, texto: 'Integrantes en nóminas' },
          { valor: totalPersonas, texto: 'Personas de la asociación' },
          { valor: conPendientes, texto: 'Equipos con documentos pendientes', tono: conPendientes ? 'aviso' : undefined }
        ]}
      />

      <div className="g-filtros" role="search" aria-label="Filtrar equipos">
        <label className="visualmente-oculto" htmlFor="f-categoria">Categoría</label>
        <select id="f-categoria" className="g-control" value={filtro.categoria} onChange={cambiar('categoria')}>
          <OpcionesCatalogo valores={categorias} vacia="Categoría: todas" />
        </select>
        <label className="visualmente-oculto" htmlFor="f-rama">Rama</label>
        <select id="f-rama" className="g-control" value={filtro.rama} onChange={cambiar('rama')}>
          <OpcionesCatalogo valores={ramas} vacia="Rama: todas" />
        </select>
        <label className="visualmente-oculto" htmlFor="f-estado">Estado</label>
        <select id="f-estado" className="g-control" value={filtro.estado} onChange={cambiar('estado')}>
          <option value="">Estado: todos</option>
          {Object.entries(ESTADOS_EQUIPO).map(([code, e]) => <option key={code} value={code}>{e.texto}</option>)}
        </select>
        <div className="g-filtros__busqueda">
          <label className="visualmente-oculto" htmlFor="f-q">Buscar equipo</label>
          <input id="f-q" type="search" className="g-control" placeholder="Buscar equipo…" value={filtro.q} onChange={cambiar('q')} maxLength={80} />
        </div>
      </div>

      <section className="g-tarjeta" aria-label="Equipos">
        {equipos.length === 0 ? (
          <SinResultados titulo="Todavía no hay equipos" texto="Registre el primer equipo de la asociación para armar su nómina.">
            <Link to={RUTA.nuevoEquipo} className="g-boton g-boton--acento">Registrar equipo</Link>
          </SinResultados>
        ) : visibles.length === 0 ? (
          <p className="g-tarjeta__vacio">Ningún equipo coincide con los filtros.</p>
        ) : (
          <div className="g-tabla-envoltura">
            <table className="g-tabla">
              <caption className="visualmente-oculto">Equipos de la asociación</caption>
              <thead>
                <tr>
                  <th scope="col">Equipo</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Rama</th>
                  <th scope="col">Integrantes</th>
                  <th scope="col">Documentación</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const estado = ESTADOS_EQUIPO[e.status] || { texto: e.status, tono: 'neutro' };
                  const n = pendientes[e.id] || 0;
                  return (
                    <tr key={e.id}>
                      <th scope="row">
                        {e.name}
                        <span className="g-tabla__sub">{e.modalidad?.value || ''}</span>
                      </th>
                      <td>{e.categoria?.value || '—'}</td>
                      <td>{e.rama?.value || '—'}</td>
                      <td>{e.jugadores} {e.jugadores === 1 ? 'jugador' : 'jugadores'} · {e.tecnicos} {e.tecnicos === 1 ? 'técnico' : 'técnicos'}</td>
                      <td>{n ? <Estado tono="aviso">{n} {n === 1 ? 'pendiente' : 'pendientes'}</Estado> : <Estado tono="ok">Al día</Estado>}</td>
                      <td><Estado tono={estado.tono}>{estado.texto}</Estado></td>
                      <td className="g-tabla__accion">
                        <Link to={RUTA.equipo(e.id)} className="g-boton g-boton--chico" aria-label={`Abrir ${e.name}`}>Abrir</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {equipos.length > 0 && <div className="g-tarjeta__pie">{visibles.length} de {equipos.length} equipos</div>}
      </section>
    </div>
  );
}
