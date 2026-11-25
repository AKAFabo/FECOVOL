// Convocatoria de una selección: integrantes (atletas y cuerpo técnico), publicación y archivo.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '../../../components/EstadoContenido.jsx';
import { Campo, Confirmar, Encabezado, Estado, OpcionesCatalogo, Tarjeta, useMensaje } from '../../../components/gestion/Gestion.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { nombrePersona, valoresCatalogo } from '../../../services/representante.js';
import { agregarConvocado, editarConvocatoria, ESTADOS_CONVOCATORIA, obtenerConvocatoria, quitarConvocado } from '../../../services/seleccionesAdmin.js';
import { motivoNoElegible } from '../../../utils/elegibilidadSeleccion.js';
import { fechaCorta } from '../../../utils/formato.js';
import BuscarPersona from '../arbitraje/BuscarPersona.jsx';

const VACIO = { member_type: 'JUGADOR', jersey_number: '', position_code: '', staff_role: '' };

function AgregarIntegrante({ convocatoria, onAgregado }) {
  const posiciones = useCarga(() => valoresCatalogo('Posiciones'), []);
  const [persona, setPersona] = useState(null);
  const [f, setF] = useState(VACIO);
  const [estado, setEstado] = useState({ ocupado: false, error: '' });
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const yaEstan = convocatoria.integrantes.map((m) => m.persona?.id).filter(Boolean);
  // Mismo criterio que el backend: rama y categoría de la selección, a la fecha del evento (o hoy).
  const criterio = {
    rama: convocatoria.seleccion?.rama || null,
    categoria: convocatoria.seleccion?.categoria || null,
    fechaReferencia: convocatoria.requisitos?.fecha_referencia || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' })
  };
  const motivoNoApta = f.member_type === 'JUGADOR' ? (p) => motivoNoElegible(p, criterio) : undefined;

  async function guardar(e) {
    e.preventDefault();
    if (!persona) { setEstado({ ocupado: false, error: 'Busque y elija la persona en el padrón.' }); return; }
    const motivo = motivoNoApta?.(persona);
    if (motivo) { setEstado({ ocupado: false, error: motivo }); return; }
    setEstado({ ocupado: true, error: '' });
    try {
      await agregarConvocado(convocatoria.id, {
        person_id: persona.id,
        member_type: f.member_type,
        jersey_number: f.member_type === 'JUGADOR' && f.jersey_number ? Number(f.jersey_number) : undefined,
        position_code: f.member_type === 'JUGADOR' ? f.position_code || undefined : undefined,
        staff_role: f.member_type === 'CUERPO_TECNICO' ? f.staff_role : undefined
      });
      setPersona(null);
      setF(VACIO);
      setEstado({ ocupado: false, error: '' });
      onAgregado(`${nombrePersona(persona)} quedó en la convocatoria.`);
    } catch (err) {
      setEstado({ ocupado: false, error: err.message });
    }
  }

  return (
    <form className="g-tarjeta__cuerpo g-formulario" onSubmit={guardar}>
      {estado.error && <p className="g-aviso g-aviso--error g-campo--ancho" role="alert">{estado.error}</p>}
      <Campo etiqueta="Integra como" ancho>{(a) => (
        <select {...a} className="g-control" value={f.member_type} onChange={cambiar('member_type')}>
          <option value="JUGADOR">Atleta</option>
          <option value="CUERPO_TECNICO">Cuerpo técnico</option>
        </select>
      )}</Campo>
      <div className="g-campo--ancho">
        {persona ? (
          <p className="g-lista__titulo">
            {nombrePersona(persona)}{' '}
            <button type="button" className="g-boton g-boton--chico" onClick={() => setPersona(null)}>Cambiar</button>
          </p>
        ) : (
          <BuscarPersona etiqueta="Persona del padrón" onElegir={setPersona} excluir={yaEstan} textoBoton="Convocar" motivoNoApta={motivoNoApta} />
        )}
      </div>
      {f.member_type === 'JUGADOR' ? (
        <>
          <Campo etiqueta="Número">{(a) => <input {...a} className="g-control" inputMode="numeric" maxLength={2} value={f.jersey_number} onChange={(e) => setF((x) => ({ ...x, jersey_number: e.target.value.replace(/\D/g, '') }))} />}</Campo>
          <Campo etiqueta="Posición">{(a) => <select {...a} className="g-control" value={f.position_code} onChange={cambiar('position_code')}><OpcionesCatalogo valores={posiciones.datos} vacia="Sin definir" /></select>}</Campo>
        </>
      ) : (
        <Campo etiqueta="Cargo" obligatorio>{(a) => <input {...a} className="g-control" maxLength={80} value={f.staff_role} onChange={cambiar('staff_role')} placeholder="Entrenador principal" />}</Campo>
      )}
      <div className="g-campo--ancho">
        <button type="submit" className="g-boton g-boton--primario" disabled={estado.ocupado}>{estado.ocupado ? 'Agregando…' : 'Agregar a la convocatoria'}</button>
      </div>
    </form>
  );
}

