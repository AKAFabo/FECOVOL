// Reportes de la asociación (RF-ASO-008): listados de equipos e integrantes para consultar,
// imprimir o descargar en Excel. Cada impresión o descarga queda en la bitácora (lo registra el
// backend). Los listados no son la nómina oficial de una competencia y lo dicen.
import { useState } from 'react';
import { Cargando, ErrorCarga } from '../../components/EstadoContenido.jsx';
import { Campo, Encabezado, Estado, Tarjeta } from '../../components/gestion/Gestion.jsx';
import useCarga from '../../hooks/useCarga.js';
import { descargarReporteExcel, registrarImpresion, reporteAsociacion } from '../../services/participacion.js';
import { listarEquipos } from '../../services/representante.js';
import { useAsociacion } from './contexto.js';
import '../../styles/participacion.css';

const TIPOS = {
  EQUIPOS: { texto: 'Equipos e integrantes', detalle: 'Todos los equipos activos con sus jugadores y cuerpo técnico.' },
  EQUIPO: { texto: 'Integrantes de un equipo', detalle: 'El listado de un equipo, por ejemplo para presentarlo antes de un partido.' }
};
const INTEGRANTES = { TODOS: 'Jugadores y cuerpo técnico', JUGADOR: 'Solo jugadores', TECNICO: 'Solo cuerpo técnico' };
const TIPO_INTEGRANTE = { JUGADOR: 'Jugador', TECNICO: 'Cuerpo técnico' };

