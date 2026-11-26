// Afiliar asociación (Figma 02 · Afiliar asociación): registra la asociación y, si se pide, invita
// a su representante, que recibe un correo para crear su contraseña.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Campo, Encabezado, OpcionesSede, Tarjeta } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { crearAsociacion, invitarUsuario, listarRoles } from '../../../services/administracion.js';
import { correoValido, valoresCatalogo, PROVINCIAS } from '../../../services/representante.js';
import { RUTA_ADMIN as RUTA } from '../../asociacion/contexto.js';
import EntradaTelefono from '../../../components/EntradaTelefono.jsx';
import { normalizarTelefono } from '../../../utils/telefono.js';

const HOY = () => new Date().toISOString().slice(0, 10);

/** Cédula jurídica como 3-101-123456, la escriban con o sin guiones. */
export function normalizarCedulaJuridica(texto) {
  const d = String(texto || '').replace(/\D/g, '');
  return d.length === 10 ? `${d[0]}-${d.slice(1, 4)}-${d.slice(4)}` : String(texto || '').trim();
}

const VACIO = {
  name: '', short_name: '', tax_id: '', province: '', canton: '', founded_date: '', email: '', phone: '',
  address: '', home_venue: '', status: 'AFILIADA', invitar: true, rep_nombre: '', rep_correo: ''
};

function validar(f) {
  const e = {};
  if (f.name.trim().length < 5) e.name = 'Escriba el nombre legal de la asociación.';
  if (!/^\d-\d{3}-\d{6}$/.test(normalizarCedulaJuridica(f.tax_id))) e.tax_id = 'La cédula jurídica tiene 10 dígitos, por ejemplo 3-002-123456.';
  if (!f.province) e.province = 'Elija la provincia.';
  if (f.founded_date && f.founded_date > HOY()) e.founded_date = 'La fecha de fundación no puede ser futura.';
  if (!correoValido(f.email.trim())) e.email = 'El correo no es válido.';
  if (normalizarTelefono(f.phone).error) e.phone = normalizarTelefono(f.phone).error;
  if (f.invitar) {
    if (!f.rep_nombre.trim()) e.rep_nombre = 'Escriba el nombre del representante.';
    if (!f.rep_correo.trim() || !correoValido(f.rep_correo.trim())) e.rep_correo = 'Escriba un correo válido: ahí le llega la invitación.';
  }
  return e;
}