export default function Convocatoria() {
  const { convocatoriaId } = useParams();
  const [version, setVersion] = useState(0);
  const [mensaje, mostrar] = useMensaje();
  const [confirmar, setConfirmar] = useState(null);
  const [error, setError] = useState('');
  const carga = useCarga((signal) => obtenerConvocatoria(convocatoriaId, { signal }), [convocatoriaId, version]);
  const recargar = (texto) => { if (texto) mostrar(texto); setVersion((v) => v + 1); };

  if (carga.estado === 'error' && !carga.datos) return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;
  if (!carga.datos) return <Cargando texto="Cargando la convocatoria…" />;
  const c = carga.datos;
  const est = ESTADOS_CONVOCATORIA[c.status];
  const atletas = c.integrantes.filter((m) => m.member_type === 'JUGADOR').sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  const cuerpo = c.integrantes.filter((m) => m.member_type === 'CUERPO_TECNICO');
  const editable = c.status !== 'ARCHIVADA';
  const fuera = atletas.filter((m) => m.motivo_no_elegible);
  const requisitos = c.requisitos?.detalle || [];

  async function cambiarEstado(status) {
    setError('');
    try {
      await editarConvocatoria(c.id, { status });
      recargar(status === 'PUBLICADA' ? 'Convocatoria publicada en el portal.' : status === 'ARCHIVADA' ? 'Convocatoria archivada.' : 'La convocatoria volvió a borrador y dejó de mostrarse en el portal.');
    } catch (e) { setError(e.message); }
  }
  async function quitar(m) {
    setError('');
    try {
      await quitarConvocado(c.id, m.id);
      recargar(`${nombrePersona(m.persona)} salió de la convocatoria.`);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="g-pagina">
      {mensaje}
      <Encabezado
        titulo={c.title}
        bajada={[c.seleccion?.name, c.evento ? `${c.evento.name} · ${fechaCorta(c.evento.start_date)}` : 'Sin evento'].filter(Boolean).join(' · ')}
        acciones={(
          <>
            <Link to="/admin/selecciones" className="g-boton">Volver</Link>
            {c.status === 'BORRADOR' && <button type="button" className="g-boton g-boton--primario" onClick={() => setConfirmar('PUBLICADA')}>Publicar</button>}
            {c.status === 'PUBLICADA' && <button type="button" className="g-boton" onClick={() => setConfirmar('BORRADOR')}>Retirar del portal</button>}
            {c.status !== 'ARCHIVADA' && <button type="button" className="g-boton" onClick={() => setConfirmar('ARCHIVADA')}>Archivar</button>}
          </>
        )}
      />
      <div className="arb-estados-partido" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Estado tono={est.tono}>{est.texto}</Estado>
        {c.published_at && <Estado tono="neutro">Publicada el {fechaCorta(c.published_at.slice(0, 10))}</Estado>}
      </div>
      {error && <p className="g-aviso g-aviso--error" role="alert">{error}</p>}
      {requisitos.length > 0 && (
        <p className="g-aviso">
          <span className="g-aviso__titulo">Quién puede ser convocado como atleta</span>
          {[c.seleccion?.categoria?.value, c.seleccion?.rama?.value].filter(Boolean).join(' · ')}: {requisitos.join('; ')}
          {c.evento ? ', según la fecha de inicio del evento.' : '. Sin evento asignado se toma la fecha de hoy.'}
        </p>
      )}
      {fuera.length > 0 && (
        <p className="g-aviso g-aviso--error" role="alert">
          <span className="g-aviso__titulo">{fuera.length === 1 ? 'Un atleta no cumple' : `${fuera.length} atletas no cumplen`} la categoría o la rama</span>
          Quítelos o corrija su ficha en el padrón; mientras tanto la convocatoria no se puede publicar.
        </p>
      )}
      <p className="g-aviso">
        <span className="g-aviso__titulo">Qué se publica</span>
        De cada atleta, el portal muestra solo nombre, número y posición; del cuerpo técnico, nombre y cargo. Nada de cédulas ni contactos.
      </p>

      <div className="g-rejilla">
        <div className="g-columna">
          <Tarjeta titulo={`Atletas (${atletas.length})`}>
            {atletas.length === 0 ? <p className="g-tarjeta__vacio">Todavía no hay atletas convocados.</p> : (
              <div className="g-tabla-envoltura">
                <table className="g-tabla">
                  <caption className="visualmente-oculto">Atletas convocados</caption>
                  <thead><tr><th scope="col">N.º</th><th scope="col">Nombre</th><th scope="col">Posición</th><th scope="col">Asociación</th>{editable && <th scope="col"><span className="visualmente-oculto">Acciones</span></th>}</tr></thead>
                  <tbody>
                    {atletas.map((m) => (
                      <tr key={m.id}>
                        <td>{m.jersey_number ?? '—'}</td>
                        <th scope="row">
                          {nombrePersona(m.persona)}<span className="g-tabla__sub">{m.persona?.document_number}</span>
                          {m.motivo_no_elegible && <span className="g-tabla__sub g-campo__error">{m.motivo_no_elegible}</span>}
                        </th>
                        <td>{m.posicion?.value || 'Sin definir'}</td>
                        <td>{m.persona?.asociacion?.short_name || m.persona?.asociacion?.name || 'Sin asociación'}</td>
                        {editable && <td className="g-tabla__accion"><button type="button" className="g-boton g-boton--chico" onClick={() => quitar(m)}>Quitar<span className="visualmente-oculto"> {nombrePersona(m.persona)}</span></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
          <Tarjeta titulo={`Cuerpo técnico (${cuerpo.length})`}>
            {cuerpo.length === 0 ? <p className="g-tarjeta__vacio">Sin cuerpo técnico convocado.</p> : (
              <ul className="g-lista">
                {cuerpo.map((m) => (
                  <li key={m.id} className="g-lista__fila">
                    <div className="g-lista__texto"><p className="g-lista__titulo">{nombrePersona(m.persona)}</p><p className="g-lista__detalle">{m.staff_role}</p></div>
                    {editable && <button type="button" className="g-boton g-boton--chico" onClick={() => quitar(m)}>Quitar<span className="visualmente-oculto"> {nombrePersona(m.persona)}</span></button>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
        <div className="g-columna">
          {editable
            ? <Tarjeta titulo="Convocar"><AgregarIntegrante convocatoria={c} onAgregado={recargar} /></Tarjeta>
            : <Tarjeta titulo="Convocatoria archivada"><p className="g-tarjeta__vacio">Una convocatoria archivada se conserva como historial y no admite cambios.</p></Tarjeta>}
        </div>
      </div>

      {confirmar && (
        <Confirmar
          titulo={confirmar === 'PUBLICADA' ? 'Publicar la convocatoria' : confirmar === 'ARCHIVADA' ? 'Archivar la convocatoria' : 'Retirar del portal'}
          texto={confirmar === 'PUBLICADA'
            ? 'La convocatoria aparecerá en la página pública de Selecciones con nombre, número y posición de cada atleta.'
            : confirmar === 'ARCHIVADA'
              ? 'Dejará de mostrarse en el portal y ya no se podrá modificar; se conserva como historial.'
              : 'Dejará de mostrarse en el portal y volverá a borrador.'}
          textoAccion={confirmar === 'PUBLICADA' ? 'Publicar' : confirmar === 'ARCHIVADA' ? 'Archivar' : 'Retirar'}
          onConfirmar={() => { const s = confirmar; setConfirmar(null); return cambiarEstado(s); }}
          onCerrar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}
