// Panel de la asociación (Figma 04 · Panel): cifras, lo que requiere atención y estado de los equipos.
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Cifras, Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { estadoDocumento, listarDocumentos, listarEquipos, listarPersonas, nombrePersona, ESTADOS_EQUIPO } from '../../services/representante.js';
import { fechaCorta, fechaDiaMesCorto } from '../../utils/formato.js';
import { RUTA, useAsociacion } from './contexto.js';

const PRIORIDAD = { rechazado: 0, vencido: 1, 'por-vencer': 2, revision: 3 };

function titularDe(doc) {
  if (doc.persona) return nombrePersona(doc.persona);
  if (doc.equipo) return doc.equipo.name;
  return 'la asociación';
}

// Lo que el representante tiene que resolver, más urgente primero.
function pendientes(documentos, equipos) {
  const filas = [];
  for (const d of documentos) {
    const estado = estadoDocumento(d);
    if (estado.clave === 'vigente') continue;
    const titular = titularDe(d);
    const tipo = d.tipo?.value || 'Documento';
    const textos = {
      rechazado: { titulo: `Corregir: ${tipo} de ${titular}`, detalle: d.notes ? `Motivo: ${d.notes}` : 'Revise el motivo y cargue el documento corregido', etiqueta: 'Urgente', tono: 'error', accion: 'Reemplazar' },
      vencido: { titulo: `Vencido: ${tipo} de ${titular}`, detalle: d.expiry_date ? `Venció el ${fechaCorta(d.expiry_date)}` : 'Cargue uno vigente', etiqueta: 'Urgente', tono: 'error', accion: 'Renovar' },
      'por-vencer': { titulo: `Por vencer: ${tipo} de ${titular}`, detalle: `Vence el ${fechaDiaMesCorto(d.expiry_date)}: se puede renovar desde ahora`, etiqueta: 'Por vencer', tono: 'aviso', accion: 'Renovar' },
      revision: { titulo: `En revisión: ${tipo} de ${titular}`, detalle: 'FECOVOL lo está revisando; no necesita hacer nada', etiqueta: 'En revisión', tono: 'neutro', accion: null }
    }[estado.clave];
    filas.push({ clave: d.id, orden: PRIORIDAD[estado.clave], ...textos, to: RUTA.documentos });
  }
  for (const e of equipos) {
    if (e.status === 'ACTIVO' && !e.jugadores) {
      filas.push({ clave: e.id, orden: 2.5, titulo: `${e.name} no tiene jugadores en la nómina`, detalle: 'Agregue integrantes para poder inscribirlo en competencias', etiqueta: 'Pendiente', tono: 'aviso', accion: 'Abrir', to: RUTA.equipo(e.id) });
    }
  }
  return filas.sort((a, b) => a.orden - b.orden);
}

export default function Panel() {
  const { asociacion } = useAsociacion([{ texto: 'Panel' }]);
  const carga = useCarga(
    (signal) => Promise.all([listarEquipos({ signal }), listarDocumentos({}, { signal }), listarPersonas({}, { signal })])
      .then(([equipos, documentos, personas]) => ({ equipos, documentos, totalPersonas: personas.total ?? personas.data.length })),
    []
  );

  const acciones = (
    <>
      <Link to={RUTA.nuevaPersona} className="g-boton">Agregar persona</Link>
      <Link to={RUTA.nuevoEquipo} className="g-boton g-boton--acento">Registrar equipo</Link>
    </>
  );

  if (carga.estado !== 'listo') {
    return (
      <div className="g-pagina">
        <Encabezado titulo="Panel de la asociación" bajada={asociacion.name} acciones={acciones} />
        {carga.estado === 'cargando' ? <Cargando texto="Cargando el panel…" /> : <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />}
      </div>
    );
  }

  const { equipos, documentos, totalPersonas } = carga.datos;
  const estados = documentos.map((d) => estadoDocumento(d).clave);
  const porVencer = estados.filter((e) => e === 'por-vencer').length;
  const porAtender = estados.filter((e) => e === 'rechazado' || e === 'vencido').length;
  const lista = pendientes(documentos, equipos);

  return (
    <div className="g-pagina">
      <Encabezado titulo="Panel de la asociación" bajada={asociacion.name} acciones={acciones} />

      <Cifras
        items={[
          { valor: equipos.length, texto: 'Equipos registrados' },
          { valor: totalPersonas, texto: 'Personas registradas' },
          { valor: porVencer, texto: 'Documentos por vencer', tono: porVencer ? 'aviso' : undefined },
          { valor: porAtender, texto: 'Documentos por corregir', tono: porAtender ? 'error' : undefined }
        ]}
      />

      <div className="g-rejilla">
        <Tarjeta
          titulo="Requiere su atención"
          accion={lista.length > 6 ? <Link to={RUTA.documentos} className="g-enlace">Ver todo</Link> : null}
        >
          {lista.length === 0 ? (
            <p className="g-tarjeta__vacio">Todo al día: no hay documentos vencidos, rechazados ni por vencer.</p>
          ) : (
            <ul className="g-lista">
              {lista.slice(0, 6).map((f) => (
                <li key={f.clave} className="g-lista__fila">
                  <div className="g-lista__texto">
                    <p className="g-lista__titulo">{f.titulo}</p>
                    <p className="g-lista__detalle">{f.detalle}</p>
                  </div>
                  <div className="g-lista__acciones">
                    <Estado tono={f.tono}>{f.etiqueta}</Estado>
                    {f.accion && <Link to={f.to} className="g-boton g-boton--chico">{f.accion}</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Estado de sus equipos" accion={<Link to={RUTA.equipos} className="g-enlace">Ver equipos</Link>}>
          {equipos.length === 0 ? (
            <p className="g-tarjeta__vacio">
              Todavía no hay equipos. <Link to={RUTA.nuevoEquipo} className="g-enlace">Registrar el primero</Link>
            </p>
          ) : (
            <ul className="g-lista">
              {equipos.map((e) => {
                const estado = ESTADOS_EQUIPO[e.status] || { texto: e.status, tono: 'neutro' };
                return (
                  <li key={e.id} className="g-lista__fila">
                    <div className="g-lista__texto">
                      <p className="g-lista__titulo"><Link to={RUTA.equipo(e.id)} className="g-enlace">{e.name}</Link></p>
                      <p className="g-lista__detalle">
                        {e.jugadores} {e.jugadores === 1 ? 'jugador' : 'jugadores'} · {e.tecnicos} en cuerpo técnico
                      </p>
                    </div>
                    <Estado tono={estado.tono}>{estado.texto}</Estado>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
