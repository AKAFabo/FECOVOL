// Ventana para subir un documento (Figma 04 · Subir documento). El archivo va al backend, que lo
// guarda en el bucket privado después de revisar el tipo real y el tamaño. Aquí solo se hace una
// revisión previa para avisar rápido.
import { useRef, useState } from 'react';
import { Campo, Modal, OpcionesCatalogo } from '../../components/gestion/Gestion.jsx';
import { FORMATOS, MAXIMO_MB, subirDocumento } from '../../services/representante.js';
import { tipoPermitido } from '../../utils/tiposDocumento.js';

const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png'];
const EXTENSIONES = /\.(pdf|jpe?g|png)$/i;

function revisarArchivo(archivo) {
  if (!archivo) return 'Seleccione el archivo del documento.';
  if (!(TIPOS_ACEPTADOS.includes(archivo.type) || EXTENSIONES.test(archivo.name))) return 'Solo se aceptan archivos PDF, JPG o PNG.';
  if (archivo.size > MAXIMO_MB * 1024 * 1024) return `El archivo pesa más de ${MAXIMO_MB} MB.`;
  if (archivo.size === 0) return 'El archivo está vacío.';
  return null;
}

const tamano = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * @param {object} props
 * @param {{ code: string, value: string }[]} props.tipos  Tipos de documento (catálogo).
 * @param {{ clave: string, texto: string, titular: object }[]} [props.titulares]  Opciones de titular.
 * @param {{ texto: string, titular: object }} [props.titularFijo]  Titular ya decidido.
 * @param {string} [props.tipoInicial]
 */
export default function SubirDocumento({ tipos, titulares, titularFijo, tipoInicial = '', onCerrar, onSubido }) {
  const entrada = useRef(null);
  const [f, setF] = useState({ titular: titulares?.[0]?.clave || '', tipo: tipoInicial, emision: '', vencimiento: '' });
  const [archivo, setArchivo] = useState(null);
  const [encima, setEncima] = useState(false);
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ subiendo: false, error: null });

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

  // Solo los tipos que corresponden al titular elegido (una cédula no es de un equipo).
  const titularActual = titularFijo ? titularFijo.titular : titulares?.find((t) => t.clave === f.titular)?.titular;
  const tipoTitular = titularActual?.person_id ? 'PERSONA' : titularActual?.team_id ? 'EQUIPO' : titularActual?.association_id ? 'ASOCIACION' : null;
  const tiposVisibles = tipoTitular ? (tipos || []).filter((t) => tipoPermitido(t.code, tipoTitular)) : (tipos || []);
  const tipoValido = !f.tipo || tiposVisibles.some((t) => t.code === f.tipo);

  function elegir(lista) {
    const elegido = lista?.[0] || null;
    setArchivo(elegido);
    setErrores((x) => ({ ...x, archivo: elegido ? revisarArchivo(elegido) : null }));
  }

  async function subir() {
    const e = {};
    if (!titularFijo && !f.titular) e.titular = 'Elija a quién pertenece el documento.';
    if (!f.tipo || !tipoValido) e.tipo = 'Elija el tipo de documento.';
    if (f.emision && f.emision > hoy) e.emision = 'La fecha de emisión no puede ser futura.';
    const errorArchivo = revisarArchivo(archivo);
    if (errorArchivo) e.archivo = errorArchivo;
    if (f.emision && f.vencimiento && f.vencimiento < f.emision) e.vencimiento = 'El vencimiento no puede ser anterior a la emisión.';
    setErrores(e);
    if (Object.keys(e).length) return;

    const titular = titularFijo ? titularFijo.titular : titulares.find((t) => t.clave === f.titular)?.titular;
    setEstado({ subiendo: true, error: null });
    try {
      const doc = await subirDocumento({ archivo, tipo: f.tipo, titular, emision: f.emision, vencimiento: f.vencimiento });
      onSubido(doc);
    } catch (err) {
      setEstado({ subiendo: false, error: err.message });
    }
  }

  return (
    <Modal
      titulo="Subir documento"
      bajada={titularFijo ? `Para ${titularFijo.texto}. Queda en revisión hasta que FECOVOL lo apruebe.` : 'Queda en revisión hasta que FECOVOL lo apruebe.'}
      onCerrar={onCerrar}
      ocupado={estado.subiendo}
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.subiendo}>Cancelar</button>
          <button type="button" className="g-boton g-boton--acento" onClick={subir} disabled={estado.subiendo}>
            {estado.subiendo ? 'Subiendo…' : 'Subir documento'}
          </button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-formulario">
        {!titularFijo && (
          <Campo etiqueta="Persona o equipo" obligatorio error={errores.titular} ancho>
            {(a) => (
              <select {...a} className="g-control" value={f.titular} onChange={cambiar('titular')} data-autofoco>
                <option value="">Elija…</option>
                {titulares.map((t) => <option key={t.clave} value={t.clave}>{t.texto}</option>)}
              </select>
            )}
          </Campo>
        )}
        <Campo etiqueta="Tipo de documento" obligatorio error={errores.tipo} ancho>
          {(a) => (
            <select {...a} className="g-control" value={tipoValido ? f.tipo : ''} onChange={cambiar('tipo')}>
              <OpcionesCatalogo valores={tiposVisibles} vacia="Elija…" />
            </select>
          )}
        </Campo>
        <Campo etiqueta="Fecha de emisión" error={errores.emision}>
          {(a) => <input {...a} type="date" className="g-control" value={f.emision} max={hoy} onChange={cambiar('emision')} />}
        </Campo>
        <Campo etiqueta="Fecha de vencimiento" ayuda="Déjela vacía si no vence." error={errores.vencimiento}>
          {(a) => <input {...a} type="date" className="g-control" value={f.vencimiento} min={f.emision || undefined} onChange={cambiar('vencimiento')} />}
        </Campo>
      </div>

      <div
        className={`g-soltar${encima ? ' g-soltar--encima' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); elegir(e.dataTransfer.files); }}
      >
        <p className="g-soltar__titulo">{archivo ? archivo.name : 'Arrastre aquí el archivo'}</p>
        <p className="g-soltar__detalle">{archivo ? tamano(archivo.size) : `PDF, JPG o PNG · hasta ${MAXIMO_MB} MB`}</p>
        <input ref={entrada} type="file" accept={FORMATOS} className="visualmente-oculto" id="archivo-documento" onChange={(e) => elegir(e.target.files)} />
        <button type="button" className="g-boton g-boton--chico" onClick={() => entrada.current?.click()} disabled={estado.subiendo}>
          {archivo ? 'Cambiar archivo' : 'Seleccionar archivo'}
        </button>
        {errores.archivo && <p className="g-campo__error" role="alert">{errores.archivo}</p>}
      </div>
    </Modal>
  );
}
