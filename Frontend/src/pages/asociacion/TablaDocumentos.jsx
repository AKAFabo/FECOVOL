// Tabla de documentos con su estado y las acciones Ver (enlace firmado) y Reemplazar/Renovar.
import { useState } from 'react';
import { Estado } from '../../components/gestion/Gestion.jsx';
import { abrirDocumento, estadoDocumento, nombrePersona } from '../../services/representante.js';
import { fechaCorta } from '../../utils/formato.js';

export function titularDocumento(d) {
  if (d.persona) return { nombre: nombrePersona(d.persona), detalle: 'Persona' };
  if (d.equipo) return { nombre: d.equipo.name, detalle: 'Equipo' };
  return { nombre: d.asociacion?.name || 'Asociación', detalle: 'Asociación' };
}

/**
 * @param {object} props
 * @param {object[]} props.documentos
 * @param {boolean} [props.conTitular]  Muestra la columna "Persona o equipo".
 * @param {(doc: object) => void} [props.onReemplazar]
 * @param {(doc: object) => void} [props.onRevisar]  FECOVOL: aprobar o rechazar los que están en revisión.
 */
export default function TablaDocumentos({ documentos, conTitular = true, conAsociacion = false, onReemplazar, onRevisar, vacio = 'No hay documentos.' }) {
  const [abriendo, setAbriendo] = useState(null);
  const [error, setError] = useState(null);

  async function ver(doc) {
    setError(null);
    setAbriendo(doc.id);
    try {
      await abrirDocumento(doc.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setAbriendo(null);
    }
  }

  if (!documentos.length) return <p className="g-tarjeta__vacio">{vacio}</p>;

  return (
    <>
      {error && <p className="g-aviso g-aviso--error" role="alert" style={{ margin: 16 }}>{error}</p>}
      <div className="g-tabla-envoltura">
        <table className="g-tabla">
          <caption className="visualmente-oculto">Documentos</caption>
          <thead>
            <tr>
              {conTitular && <th scope="col">Persona o equipo</th>}
              <th scope="col">Documento</th>
              <th scope="col">Vence</th>
              <th scope="col">Estado</th>
              <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((d) => {
              const estado = estadoDocumento(d);
              const titular = titularDocumento(d);
              const reemplazable = ['rechazado', 'vencido', 'por-vencer'].includes(estado.clave);
              return (
                <tr key={d.id}>
                  {conTitular && (
                    <th scope="row">
                      {titular.nombre}
                      <span className="g-tabla__sub">
                        {conAsociacion && d.asociacion && d.titular !== 'ASOCIACION' ? `${titular.detalle} · ${d.asociacion.name}` : titular.detalle}
                      </span>
                    </th>
                  )}
                  <td>
                    {d.tipo?.value || 'Documento'}
                    {d.file_name && <span className="g-tabla__sub">{d.file_name}</span>}
                    {estado.clave === 'rechazado' && d.notes && <span className="g-tabla__sub g-tabla__aviso">Motivo: {d.notes}</span>}
                  </td>
                  <td className="g-tabla__fecha">{d.expiry_date ? fechaCorta(d.expiry_date) : 'Sin vencimiento'}</td>
                  <td><Estado tono={estado.tono}>{estado.texto}</Estado></td>
                  <td className="g-tabla__accion">
                    <span style={{ display: 'inline-flex', gap: 8 }}>
                      {d.tiene_archivo && (
                        <button type="button" className="g-boton g-boton--chico" onClick={() => ver(d)} disabled={abriendo === d.id} aria-label={`Ver ${d.tipo?.value || 'documento'} de ${titular.nombre}`}>
                          {abriendo === d.id ? 'Abriendo…' : 'Ver'}
                        </button>
                      )}
                      {onRevisar && d.status === 'EN_REVISION' && (
                        <button type="button" className="g-boton g-boton--chico g-boton--primario" onClick={() => onRevisar(d)}>
                          Revisar<span className="visualmente-oculto"> {d.tipo?.value} de {titular.nombre}</span>
                        </button>
                      )}
                      {onReemplazar && reemplazable && (
                        <button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={() => onReemplazar(d)}>
                          {estado.clave === 'rechazado' ? 'Reemplazar' : 'Renovar'}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
