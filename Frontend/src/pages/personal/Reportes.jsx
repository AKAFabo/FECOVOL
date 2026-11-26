import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient.js';
import '../admin/AdminCommon.css';
import { avisar } from '../../components/Avisos.jsx';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// Formatea una fecha ISO a formato dd-mmm-yyyy
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  return `${parseInt(day, 10)}-${MESES[parseInt(month, 10) - 1]}-${year}`;
}

// Define los reportes disponibles con sus metadatos
const REPORTES_DISPONIBLES = [
  { key: 'posiciones', titulo: 'Tabla de posiciones oficial', descripcion: 'Posiciones con puntos, sets y desempates aplicados según las reglas del campeonato.' },
  { key: 'jornada', titulo: 'Resultados por jornada', descripcion: 'Marcadores set a set de todas las jornadas, con sede y cuerpo arbitral.', requiereJornada: true },
  { key: 'nominas', titulo: 'Cumplimiento de nóminas', descripcion: 'Equipos con nómina incompleta o con documentación vencida por asociación.' },
  { key: 'consolidado', titulo: 'Consolidado de resultados', descripcion: 'Todos los resultados oficiales de la competencia.' },
  { key: 'estadisticas', titulo: 'Estadísticas por equipo', descripcion: 'Partidos jugados, sets ganados y perdidos, ratio y racha.' },
  { key: 'proxima', titulo: 'Programación próxima jornada', descripcion: 'Partidos programados para la siguiente jornada a jugar.' },
  { key: 'designaciones', titulo: 'Designaciones arbitrales', descripcion: 'Partidos por árbitro, con acreditación vigente al momento del partido.' },
  { key: 'incidentes', titulo: 'Incidentes y sanciones', descripcion: 'Expedientes abiertos, sanciones aplicadas y estado de cada uno.' },
];

const ESTADO_DESIGNACION = { PROPUESTA: 'Pendiente de confirmar', CONFIRMADA: 'Confirmada', CUMPLIDA: 'Cumplida' };
const ESTADO_EXPEDIENTE = { ABIERTO: 'Abierto', EN_SEGUIMIENTO: 'En seguimiento', CON_SANCION: 'Con sanción', RESUELTO: 'Resuelto', ARCHIVADO: 'Archivado' };
const ESTADO_SANCION = { VIGENTE: 'Vigente', CUMPLIDA: 'Cumplida', ANULADA: 'Anulada' };

const textoAcreditacion = (a) => (a ? [a.nivel, a.funcion].filter(Boolean).join(' · ') + (a.hasta ? ` (hasta ${formatearFecha(a.hasta)})` : '') : 'Sin acreditación vigente');
const textoSanciones = (lista) => (lista || []).map((x) => `${x.sancionado}: ${x.sancion} (${ESTADO_SANCION[x.estado] || x.estado})`).join('; ');