function Formulario({ sedes, roles }) {
  const navigate = useNavigate();
  const [f, setF] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const rolRepresentante = roles.find((r) => r.name === 'Representante');

  async function afiliar(e) {
    e.preventDefault();
    const encontrados = validar(f);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setEstado({ guardando: true, error: null });

    let asociacion;
    try {
      asociacion = await crearAsociacion({
        name: f.name.trim(),
        short_name: f.short_name.trim() || null,
        tax_id: normalizarCedulaJuridica(f.tax_id),
        province: f.province,
        canton: f.canton.trim() || null,
        founded_date: f.founded_date || null,
        email: f.email.trim() || null,
        phone: normalizarTelefono(f.phone).valor,
        address: f.address.trim() || null,
        home_venue: f.home_venue || null,
        status: f.status
      });
    } catch (err) {
      setEstado({ guardando: false, error: err.status === 409 ? 'Ya hay una asociación con esa cédula jurídica.' : err.message });
      return;
    }

    // La asociación ya quedó afiliada; si la invitación falla, se avisa y se puede enviar después
    // desde Usuarios y permisos.
    let mensaje = 'Asociación afiliada.';
    if (f.invitar) {
      try {
        if (!rolRepresentante) throw new Error('no existe el rol Representante');
        await invitarUsuario({
          email: f.rep_correo.trim().toLowerCase(),
          full_name: f.rep_nombre.trim(),
          role_ids: [rolRepresentante.id],
          organization_id: asociacion.id
        });
        mensaje = 'Asociación afiliada. Se envió la invitación al representante.';
      } catch (err) {
        mensaje = `Asociación afiliada, pero no se pudo invitar al representante (${err.message}). Puede invitarlo desde Usuarios y permisos.`;
      }
    }
    navigate(RUTA.asociacion(asociacion.id), { replace: true, state: { mensaje } });
  }

  return (
    <form className="g-pagina" onSubmit={afiliar} noValidate>
      <Encabezado
        titulo="Afiliar asociación"
        bajada="Registra una nueva asociación y crea la cuenta de su representante."
        acciones={(
          <>
            <Link to={RUTA.asociaciones} className="g-boton">Cancelar</Link>
            <button type="submit" className="g-boton g-boton--primario" disabled={estado.guardando}>{estado.guardando ? 'Afiliando…' : 'Afiliar asociación'}</button>
          </>
        )}
      />
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo="Datos de la asociación">
            <div className="g-tarjeta__cuerpo g-formulario">
              <Campo etiqueta="Nombre de la asociación" obligatorio error={errores.name}>
                {(a) => <input {...a} className="g-control" value={f.name} onChange={cambiar('name')} maxLength={150} />}
              </Campo>
              <Campo etiqueta="Cédula jurídica" obligatorio error={errores.tax_id} ayuda="Con o sin guiones.">
                {(a) => (
                  <input
                    {...a}
                    className="g-control"
                    value={f.tax_id}
                    onChange={cambiar('tax_id')}
                    onBlur={() => setF((x) => ({ ...x, tax_id: normalizarCedulaJuridica(x.tax_id) }))}
                    maxLength={14}
                    inputMode="numeric"
                  />
                )}
              </Campo>
              <Campo etiqueta="Nombre corto">
                {(a) => <input {...a} className="g-control" value={f.short_name} onChange={cambiar('short_name')} maxLength={40} />}
              </Campo>
              <Campo etiqueta="Fecha de fundación" error={errores.founded_date}>
                {(a) => <input {...a} type="date" className="g-control" value={f.founded_date} max={HOY()} onChange={cambiar('founded_date')} />}
              </Campo>
              <Campo etiqueta="Provincia" obligatorio error={errores.province}>
                {(a) => (
                  <select {...a} className="g-control" value={f.province} onChange={cambiar('province')}>
                    <option value="">Elija…</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Cantón">
                {(a) => <input {...a} className="g-control" value={f.canton} onChange={cambiar('canton')} maxLength={80} />}
              </Campo>
              <Campo etiqueta="Correo institucional" error={errores.email}>
                {(a) => <input {...a} type="email" className="g-control" value={f.email} onChange={cambiar('email')} maxLength={120} />}
              </Campo>
              <Campo etiqueta="Teléfono" error={errores.phone}>
                {(a) => <EntradaTelefono {...a} className="g-control" value={f.phone} onCambiar={(v) => setF((x) => ({ ...x, phone: v }))} />}
              </Campo>
              <Campo etiqueta="Gimnasio sede">
                {(a) => (
                  <select {...a} className="g-control" value={f.home_venue} onChange={cambiar('home_venue')}>
                    <OpcionesSede sedes={sedes} />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Dirección" ancho>
                {(a) => <input {...a} className="g-control" value={f.address} onChange={cambiar('address')} maxLength={250} />}
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Representante" nota="Recibe la cuenta de Representante de asociación.">
            <div className="g-tarjeta__cuerpo g-formulario">
              <label className="g-campo--ancho" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={f.invitar} onChange={(e) => setF((x) => ({ ...x, invitar: e.target.checked }))} />
                Enviar invitación al representante
              </label>
              {f.invitar && (
                <>
                  <Campo etiqueta="Nombre completo" obligatorio error={errores.rep_nombre}>
                    {(a) => <input {...a} className="g-control" value={f.rep_nombre} onChange={cambiar('rep_nombre')} maxLength={150} />}
                  </Campo>
                  <Campo etiqueta="Correo electrónico" obligatorio error={errores.rep_correo} ayuda="Recibe un correo para crear su contraseña.">
                    {(a) => <input {...a} type="email" className="g-control" value={f.rep_correo} onChange={cambiar('rep_correo')} maxLength={120} />}
                  </Campo>
                </>
              )}
            </div>
          </Tarjeta>
        </div>

        <div className="g-columna">
          <Tarjeta titulo="Afiliación">
            <div className="g-tarjeta__cuerpo g-formulario g-formulario--una">
              <Campo etiqueta="Estado inicial">
                {(a) => (
                  <select {...a} className="g-control" value={f.status} onChange={cambiar('status')}>
                    <option value="AFILIADA">Afiliada</option>
                    <option value="PROVISIONAL">Afiliación provisional</option>
                  </select>
                )}
              </Campo>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Documentos de afiliación">
            <p className="g-tarjeta__vacio">
              Después de afiliarla, cargue la personería jurídica, el acta de asamblea y los estatutos desde el detalle de la asociación.
            </p>
          </Tarjeta>
        </div>
      </div>
    </form>
  );
}

export default function AfiliarAsociacion() {
  const carga = useCarga(
    (signal) => Promise.all([valoresCatalogo('Sedes', { signal }), listarRoles({ signal })]).then(([sedes, roles]) => ({ sedes, roles })),
    []
  );
  if (carga.estado === 'cargando') return <Cargando texto="Cargando…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  return <Formulario {...carga.datos} />;
}
