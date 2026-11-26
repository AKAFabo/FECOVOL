import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { obtenerResumenAdmin } from '../../services/administracion.js';
import { supabase } from '../../supabaseClient.js';
import './AdminCommon.css';
import './AdminInicio.css';
import Icono from '../../components/Icono.jsx';

function formatearFecha(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatearHora(iso, horaStr) {
  if (horaStr) return horaStr.slice(0, 5);
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function AdminInicio() {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Intentar obtener el resumen ejecutivo consolidado del backend
      const data = await obtenerResumenAdmin();
      setResumen(data);
      setUltimaActualizacion(new Date());
    } catch (err) {
      console.warn('Error al consultar endpoint de resumen, intentando consulta directa:', err);
      // Fallback directo a Supabase en caso de indisponibilidad del servicio de reportes
      try {
        const ahora = new Date();
        const hoyStr = ahora.toISOString().slice(0, 10);
        const enTreintaStr = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const [
          { data: asocs },
          { count: countPersonas },
          { count: countVerificadas },
          { count: countAtletas },
          { count: countTecnicos },
          { count: countArbitros },
          { data: comps },
          { data: matches },
          { data: docs }
        ] = await Promise.all([
          supabase.from('associations').select('id, name, short_name, status, province, canton').order('name'),
          supabase.from('persons').select('id', { count: 'exact', head: true }),
          supabase.from('persons').select('id', { count: 'exact', head: true }).eq('is_verified', true),
          supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'JUGADOR').eq('is_active', true),
          supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'TECNICO').eq('is_active', true),
          supabase.from('person_roles').select('person_id', { count: 'exact', head: true }).eq('role_type', 'ARBITRO').eq('is_active', true),
          supabase.from('competitions').select('id, name, season, status').in('status', ['EN_CURSO', 'INSCRIPCIONES', 'PLANIFICACION']),
          supabase.from('matches').select('id, scheduled_date, scheduled_time, status, home_sets_won, away_sets_won, matchday, competition:competitions(name), local:teams!matches_home_team_id_fkey(name), visitante:teams!matches_away_team_id_fkey(name)').limit(15),
          supabase.from('v_documentos').select('id, file_name, tipo_value, status, expiry_date, notes, asociacion_name, equipo_name, persona_first_name, persona_last_name').order('created_at', { ascending: false }).limit(25)
        ]);

        const listaAso = asocs || [];
        const listaComps = comps || [];
        const listaPartidos = matches || [];
        const listaDocs = docs || [];

        const alertasItems = [];
        let docPendientes = 0;
        let licPorVencer = 0;
        let docVencidos = 0;

        listaDocs.forEach(d => {
          const esVencido = d.status === 'VENCIDO' || (d.expiry_date && d.expiry_date < hoyStr && d.status !== 'RECHAZADO');
          const esPendiente = d.status === 'EN_REVISION' || d.status === 'PENDIENTE';
          const esPorVencer = !esVencido && !esPendiente && d.status === 'VIGENTE' && d.expiry_date && d.expiry_date <= enTreintaStr;

          if (!esVencido && !esPendiente && !esPorVencer) return;

          let urgencia = 'MEDIA';
          let titulo = 'Documento pendiente de validación';
          if (esVencido) {
            urgencia = 'ALTA';
            titulo = 'Documento / Licencia vencida';
            docVencidos++;
          } else if (esPendiente) {
            urgencia = 'ALTA';
            titulo = 'Documento pendiente de validación';
            docPendientes++;
          } else if (esPorVencer) {
            urgencia = 'MEDIA';
            titulo = 'Licencia próxima a expirar (30 días)';
            licPorVencer++;
          }

          alertasItems.push({
            id: d.id,
            urgencia,
            titulo,
            titular: d.persona_first_name ? `${d.persona_first_name} ${d.persona_last_name || ''}`.trim() : (d.equipo_name || d.asociacion_name || 'Asociación'),
            nombreArchivo: d.file_name,
            tipoDocumento: d.tipo_value,
            fechaVencimiento: d.expiry_date,
            notas: d.notes,
            enlace: '/admin/documentos'
          });
        });

        setResumen({
          asociaciones: {
            total: listaAso.length,
            afiliadas: listaAso.filter(a => a.status === 'AFILIADA').length,
            provisionales: listaAso.filter(a => a.status === 'PROVISIONAL').length,
            suspendidas: listaAso.filter(a => a.status === 'SUSPENDIDA').length,
            vigenciaLegal: { alDia: listaAso.length - docVencidos, conObservaciones: docPendientes, vencidas: docVencidos },
            lista: listaAso.map(a => ({ ...a, estadoLegal: 'AL_DIA' }))
          },
          padronPersonas: {
            total: countPersonas || 0,
            verificadas: countVerificadas || 0,
            atletasActivos: countAtletas || 0,
            entrenadoresActivos: countTecnicos || 0,
            arbitrosActivos: countArbitros || 0
          },
          competencias: {
            totalEnCurso: listaComps.filter(c => c.status === 'EN_CURSO').length,
            totalInscripciones: listaComps.filter(c => c.status === 'INSCRIPCIONES').length,
            totalPlanificacion: listaComps.filter(c => c.status === 'PLANIFICACION').length,
            partidosSemanaDisputados: listaPartidos.filter(m => m.status === 'FINALIZADO').length,
            partidosSemanaProgramados: listaPartidos.filter(m => m.status === 'PROGRAMADO').length,
            listaEnCurso: listaComps,
            partidosRecientes: listaPartidos
          },
          alertas: {
            total: alertasItems.length,
            documentosPendientes: docPendientes,
            licenciasPorVencer: licPorVencer,
            documentosVencidos: docVencidos,
            items: alertasItems
          }
        });
        setUltimaActualizacion(new Date());
      } catch (errFallback) {
        console.error('Error total al cargar resumen:', errFallback);
        setError('No fue posible cargar el resumen ejecutivo en tiempo real.');
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const asoc = resumen?.asociaciones || {
    total: 0,
    afiliadas: 0,
    provisionales: 0,
    suspendidas: 0,
    vigenciaLegal: { alDia: 0, conObservaciones: 0, vencidas: 0 },
    lista: []
  };

  const padron = resumen?.padronPersonas || {
    total: 0,
    verificadas: 0,
    atletasActivos: 0,
    entrenadoresActivos: 0,
    arbitrosActivos: 0
  };

  const comps = resumen?.competencias || {
    totalEnCurso: 0,
    totalInscripciones: 0,
    totalPlanificacion: 0,
    partidosSemanaDisputados: 0,
    partidosSemanaProgramados: 0,
    listaEnCurso: [],
    partidosRecientes: []
  };

  const alertas = resumen?.alertas || {
    total: 0,
    documentosPendientes: 0,
    licenciasPorVencer: 0,
    documentosVencidos: 0,
    items: []
  };

  return (
    <div>
      {/* Encabezado con estado y acción de refrescar */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Panel general de administración</h1>
          <p className="admin-page-header__subtitle">
            Resumen ejecutivo en tiempo real del estado federativo, competencias y gestión institucional.
          </p>
        </div>
        <div className="admin-page-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {ultimaActualizacion && (
            <span style={{ fontSize: '0.82rem', color: 'var(--texto-mudo)' }}>
              Actualizado: {ultimaActualizacion.toLocaleTimeString('es-CR')}
            </span>
          )}
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={cargarDatos}
            disabled={cargando}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {cargando ? 'Actualizando...' : 'Actualizar datos'}
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alerta admin-alerta--error" style={{ marginBottom: '20px' }}>
          <span>{error}</span>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={cargarDatos}
            style={{ marginLeft: '12px', padding: '4px 10px', fontSize: '0.8rem' }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* 1. Indicadores Clave en Tiempo Real (KPI Cards) */}
      <div className="dashboard-kpi-grid">
        {/* KPI 1: Asociaciones y Vigencia Legal */}
        <div className="dashboard-kpi-card dashboard-kpi-card--primary">
          <div>
            <div className="dashboard-kpi-header">
              <span className="dashboard-kpi-title">Asociaciones Afiliadas</span>
            </div>
            <div className="dashboard-kpi-value">{asoc.total}</div>
            <div className="dashboard-kpi-badges">
              <span className="dashboard-badge dashboard-badge--ok" title="Asociaciones con personería y requisitos al día">
                {asoc.vigenciaLegal.alDia} al día
              </span>
              {asoc.vigenciaLegal.conObservaciones > 0 && (
                <span className="dashboard-badge dashboard-badge--warning" title="Asociaciones con documentos en revisión o por vencer">
                  {asoc.vigenciaLegal.conObservaciones} con observaciones
                </span>
              )}
              {asoc.vigenciaLegal.vencidas > 0 && (
                <span className="dashboard-badge dashboard-badge--danger" title="Asociaciones con personería o documentos vencidos">
                  {asoc.vigenciaLegal.vencidas} vencidas
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
              {asoc.afiliadas} afiliadas activas &bull; {asoc.provisionales} provisionales
            </div>
          </div>
          <div className="dashboard-kpi-footer">
            <Link to="/admin/asociaciones" className="dashboard-kpi-link">
              Directorio de asociaciones &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 2: Padrón Central de Personas */}
        <div className="dashboard-kpi-card dashboard-kpi-card--success">
          <div>
            <div className="dashboard-kpi-header">
              <span className="dashboard-kpi-title">Padrón Central de Personas</span>
            </div>
            <div className="dashboard-kpi-value">{padron.total}</div>
            <div className="dashboard-kpi-badges">
              <span className="dashboard-badge dashboard-badge--neutral" title="Atletas federados activos">
                {padron.atletasActivos} atletas
              </span>
              <span className="dashboard-badge dashboard-badge--neutral" title="Entrenadores y cuerpo técnico">
                {padron.entrenadoresActivos} técnicos
              </span>
              <span className="dashboard-badge dashboard-badge--neutral" title="Cuerpo arbitral federado">
                {padron.arbitrosActivos} árbitros
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
              {padron.verificadas} identidades verificadas ({padron.total > 0 ? Math.round((padron.verificadas / padron.total) * 100) : 0}%)
            </div>
          </div>
          <div className="dashboard-kpi-footer">
            <Link to="/admin/personas" className="dashboard-kpi-link">
              Consultar padrón central &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 3: Competencias y Partidos de la Semana */}
        <div className="dashboard-kpi-card dashboard-kpi-card--info">
          <div>
            <div className="dashboard-kpi-header">
              <span className="dashboard-kpi-title">Competencias en Curso</span>
            </div>
            <div className="dashboard-kpi-value">{comps.totalEnCurso}</div>
            <div className="dashboard-kpi-badges">
              <span className="dashboard-badge dashboard-badge--ok" title="Partidos disputados durante esta semana">
                <Icono nombre="check" tam={14} /> {comps.partidosSemanaDisputados} jugados esta semana
              </span>
              <span className="dashboard-badge dashboard-badge--neutral" title="Partidos programados pendientes de disputa">
                <Icono nombre="reloj" tam={14} /> {comps.partidosSemanaProgramados} programados
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
              {comps.totalInscripciones} en inscripciones &bull; {comps.totalPlanificacion} en diseño
            </div>
          </div>
          <div className="dashboard-kpi-footer">
            <Link to="/admin/competencias" className="dashboard-kpi-link">
              Módulo de competencias &rarr;
            </Link>
          </div>
        </div>

        {/* KPI 4: Alertas de Documentación y Licencias */}
        <div className={`dashboard-kpi-card ${alertas.total > 0 ? 'dashboard-kpi-card--warning' : 'dashboard-kpi-card--neutral'}`}>
          <div>
            <div className="dashboard-kpi-header">
              <span className="dashboard-kpi-title">Alertas de Documentación</span>
            </div>
            <div className="dashboard-kpi-value">{alertas.total}</div>
            <div className="dashboard-kpi-badges">
              {alertas.documentosPendientes > 0 && (
                <span className="dashboard-badge dashboard-badge--warning" title="Documentos en espera de validación">
                  {alertas.documentosPendientes} por validar
                </span>
              )}
              {alertas.licenciasPorVencer > 0 && (
                <span className="dashboard-badge dashboard-badge--neutral" title="Licencias que expiran en menos de 30 días">
                  {alertas.licenciasPorVencer} por expirar
                </span>
              )}
              {alertas.documentosVencidos > 0 && (
                <span className="dashboard-badge dashboard-badge--danger" title="Documentos o pólizas ya expiradas">
                  {alertas.documentosVencidos} vencidos
                </span>
              )}
              {alertas.total === 0 && (
                <span className="dashboard-badge dashboard-badge--ok">Al día</span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-mudo)' }}>
              {alertas.documentosPendientes > 0 ? 'Requieren revisión en bandeja de entrada' : 'Sin trámites urgentes pendientes'}
            </div>
          </div>
          <div className="dashboard-kpi-footer">
            <Link to="/admin/documentos" className="dashboard-kpi-link">
              Bandeja de documentos &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Sección de Alertas Inmediatas */}
      {alertas.items && alertas.items.length > 0 && (
        <div className="dashboard-section-card" style={{ marginBottom: '24px' }}>
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              <Icono nombre="campana" tam={18} /> Alertas Inmediatas y Trámites Pendientes
            </h2>
            <span className="dashboard-section-badge">{alertas.items.length} pendientes</span>
          </div>

          <div className="dashboard-alert-list">
            {alertas.items.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className={`dashboard-alert-item ${
                  item.urgencia === 'ALTA'
                    ? 'dashboard-alert-item--alta'
                    : item.urgencia === 'MEDIA'
                    ? 'dashboard-alert-item--media'
                    : 'dashboard-alert-item--baja'
                }`}
              >
                <div className="dashboard-alert-content">
                  <div className="dashboard-alert-title">
                    {item.titulo}: <span style={{ fontWeight: 600 }}>{item.titular}</span>
                  </div>
                  <div className="dashboard-alert-subtitle">
                    {item.tipoDocumento && <span>Tipo: {item.tipoDocumento} &bull; </span>}
                    {item.nombreArchivo && <span>Archivo: {item.nombreArchivo} &bull; </span>}
                    {item.fechaVencimiento && (
                      <span style={{ fontWeight: 600 }}>
                        Vence: {formatearFecha(item.fechaVencimiento)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dashboard-alert-action">
                  <Link to={item.enlace || '/admin/documentos'} className="admin-btn admin-btn--secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    Revisar &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {alertas.items.length > 6 && (
            <div style={{ marginTop: '14px', textAlign: 'center' }}>
              <Link to="/admin/documentos" className="dashboard-kpi-link">
                Ver las {alertas.items.length} alertas en la bandeja de documentos &rarr;
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 3. Grilla Dividida: Estado Legal de Asociaciones y Competencias en Curso */}
      <div className="dashboard-split-grid">
        {/* Columna Izquierda: Directorio y Vigencia Legal de Asociaciones */}
        <div className="dashboard-section-card">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              <span></span> Vigencia Legal de Asociaciones
            </h2>
            <Link to="/admin/asociaciones" className="dashboard-kpi-link">
              Ver todas ({asoc.total}) &rarr;
            </Link>
          </div>

          {asoc.lista && asoc.lista.length > 0 ? (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Asociación</th>
                    <th>Estado Federativo</th>
                    <th>Vigencia Legal</th>
                  </tr>
                </thead>
                <tbody>
                  {asoc.lista.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/admin/asociaciones/${a.id}`} style={{ fontWeight: 600, color: 'var(--azul-primario, #082846)', textDecoration: 'none' }}>
                          {a.name}
                        </Link>
                        {a.canton && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>
                            {a.canton}, {a.province}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`dashboard-badge ${
                            a.status === 'AFILIADA'
                              ? 'dashboard-badge--ok'
                              : a.status === 'PROVISIONAL'
                              ? 'dashboard-badge--warning'
                              : 'dashboard-badge--danger'
                          }`}
                        >
                          {a.status === 'AFILIADA'
                            ? 'Afiliada'
                            : a.status === 'PROVISIONAL'
                            ? 'Provisional'
                            : 'Suspendida'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`dashboard-badge ${
                            a.estadoLegal === 'AL_DIA'
                              ? 'dashboard-badge--ok'
                              : a.estadoLegal === 'CON_OBSERVACIONES'
                              ? 'dashboard-badge--warning'
                              : 'dashboard-badge--danger'
                          }`}
                        >
                          {a.estadoLegal === 'AL_DIA'
                            ? 'Al día'
                            : a.estadoLegal === 'CON_OBSERVACIONES'
                            ? 'Observación'
                            : 'Vencida'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dashboard-empty">
              No hay asociaciones registradas actualmente.
            </div>
          )}
        </div>

        {/* Columna Derecha: Competencias Activas y Partidos de la Semana */}
        <div className="dashboard-section-card">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              <span></span> Actividad Semanal de Partidos
            </h2>
            <Link to="/personal/calendario" className="dashboard-kpi-link">
              Calendario completo &rarr;
            </Link>
          </div>

          {comps.partidosRecientes && comps.partidosRecientes.length > 0 ? (
            <div>
              {comps.partidosRecientes.slice(0, 7).map((p) => (
                <div key={p.id} className="dashboard-match-item">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="dashboard-match-teams">
                      {p.local?.name || 'Local'} vs {p.visitante?.name || 'Visitante'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--texto-mudo)' }}>
                      {p.competition?.name ? `${p.competition.name} · ` : ''}
                      Fecha: {formatearFecha(p.scheduled_date)} {formatearHora(p.scheduled_date, p.scheduled_time)}
                    </div>
                  </div>
                  <div>
                    {p.status === 'FINALIZADO' ? (
                      <span className="dashboard-match-score" title="Resultado final de sets">
                        {p.home_sets_won ?? 0} - {p.away_sets_won ?? 0}
                      </span>
                    ) : (
                      <span className="dashboard-badge dashboard-badge--neutral">
                        {p.status === 'EN_JUEGO' ? 'En juego' : 'Programado'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              No hay partidos disputados o programados para la semana en curso.
            </div>
          )}

          {comps.listaEnCurso && comps.listaEnCurso.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--borde)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px', color: 'var(--texto-mudo)' }}>
                TORNEOS EN CURSO:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {comps.listaEnCurso.map((c) => (
                  <Link
                    key={c.id}
                    to={`/personal/competencia/${c.id}`}
                    className="dashboard-badge dashboard-badge--neutral"
                    style={{ textDecoration: 'none' }}
                  >
                    <Icono nombre="trofeo" tam={14} /> {c.name} {c.season ? `(${c.season})` : ''}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Módulos y Accesos Rápidos de Administración */}
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '16px', color: 'var(--texto)' }}>
          Módulos de Gestión Administrativa
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {/* Card Usuarios */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Usuarios y permisos</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Control de cuentas, roles federativos, ámbito institucional y estados de acceso.
            </p>
            <Link to="/admin/usuarios" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Gestionar cuentas &rarr;
            </Link>
          </div>

          {/* Card Catálogos */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Listas de valores</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Parametrización de categorías, ramas, modalidades y estados con consistencia histórica.
            </p>
            <Link to="/admin/listas-valores" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Catálogos oficiales &rarr;
            </Link>
          </div>

          {/* Card Auditoría */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Auditoría y respaldos</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Bitácora inmutable de transacciones, verificación de integridad y respaldos del sistema.
            </p>
            <Link to="/admin/auditoria" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Bitácora de seguridad &rarr;
            </Link>
          </div>

          {/* Card Noticias */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Noticias y comunicados</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Publicación de novedades, comunicados oficiales y difusión de actividades de la federación.
            </p>
            <Link to="/admin/noticias" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Gestionar boletines &rarr;
            </Link>
          </div>

          {/* Card Parámetros */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Parámetros del sistema</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Ajustes de periodos de gracia, bloqueos automáticos y directrices de operación.
            </p>
            <Link to="/admin/parametros" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Configurar reglas &rarr;
            </Link>
          </div>

          {/* Card Arbitraje */}
          <div className="admin-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', color: 'var(--texto)' }}>Arbitraje federativo</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--texto-mudo)', marginBottom: '16px' }}>
              Acreditación de colegiados, cursos de formación continua y control de designaciones.
            </p>
            <Link to="/admin/arbitraje" className="admin-btn admin-btn--secondary" style={{ fontSize: '0.82rem' }}>
              Colegio de árbitros &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