// Celda de CSV entre comillas; si empieza como una fórmula se antepone ' para que la hoja de
// cálculo no la ejecute.
const celdaCSV = (valor) => {
  const t = String(valor ?? '');
  return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

// Encabezados y filas del CSV de los reportes de arbitraje e incidentes (null para los demás tipos).
function csvArbitrajeIncidentes(tipo, data) {
  if (tipo === 'designaciones') {
    return {
      headers: ['Fecha', 'Hora', 'Jornada', 'Partido', 'Árbitro', 'Puesto', 'Estado', 'Acreditación vigente'],
      rows: (data?.filas || []).map((f) => [f.fecha, f.hora || '', f.jornada ?? '', f.partido, f.arbitro, f.puesto, ESTADO_DESIGNACION[f.estado] || f.estado, textoAcreditacion(f.acreditacion)])
    };
  }
  if (tipo === 'incidentes') {
    return {
      headers: ['Expediente', 'Fecha', 'Tipo', 'Título', 'Partido', 'Involucrados', 'Estado', 'Sanciones'],
      rows: (data?.expedientes || []).map((e) => [e.numero, e.fecha || '', e.tipo || '', e.titulo, e.partido || '', (e.involucrados || []).join(', '), ESTADO_EXPEDIENTE[e.estado] || e.estado, textoSanciones(e.sanciones)])
    };
  }
  return null;
}

export default function Reportes() {
  // Declara los estados principales
  const [competencias, setCompetencias] = useState([]);
  const [competenciaSeleccionada, setCompetenciaSeleccionada] = useState('');
  const [competencia, setCompetencia] = useState(null);

  // Declara los estados del reporte activo
  const [tipoReporte, setTipoReporte] = useState(null);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(1);
  const [datosReporte, setDatosReporte] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [errorReporte, setErrorReporte] = useState('');

  // Declara los estados del historial de reportes
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Carga las competencias al montar el componente
  useEffect(() => {
    async function cargarCompetencias() {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/competitions`);
      const json = await res.json();
      const lista = (json.data || []).filter(c => ['EN_CURSO', 'INSCRIPCIONES', 'FINALIZADA', 'CERRADA'].includes(c.status));
      setCompetencias(lista);
      if (lista.length > 0) setCompetenciaSeleccionada(lista[0].id);
    }
    cargarCompetencias();
  }, []);

  // Carga el detalle de la competencia y el historial
  useEffect(() => {
    if (!competenciaSeleccionada) return;
    
    async function cargarDetalle() {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/competitions/${competenciaSeleccionada}`);
      const json = await res.json();
      setCompetencia(json.data);
      setDatosReporte(null);
      setTipoReporte(null);
      setErrorReporte('');
    }
    
    cargarDetalle();
    cargarHistorial();
  }, [competenciaSeleccionada]);

  // Carga el historial de snapshots generados
  async function cargarHistorial() {
    if (!competenciaSeleccionada) return;
    setCargandoHistorial(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/reports/snapshots/${competenciaSeleccionada}`, {
        headers: { 'x-user-email': user?.email || '' }
      });
      if (res.ok) {
        const json = await res.json();
        setHistorial(json.data || []);
      }
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setCargandoHistorial(false);
    }
  }

  // Genera el reporte del tipo seleccionado y lo guarda en el historial
  async function generarReporte(tipo) {
    setCargandoReporte(true);
    setTipoReporte(tipo);
    setDatosReporte(null);
    setErrorReporte('');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();

    try {
      let data = null;
      const params = tipo === 'jornada' ? { jornada: jornadaSeleccionada } : {};

      if (tipo === 'posiciones') {
        const res = await fetch(`${backendUrl}/api/competitions/${competenciaSeleccionada}/standings`);
        const json = await res.json();
        data = json.data || [];
      } else {
        let url = '';
        if (tipo === 'jornada') url = `${backendUrl}/api/reports/results/${competenciaSeleccionada}/${jornadaSeleccionada}`;
        else if (tipo === 'proxima') url = `${backendUrl}/api/reports/next-matchday/${competenciaSeleccionada}`;
        else if (tipo === 'consolidado') url = `${backendUrl}/api/reports/consolidated/${competenciaSeleccionada}`;
        else if (tipo === 'nominas') url = `${backendUrl}/api/reports/roster-compliance/${competenciaSeleccionada}`;
        else if (tipo === 'estadisticas') url = `${backendUrl}/api/reports/team-stats/${competenciaSeleccionada}`;
        else if (tipo === 'designaciones') url = `${backendUrl}/api/reports/referee-assignments/${competenciaSeleccionada}`;
        else if (tipo === 'incidentes') url = `${backendUrl}/api/reports/incidents/${competenciaSeleccionada}`;

        const res = await fetch(url, { headers: { 'x-user-email': user?.email || '' } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Error al generar el reporte');
        data = json.data;
      }

      setDatosReporte({ tipo, data });

      // Guarda el snapshot en el backend
      await fetch(`${backendUrl}/api/reports/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
        body: JSON.stringify({
          report_type: tipo,
          competition_id: competenciaSeleccionada,
          parameters: params,
          data: data
        })
      });

      // Recarga el historial
      cargarHistorial();

      // Desplaza la vista hacia abajo para ver el reporte generado
      setTimeout(() => {
        const el = document.getElementById('reporte-generado');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);

    } catch (err) {
      setErrorReporte(err.message || 'Error al generar el reporte');
    } finally {
      setCargandoReporte(false);
    }
  }

  // Descarga un snapshot del historial como CSV
  async function descargarCSVDesdeHistorial(snapshotId) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/reports/snapshot/${snapshotId}`, {
        headers: { 'x-user-email': user?.email || '' }
      });
      if (!res.ok) throw new Error('Error al obtener el snapshot');
      const json = await res.json();
      const snapshot = json.data;

      let headers = [];
      let rows = [];
      const tipo = snapshot.report_type;
      const data = snapshot.data;

      if (tipo === 'jornada' || tipo === 'proxima') {
        headers = ['Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Sede', 'Estado', 'Sets L', 'Sets V'];
        const dataArr = tipo === 'proxima' ? (data.matches || []) : (data || []);
        rows = dataArr.map(m => [m.matchday, m.scheduled_date, m.scheduled_time, m.local?.name || '', m.visitante?.name || '', m.venue || '', m.status, m.home_sets_won || 0, m.away_sets_won || 0]);
      } else if (tipo === 'posiciones') {
        headers = ['Pos', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos'];
        rows = (data || []).map((p, i) => [i + 1, p.team_name, p.matches_played, p.matches_won, p.matches_lost, p.sets_won, p.sets_lost, p.total_points]);
      } else if (tipo === 'consolidado') {
        headers = ['Jornada', 'Fecha', 'Local', 'Visitante', 'Sets L', 'Sets V'];
        rows = (data || []).map(m => [m.matchday, m.scheduled_date, m.local?.name || '', m.visitante?.name || '', m.home_sets_won, m.away_sets_won]);
      } else if (tipo === 'nominas') {
        headers = ['Equipo', 'Integrantes', 'Mínimo', 'Documentos Vencidos', 'Estado'];
        rows = (data || []).map(d => [d.equipo?.name, d.integrantes, d.minimo_requerido, d.documentos_vencidos, d.estado_general]);
      } else if (tipo === 'estadisticas') {
        headers = ['#', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos', 'Ratio Sets', 'Ratio Puntos'];
        rows = (data || []).map((t, i) => [i + 1, t.team_name, t.matches_played, t.matches_won, t.matches_lost, t.sets_won, t.sets_lost, t.total_points, t.ratio_sets, t.ratio_puntos]);
      } else if (csvArbitrajeIncidentes(tipo, data)) {
        ({ headers, rows } = csvArbitrajeIncidentes(tipo, data));
      }

      const csvContent = [headers.join(','), ...rows.map(r => r.map(celdaCSV).join(','))].join('\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Reporte_${tipo}_${competencia?.name.replace(/\s+/g, '_') || 'competencia'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      avisar('Error al descargar CSV: ' + err.message, { tono: 'error' });
    }
  }

  // Descarga un snapshot del historial como PDF (imprimiendo el reporte generado)
  async function descargarPDFDesdeHistorial(snapshotId) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const { data: { user } } = await supabase.auth.getUser();
    try {
      const res = await fetch(`${backendUrl}/api/reports/snapshot/${snapshotId}`, {
        headers: { 'x-user-email': user?.email || '' }
      });
      if (!res.ok) throw new Error('Error al obtener el snapshot');
      const json = await res.json();
      const snapshot = json.data;

      // Carga el snapshot en el estado para que se renderice
      setTipoReporte(snapshot.report_type);
      setDatosReporte({ tipo: snapshot.report_type, data: snapshot.data });

      // Desplaza al área de impresión y llama a la ventana de impresión
      setTimeout(() => {
        const el = document.getElementById('reporte-generado');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => window.print(), 500);
      }, 200);
    } catch (err) {
      avisar('Error al descargar PDF: ' + err.message, { tono: 'error' });
    }
  }

  // Exporta el reporte actual a CSV
  function exportarCSV() {
    if (!datosReporte || !datosReporte.data) return;
    let headers = [];
    let rows = [];

    if (datosReporte.tipo === 'jornada' || datosReporte.tipo === 'proxima') {
      headers = ['Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Sede', 'Estado', 'Sets L', 'Sets V'];
      const dataArr = datosReporte.tipo === 'proxima' ? (datosReporte.data.matches || []) : (datosReporte.data || []);
      rows = dataArr.map(m => [m.matchday, m.scheduled_date, m.scheduled_time, m.local?.name || '', m.visitante?.name || '', m.venue || '', m.status, m.home_sets_won || 0, m.away_sets_won || 0]);
    } else if (datosReporte.tipo === 'posiciones') {
      headers = ['Pos', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos'];
      rows = (datosReporte.data || []).map((p, i) => [i + 1, p.team_name, p.matches_played, p.matches_won, p.matches_lost, p.sets_won, p.sets_lost, p.total_points]);
    } else if (datosReporte.tipo === 'consolidado') {
      headers = ['Jornada', 'Fecha', 'Local', 'Visitante', 'Sets L', 'Sets V'];
      rows = (datosReporte.data || []).map(m => [m.matchday, m.scheduled_date, m.local?.name || '', m.visitante?.name || '', m.home_sets_won, m.away_sets_won]);
    } else if (datosReporte.tipo === 'nominas') {
      headers = ['Equipo', 'Integrantes', 'Mínimo', 'Documentos Vencidos', 'Estado'];
      rows = (datosReporte.data || []).map(d => [d.equipo?.name, d.integrantes, d.minimo_requerido, d.documentos_vencidos, d.estado_general]);
    } else if (datosReporte.tipo === 'estadisticas') {
      headers = ['#', 'Equipo', 'PJ', 'PG', 'PP', 'SG', 'SP', 'Puntos', 'Ratio Sets', 'Ratio Puntos'];
      rows = (datosReporte.data || []).map((t, i) => [i + 1, t.team_name, t.matches_played, t.matches_won, t.matches_lost, t.sets_won, t.sets_lost, t.total_points, t.ratio_sets, t.ratio_puntos]);
    } else if (csvArbitrajeIncidentes(datosReporte.tipo, datosReporte.data)) {
      ({ headers, rows } = csvArbitrajeIncidentes(datosReporte.tipo, datosReporte.data));
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.map(celdaCSV).join(','))].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_${datosReporte.tipo}_${competencia?.name.replace(/\s+/g, '_') || 'competencia'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Imprime el área del reporte
  function imprimirReporte() {
    window.print();
  }

  // Formatea el nombre del tipo de reporte para mostrarlo
  const nombreTipoReporte = (tipo) => {
    const r = REPORTES_DISPONIBLES.find(x => x.key === tipo);
    return r ? r.titulo : tipo;
  };

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Reportes</h1>
          <p className="admin-page-header__subtitle">{REPORTES_DISPONIBLES.length} reportes disponibles</p>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="admin-filters-bar">
        <select className="admin-select" value={competenciaSeleccionada} onChange={(e) => setCompetenciaSeleccionada(e.target.value)} style={{ minWidth: '280px' }}>
          <option value="">Selecciona una competencia</option>
          {competencias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!competenciaSeleccionada ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>
          Selecciona una competencia para generar reportes.
        </div>
      ) : (
        <>
          {/* Grid de reportes disponibles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            {REPORTES_DISPONIBLES.map(r => (
              <div key={r.key} className="admin-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--fuente-titulo)', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--texto)' }}>{r.titulo}</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--texto-mudo)', lineHeight: 1.5, margin: '0 0 20px 0', flex: 1 }}>{r.descripcion}</p>
                
                {r.requiereJornada && (
                  <div className="campo" style={{ marginBottom: '16px' }}>
                    <label className="campo__etiqueta" style={{ fontSize: '0.78rem' }}>Jornada #</label>
                    <input type="number" className="campo__input" min="1" value={jornadaSeleccionada} onChange={(e) => setJornadaSeleccionada(parseInt(e.target.value) || 1)} style={{ fontSize: '0.88rem', padding: '6px 10px' }} />
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--linea)', paddingTop: '16px' }}>
                  {r.noDisponible ? (
                    <>
                      <span style={{ fontSize: '0.75rem', color: 'var(--texto-tenue)', fontWeight: 600 }}>Módulo en construcción</span>
                      <button type="button" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem', padding: '6px 16px' }} disabled>No disponible</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.75rem', color: 'var(--texto-tenue)', fontWeight: 600, letterSpacing: '0.05em' }}>PDF · CSV</span>
                      <button type="button" className="admin-btn admin-btn--primary" style={{ fontSize: '0.82rem', padding: '6px 16px' }} onClick={() => generarReporte(r.key)} disabled={cargandoReporte}>
                        Generar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Área del reporte generado actualmente */}
          <div id="reporte-generado">
            {cargandoReporte ? (
              <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Generando reporte...</div>
            ) : errorReporte ? (
              <div className="admin-banner" style={{ background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' }}>{errorReporte}</div>
            ) : datosReporte ? (
              <div className="admin-card" style={{ padding: '24px' }}>
                <div className="admin-page-header" style={{ marginBottom: '24px' }}>
                  <div className="admin-page-header__title-group">
                    <h2 style={{ fontSize: '1.4rem', margin: 0 }}>{nombreTipoReporte(tipoReporte)}</h2>
                    <p className="admin-page-header__subtitle">{competencia?.name}</p>
                  </div>
                  <div className="admin-page-header__actions">
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={exportarCSV}>Descargar CSV</button>
                    <button type="button" className="admin-btn admin-btn--primary" onClick={imprimirReporte}>Descargar PDF</button>
                  </div>
                </div>

                <div id="area-impresion" style={{ background: '#fff', padding: '32px', border: '1px solid var(--linea)', borderRadius: '8px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '32px', borderBottom: '2px solid var(--texto)', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.8rem', margin: '0 0 8px 0' }}>{competencia?.name}</h2>
                    <p style={{ margin: 0, color: 'var(--texto-mudo)', fontWeight: 600 }}>
                      {nombreTipoReporte(tipoReporte)}
                      {datosReporte.tipo === 'jornada' && ` · Jornada ${jornadaSeleccionada}`}
                      {datosReporte.tipo === 'proxima' && datosReporte.data?.matchday && ` · Próxima jornada #${datosReporte.data.matchday}`}
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--texto-tenue)' }}>Generado el {new Date().toLocaleDateString('es-CR')}</p>
                  </div>

                  {['jornada', 'proxima'].includes(datosReporte.tipo) && (
                    <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr><th>Jornada</th><th>Fecha</th><th>Hora</th><th>Local</th><th style={{ textAlign: 'center' }}>Resultado</th><th>Visitante</th><th>Sede</th></tr>
                      </thead>
                      <tbody>
                        {datosReporte.tipo === 'proxima' ? (
                          (datosReporte.data.matches || []).map((m, i) => (
                            <tr key={i}>
                              <td>{m.matchday}</td>
                              <td>{formatearFecha(m.scheduled_date)}</td>
                              <td>{m.scheduled_time?.slice(0, 5)}</td>
                              <td style={{ fontWeight: 600 }}>{m.local?.name}</td>
                              <td style={{ textAlign: 'center', fontWeight: 800 }}>vs</td>
                              <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                              <td>{m.venue || 'Por definir'}</td>
                            </tr>
                          ))
                        ) : (
                          (datosReporte.data || []).map((m, i) => (
                            <tr key={i}>
                              <td>{m.matchday}</td>
                              <td>{formatearFecha(m.scheduled_date)}</td>
                              <td>{m.scheduled_time?.slice(0, 5)}</td>
                              <td style={{ fontWeight: 600, textAlign: 'right' }}>{m.local?.name}</td>
                              <td style={{ textAlign: 'center', fontWeight: 800, color: m.status === 'FINALIZADO' ? 'var(--azul)' : 'inherit' }}>
                                {m.status === 'FINALIZADO' ? `${m.home_sets_won} - ${m.away_sets_won}` : 'Pendiente'}
                              </td>
                              <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                              <td>{m.venue || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}

                  {datosReporte.tipo === 'posiciones' && (
                    <table className="admin-table" style={{ border: '1px solid var(--borde)', textAlign: 'center' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr><th>#</th><th style={{ textAlign: 'left' }}>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th><th>PTS</th></tr>
                      </thead>
                      <tbody>
                        {(datosReporte.data || []).map((p, i) => (
                          <tr key={i} style={{ backgroundColor: i < 4 ? '#f0f9ff' : '#fff' }}>
                            <td style={{ fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ textAlign: 'left', fontWeight: 600 }}>{p.team_name}</td>
                            <td>{p.matches_played}</td><td>{p.matches_won}</td><td>{p.matches_lost}</td>
                            <td>{p.sets_won}</td><td>{p.sets_lost}</td>
                            <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{p.total_points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {datosReporte.tipo === 'consolidado' && (
                    <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr><th>Jornada</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Local</th><th style={{ textAlign: 'center' }}>Sets</th><th>Visitante</th></tr>
                      </thead>
                      <tbody>
                        {(datosReporte.data || []).map((m, i) => (
                          <tr key={i}>
                            <td>{m.matchday}</td><td>{formatearFecha(m.scheduled_date)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.local?.name}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--azul)' }}>{m.home_sets_won} - {m.away_sets_won}</td>
                            <td style={{ fontWeight: 600 }}>{m.visitante?.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {datosReporte.tipo === 'nominas' && (
                    <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr><th>Equipo</th><th>Integrantes</th><th>Mínimo</th><th>Docs. Vencidos</th><th>Estado</th><th>Detalle</th></tr>
                      </thead>
                      <tbody>
                        {(datosReporte.data || []).map((d, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{d.equipo?.name}</td>
                            <td>{d.integrantes}</td>
                            <td>{d.minimo_requerido}</td>
                            <td style={{ color: d.documentos_vencidos > 0 ? 'var(--rojo)' : 'inherit' }}>{d.documentos_vencidos}</td>
                            <td>
                              <span className={`badge-status ${d.estado_general === 'COMPLETO' ? 'badge-status--activa' : 'badge-status--suspendida'}`}>
                                {d.estado_general}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>{d.detalle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {datosReporte.tipo === 'estadisticas' && (
                    <table className="admin-table" style={{ border: '1px solid var(--borde)', textAlign: 'center' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr><th>#</th><th style={{ textAlign: 'left' }}>Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SG</th><th>SP</th><th>PTS</th><th>Ratio Sets</th><th>Ratio Pts</th></tr>
                      </thead>
                      <tbody>
                        {(datosReporte.data || []).map((t, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ textAlign: 'left', fontWeight: 600 }}>{t.team_name}</td>
                            <td>{t.matches_played}</td><td>{t.matches_won}</td><td>{t.matches_lost}</td>
                            <td>{t.sets_won}</td><td>{t.sets_lost}</td>
                            <td style={{ fontWeight: 800, color: 'var(--azul)' }}>{t.total_points}</td>
                            <td>{t.ratio_sets}</td><td>{t.ratio_puntos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {datosReporte.tipo === 'designaciones' && (
                    <>
                      <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px 0' }}>Resumen por árbitro</h3>
                      <table className="admin-table" style={{ border: '1px solid var(--borde)', marginBottom: '28px' }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr><th>Árbitro</th><th style={{ textAlign: 'center' }}>Partidos</th><th style={{ textAlign: 'center' }}>Confirmados</th><th style={{ textAlign: 'center' }}>Por confirmar</th><th style={{ textAlign: 'center' }}>Sin acreditación vigente</th></tr>
                        </thead>
                        <tbody>
                          {(datosReporte.data?.por_arbitro || []).map((a, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{a.arbitro}</td>
                              <td style={{ textAlign: 'center' }}>{a.partidos}</td>
                              <td style={{ textAlign: 'center' }}>{a.confirmadas}</td>
                              <td style={{ textAlign: 'center' }}>{a.pendientes}</td>
                              <td style={{ textAlign: 'center', fontWeight: a.sin_acreditacion ? 700 : 400, color: a.sin_acreditacion ? 'var(--rojo)' : 'inherit' }}>{a.sin_acreditacion}</td>
                            </tr>
                          ))}
                          {!(datosReporte.data?.por_arbitro || []).length && (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--texto-mudo)' }}>Esta competencia no tiene designaciones arbitrales.</td></tr>
                          )}
                        </tbody>
                      </table>
                      {(datosReporte.data?.filas || []).length > 0 && (
                        <>
                          <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px 0' }}>Detalle por partido</h3>
                          <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                            <thead style={{ background: '#f8fafc' }}>
                              <tr><th>Fecha</th><th>Partido</th><th>Árbitro</th><th>Puesto</th><th>Estado</th><th>Acreditación vigente</th></tr>
                            </thead>
                            <tbody>
                              {datosReporte.data.filas.map((f, i) => (
                                <tr key={i}>
                                  <td>{formatearFecha(f.fecha)}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}</td>
                                  <td style={{ fontWeight: 600 }}>{f.partido}{f.jornada ? <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--texto-mudo)', fontWeight: 400 }}>Jornada {f.jornada}</span> : null}</td>
                                  <td>{f.arbitro}</td>
                                  <td>{f.puesto}</td>
                                  <td>{ESTADO_DESIGNACION[f.estado] || f.estado}</td>
                                  <td style={{ color: f.acreditacion ? 'inherit' : 'var(--rojo)', fontWeight: f.acreditacion ? 400 : 600 }}>{textoAcreditacion(f.acreditacion)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </>
                  )}

                  {datosReporte.tipo === 'incidentes' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '28px' }}>
                        {[
                          ['Expedientes', datosReporte.data?.resumen?.total],
                          ['Abiertos', datosReporte.data?.resumen?.abiertos],
                          ['En seguimiento', datosReporte.data?.resumen?.en_seguimiento],
                          ['Con sanción', datosReporte.data?.resumen?.con_sancion],
                          ['Resueltos', datosReporte.data?.resumen?.resueltos],
                          ['Archivados', datosReporte.data?.resumen?.archivados],
                          ['Sanciones vigentes', datosReporte.data?.resumen?.sanciones_vigentes]
                        ].map(([texto, valor]) => (
                          <div key={texto} style={{ border: '1px solid var(--linea)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--azul)' }}>{valor ?? 0}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>{texto}</div>
                          </div>
                        ))}
                      </div>
                      <table className="admin-table" style={{ border: '1px solid var(--borde)' }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr><th>Expediente</th><th>Fecha</th><th>Hechos</th><th>Involucrados</th><th>Estado</th><th>Sanciones</th></tr>
                        </thead>
                        <tbody>
                          {(datosReporte.data?.expedientes || []).map((e, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{e.numero}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{e.fecha ? formatearFecha(e.fecha) : '—'}</td>
                              <td>
                                <span style={{ fontWeight: 600 }}>{e.titulo}</span>
                                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--texto-mudo)' }}>{[e.tipo, e.partido].filter(Boolean).join(' · ')}</span>
                              </td>
                              <td>{(e.involucrados || []).join(', ') || '—'}</td>
                              <td>{ESTADO_EXPEDIENTE[e.estado] || e.estado}</td>
                              <td style={{ fontSize: '0.82rem' }}>
                                {(e.sanciones || []).length ? e.sanciones.map((x, j) => (
                                  <span key={j} style={{ display: 'block', textDecoration: x.estado === 'ANULADA' ? 'line-through' : 'none', color: x.estado === 'VIGENTE' ? 'var(--texto)' : 'var(--texto-mudo)' }}>
                                    {x.sancionado}: {x.sancion} · {ESTADO_SANCION[x.estado] || x.estado}
                                  </span>
                                )) : '—'}
                              </td>
                            </tr>
                          ))}
                          {!(datosReporte.data?.expedientes || []).length && (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--texto-mudo)' }}>Esta competencia no tiene expedientes disciplinarios.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </>
                  )}

                  <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--texto-tenue)', borderTop: '1px solid var(--linea)', paddingTop: '16px' }}>
                    Federación Costarricense de Voleibol - Documento Oficial
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Generados recientemente */}
          <div className="admin-card" style={{ marginTop: '32px' }}>
            <div className="admin-card__header">
              <h2 className="admin-card__title">Generados recientemente</h2>
              <span className="admin-card__badge">{historial.length} reportes</span>
            </div>
            {cargandoHistorial ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--texto-mudo)' }}>Cargando historial...</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reporte</th>
                    <th>Generado por</th>
                    <th>Fecha</th>
                    <th>Formato</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong style={{ color: 'var(--texto)' }}>{nombreTipoReporte(item.report_type)}</strong>
                        {item.parameters?.jornada && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)', marginLeft: '6px' }}>
                            (Jornada {item.parameters.jornada})
                          </span>
                        )}
                      </td>
                      <td>{item.generated_by}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>
                        {new Date(item.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className="badge-status" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem' }}>PDF · CSV</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button type="button" className="admin-btn admin-btn--secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => descargarCSVDesdeHistorial(item.id)}>Descargar CSV</button>
                          <button type="button" className="admin-btn admin-btn--primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => descargarPDFDesdeHistorial(item.id)}>Descargar PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {historial.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--texto-mudo)' }}>No hay reportes generados todavía.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}