export default function Reportes() {
  useAsociacion([{ texto: 'Reportes' }]);
  const equipos = useCarga((signal) => listarEquipos({ signal }), []);
  const [f, setF] = useState({ tipo: 'EQUIPOS', team_id: '', integrantes: 'TODOS' });
  const [error, setError] = useState(null);
  const [generado, setGenerado] = useState({ estado: 'vacio', datos: null, parametros: null });
  const [ocupado, setOcupado] = useState(null); // 'excel' | 'imprimir'

  const cambiar = (campo) => (e) => {
    setF((x) => ({ ...x, [campo]: e.target.value }));
    setError(null);
  };

  async function generar(evento) {
    evento.preventDefault();
    if (f.tipo === 'EQUIPO' && !f.team_id) {
      setError('Seleccione el equipo.');
      return;
    }
    const parametros = { tipo: f.tipo, integrantes: f.integrantes, team_id: f.tipo === 'EQUIPO' ? f.team_id : undefined };
    setGenerado({ estado: 'cargando', datos: null, parametros: null });
    try {
      const datos = await reporteAsociacion(parametros);
      setGenerado({ estado: 'listo', datos, parametros });
    } catch (e) {
      setGenerado({ estado: 'error', datos: null, parametros: null, error: e.message });
    }
  }

  async function descargar() {
    setOcupado('excel');
    setError(null);
    try {
      await descargarReporteExcel(generado.parametros);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  }

  async function imprimir() {
    setOcupado('imprimir');
    setError(null);
    try {
      await registrarImpresion(generado.parametros);
      window.print();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  }

  const r = generado.datos;
  const activos = (equipos.datos || []).filter((e) => e.status === 'ACTIVO');

  return (
    <div className="g-pagina">
      <Encabezado titulo="Reportes" bajada="Listados de sus equipos e integrantes para consulta o presentación." />

      <div className="g-rejilla part-rejilla-reporte">
        <div className="g-columna part-sin-impresion">
          <Tarjeta titulo="Parámetros">
            <form className="g-tarjeta__cuerpo g-formulario g-formulario--una" onSubmit={generar} noValidate>
              <fieldset className="part-opciones">
                <legend className="g-campo__etiqueta">Reporte</legend>
                {Object.entries(TIPOS).map(([k, t]) => (
                  <label key={k} className={`part-opcion${f.tipo === k ? ' part-opcion--elegida' : ''}`}>
                    <input type="radio" name="tipo-reporte" value={k} checked={f.tipo === k} onChange={cambiar('tipo')} />
                    <span>
                      <span className="part-opcion__titulo">{t.texto}</span>
                      <span className="part-opcion__detalle">{t.detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {f.tipo === 'EQUIPO' && (
                <Campo etiqueta="Equipo" obligatorio error={error === 'Seleccione el equipo.' ? error : undefined}>
                  {(a) => (
                    <select {...a} className="g-control" value={f.team_id} onChange={cambiar('team_id')}>
                      <option value="">Seleccione…</option>
                      {(equipos.datos || []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.status !== 'ACTIVO' ? ' (inactivo)' : ''}</option>)}
                    </select>
                  )}
                </Campo>
              )}
              <Campo etiqueta="Integrantes">
                {(a) => (
                  <select {...a} className="g-control" value={f.integrantes} onChange={cambiar('integrantes')}>
                    {Object.entries(INTEGRANTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <button type="submit" className="g-boton g-boton--acento" disabled={generado.estado === 'cargando'}>
                {generado.estado === 'cargando' ? 'Generando…' : 'Generar reporte'}
              </button>
              {equipos.estado === 'listo' && !activos.length && <p className="g-campo__ayuda">La asociación no tiene equipos activos.</p>}
            </form>
          </Tarjeta>
          <p className="g-aviso">
            <span className="g-aviso__titulo">Qué incluye</span>
            Nombre, identificación, número, posición o cargo y si FECOVOL verificó la identidad. No incluye teléfonos, correos ni fechas de nacimiento. Cada impresión o descarga queda registrada.
          </p>
        </div>

        <div className="g-columna">
          {error && error !== 'Seleccione el equipo.' && <p className="g-aviso g-aviso--error part-sin-impresion" role="alert">{error}</p>}
          {generado.estado === 'vacio' && (
            <Tarjeta titulo="Vista previa">
              <p className="g-tarjeta__vacio">Elija el reporte y presione «Generar reporte».</p>
            </Tarjeta>
          )}
          {generado.estado === 'cargando' && <Cargando texto="Generando el reporte…" />}
          {generado.estado === 'error' && <ErrorCarga mensaje={generado.error} />}
          {generado.estado === 'listo' && r && (
            <section className="g-tarjeta part-reporte" id="area-impresion" aria-labelledby="titulo-reporte">
              <div className="g-tarjeta__cabecera">
                <div>
                  <h2 id="titulo-reporte" className="g-tarjeta__titulo">{r.report.association.name} · {r.report.title}</h2>
                  <p className="g-tarjeta__nota">Generado el {r.report.generated_at_text} (hora de Costa Rica) · {r.report.members_filter} · {r.total_members} {r.total_members === 1 ? 'integrante' : 'integrantes'}</p>
                </div>
                <div className="part-acciones part-sin-impresion">
                  <button type="button" className="g-boton g-boton--chico" onClick={imprimir} disabled={Boolean(ocupado) || !r.total_members}>
                    {ocupado === 'imprimir' ? 'Preparando…' : 'Imprimir'}
                  </button>
                  <button type="button" className="g-boton g-boton--chico g-boton--acento" onClick={descargar} disabled={Boolean(ocupado) || !r.total_members}>
                    {ocupado === 'excel' ? 'Descargando…' : 'Descargar Excel'}
                  </button>
                </div>
              </div>
              <p className="part-aviso-oficial" role="note">{r.report.notice}</p>

              {r.teams.length === 0 || !r.total_members ? (
                <p className="g-tarjeta__vacio">No hay integrantes que cumplan los parámetros.</p>
              ) : (
                r.teams.map((e) => (
                  <div key={e.id} className="part-equipo">
                    <h3 className="part-equipo__titulo">
                      {e.name}
                      <span className="part-equipo__detalle">{[e.category, e.branch, e.modality].filter(Boolean).join(' · ')}{e.status !== 'ACTIVO' ? ' · inactivo' : ''}</span>
                    </h3>
                    {e.members.length === 0 ? (
                      <p className="g-tarjeta__vacio">Sin integrantes activos.</p>
                    ) : (
                      <div className="g-tabla-envoltura">
                        <table className="g-tabla">
                          <caption className="visualmente-oculto">Integrantes de {e.name}</caption>
                          <thead>
                            <tr><th scope="col">N.º</th><th scope="col">Nombre</th><th scope="col">Identificación</th><th scope="col">Tipo</th><th scope="col">Posición o cargo</th><th scope="col">Identidad</th></tr>
                          </thead>
                          <tbody>
                            {e.members.map((m, i) => (
                              <tr key={`${m.document_number}-${i}`}>
                                <td>{m.number ?? '—'}</td>
                                <th scope="row">{m.name}</th>
                                <td className="g-tabla__fecha">{m.document_number}</td>
                                <td>{TIPO_INTEGRANTE[m.type] || m.type}</td>
                                <td>{m.position_or_role || '—'}</td>
                                <td>{m.verified ? <Estado tono="ok">Verificada</Estado> : <Estado tono="neutro">Por verificar</Estado>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
