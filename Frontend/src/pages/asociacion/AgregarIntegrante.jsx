// Agregar integrante a un equipo (Figma 04 · Agregar integrante): busca entre las personas ya
// registradas en la asociación. Si no aparece, se registra primero en Personas.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo, Estado, Modal, OpcionesCatalogo } from '../../components/gestion/Gestion.jsx';
import { agregarIntegrante, nombrePersona, ROLES_PERSONA } from '../../services/representante.js';
import { RUTA } from './contexto.js';

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rolesActivos = (p) => (p.person_roles || []).filter((r) => r.is_active).map((r) => r.role_type);

/**
 * @param {object} props
 * @param {object} props.equipo
 * @param {'JUGADOR' | 'TECNICO'} props.tipo
 * @param {object[]} props.personas   Personas de la asociación (con sus equipos).
 * @param {Set<string>} props.yaEnEquipo  Ids de personas activas en la nómina.
 * @param {Set<number>} props.numerosUsados
 */
export default function AgregarIntegrante({ equipo, tipo: tipoInicial, personas, yaEnEquipo, numerosUsados, posiciones, onCerrar, onAgregado }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [q, setQ] = useState('');
  const [elegida, setElegida] = useState(null);
  const [f, setF] = useState({ position_code: '', jersey_number: '', technical_role: '' });
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState({ guardando: false, error: null });

  const resultados = useMemo(() => {
    const t = sinTildes(q.trim());
    if (t.length < 2) return [];
    return personas
      .filter((p) => sinTildes(`${nombrePersona(p)} ${p.document_number || ''}`).includes(t))
      .slice(0, 8);
  }, [personas, q]);

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function agregar() {
    const e = {};
    if (!elegida) e.persona = 'Busque y elija a una persona.';
    if (tipo === 'JUGADOR' && f.jersey_number !== '') {
      const n = Number(f.jersey_number);
      if (!Number.isInteger(n) || n < 1 || n > 99) e.jersey_number = 'El número va de 1 a 99.';
      else if (numerosUsados.has(n)) e.jersey_number = `El número ${n} ya lo usa otra persona del equipo.`;
    }
    if (tipo === 'TECNICO' && !f.technical_role.trim()) e.technical_role = 'Indique la función.';
    setErrores(e);
    if (Object.keys(e).length) return;

    setEstado({ guardando: true, error: null });
    try {
      await agregarIntegrante(equipo.id, tipo === 'JUGADOR'
        ? { person_id: elegida.id, member_type: 'JUGADOR', position_code: f.position_code || null, jersey_number: f.jersey_number === '' ? null : Number(f.jersey_number) }
        : { person_id: elegida.id, member_type: 'TECNICO', technical_role: f.technical_role.trim() });
      onAgregado(elegida);
    } catch (err) {
      setEstado({ guardando: false, error: err.status === 409 ? 'Esa persona ya está en la nómina o el número de camiseta ya está ocupado.' : err.message });
    }
  }

  return (
    <Modal
      titulo={`Agregar integrante a ${equipo.name}`}
      bajada="Busque a una persona ya registrada en su asociación. Si no existe, regístrela primero."
      onCerrar={onCerrar}
      ocupado={estado.guardando}
      ancho="600px"
      pie={(
        <>
          <button type="button" className="g-boton" onClick={onCerrar} disabled={estado.guardando}>Cancelar</button>
          <button type="button" className="g-boton g-boton--primario" onClick={agregar} disabled={estado.guardando || !elegida}>
            {estado.guardando ? 'Agregando…' : 'Agregar a la nómina'}
          </button>
        </>
      )}
    >
      {estado.error && <p className="g-aviso g-aviso--error" role="alert">{estado.error}</p>}

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: 16 }}>
        <legend className="g-campo__etiqueta" style={{ marginBottom: 6 }}>Se agrega como</legend>
        {[['JUGADOR', 'Jugador o jugadora'], ['TECNICO', 'Cuerpo técnico']].map(([valor, texto]) => (
          <label key={valor} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
            <input type="radio" name="tipo-integrante" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} />
            {texto}
          </label>
        ))}
      </fieldset>

      <Campo etiqueta="Buscar por nombre o identificación" error={errores.persona}>
        {(a) => <input {...a} type="search" className="g-control" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} data-autofoco autoComplete="off" />}
      </Campo>

      {q.trim().length >= 2 && (
        <div>
          <p className="g-subtitulo" aria-live="polite">{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}</p>
          <ul className="g-resultados">
            {resultados.map((p) => {
              const enEquipo = yaEnEquipo.has(p.id);
              const seleccionada = elegida?.id === p.id;
              const otros = (p.equipos || []).filter((e) => e.id !== equipo.id).map((e) => e.short_name || e.name);
              const roles = rolesActivos(p).map((r) => ROLES_PERSONA[r] || r).join(' · ');
              return (
                <li key={p.id} className="g-resultado">
                  <div>
                    <p className="g-resultado__nombre">{nombrePersona(p)}</p>
                    <p className="g-resultado__detalle">
                      {[p.document_number, roles, otros.length ? `en ${otros.join(', ')}` : (enEquipo ? null : 'sin equipo')].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {enEquipo ? <Estado tono="neutro">Ya está en el equipo</Estado>
                    : seleccionada ? <Estado tono="ok">Seleccionada</Estado>
                      : <button type="button" className="g-boton g-boton--chico" onClick={() => setElegida(p)}>Elegir</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {elegida && (
        <div className="g-formulario">
          {tipo === 'JUGADOR' ? (
            <>
              <Campo etiqueta="Posición de juego">
                {(a) => (
                  <select {...a} className="g-control" value={f.position_code} onChange={cambiar('position_code')}>
                    <OpcionesCatalogo valores={posiciones} vacia="Sin indicar" />
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Número de camiseta" error={errores.jersey_number}>
                {(a) => <input {...a} type="number" min={1} max={99} className="g-control" value={f.jersey_number} onChange={cambiar('jersey_number')} />}
              </Campo>
            </>
          ) : (
            <Campo etiqueta="Función" obligatorio error={errores.technical_role} ancho>
              {(a) => <input {...a} className="g-control" value={f.technical_role} onChange={cambiar('technical_role')} maxLength={60} placeholder="Entrenador, asistente, fisioterapia…" />}
            </Campo>
          )}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 14 }}>
        ¿No aparece? <Link to={RUTA.nuevaPersona} className="g-enlace">Registrar persona nueva →</Link>
      </p>
    </Modal>
  );
}
