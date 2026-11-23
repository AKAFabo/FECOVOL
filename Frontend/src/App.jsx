import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layout público (portal web)
import PublicLayout from './layouts/PublicLayout.jsx';
import Inicio from './pages/public/Inicio.jsx';
import EnConstruccion from './pages/public/EnConstruccion.jsx';
import Ingresar from './pages/public/Ingresar.jsx';

// Guard de rutas protegidas
import RutaProtegida from './components/RutaProtegida.jsx';

// Layout administrativo
import AdminLayout from './layouts/AdminLayout.jsx';
import AdminInicio from './pages/admin/AdminInicio.jsx';
import UsuariosPermisos from './pages/admin/usuarios/UsuariosPermisos.jsx';
import ListasValores from './pages/admin/catalogos/ListasValores.jsx';
import AuditoriaRespaldos from './pages/admin/auditoria/AuditoriaRespaldos.jsx';
import NoticiasComunicados from './pages/admin/noticias/NoticiasComunicados.jsx';
import RedactarNoticia from './pages/admin/noticias/RedactarNoticia.jsx';
import ParametrosSistema from './pages/admin/parametros/ParametrosSistema.jsx';
import Perfil from './pages/admin/perfil/Perfil.jsx';

// Incidentes y sanciones: expedientes disciplinarios y catálogo de faltas.
import Incidentes from './pages/admin/incidentes/Incidentes.jsx';
import CatalogoFaltas from './pages/admin/incidentes/CatalogoFaltas.jsx';
import AbrirExpediente from './pages/admin/incidentes/AbrirExpediente.jsx';
import Expediente from './pages/admin/incidentes/Expediente.jsx';

// Gestión federativa (Estudiante 3): asociaciones, equipos, personas y documentos. Se cargan al
// abrirlas para no agrandar el resto de la aplicación.
import GestionFederativa from './pages/admin/federativo/GestionFederativa.jsx';
const AsociacionesFecovol = lazy(() => import('./pages/admin/federativo/Asociaciones.jsx'));
const AfiliarAsociacion = lazy(() => import('./pages/admin/federativo/AfiliarAsociacion.jsx'));
const AsociacionDetalleFecovol = lazy(() => import('./pages/admin/federativo/AsociacionDetalle.jsx'));
const PersonasFecovol = lazy(() => import('./pages/admin/federativo/Personas.jsx'));
const PersonaFichaFecovol = lazy(() => import('./pages/admin/federativo/PersonaFicha.jsx'));
const DocumentosFecovol = lazy(() => import('./pages/admin/federativo/Documentos.jsx'));
const EquipoDetalle = lazy(() => import('./pages/asociacion/EquipoDetalle.jsx'));
const EquipoForm = lazy(() => import('./pages/asociacion/EquipoForm.jsx'));
const PersonaForm = lazy(() => import('./pages/asociacion/PersonaForm.jsx'));

// Arbitraje (Estudiante 3): cuerpo arbitral, acreditaciones, cursos y designaciones.
const Arbitraje = lazy(() => import('./pages/admin/arbitraje/Arbitraje.jsx'));
const AcreditarArbitro = lazy(() => import('./pages/admin/arbitraje/AcreditarArbitro.jsx'));
const FichaArbitro = lazy(() => import('./pages/admin/arbitraje/FichaArbitro.jsx'));
const CursosArbitraje = lazy(() => import('./pages/admin/arbitraje/Cursos.jsx'));
const CursoArbitraje = lazy(() => import('./pages/admin/arbitraje/CursoDetalle.jsx'));
const ProgramarCurso = lazy(() => import('./pages/admin/arbitraje/ProgramarCurso.jsx'));
const Designaciones = lazy(() => import('./pages/admin/arbitraje/Designaciones.jsx'));

// Paneles protegidos por entorno/rol
import ArbitroPanel from './pages/arbitro/ArbitroPanel.jsx';
import AsociacionPanel from './pages/asociacion/AsociacionPanel.jsx';

// MÓDULO DE COMPETENCIAS (Estudiante 2)
import PersonalPanel from './pages/personal/PersonalPanel.jsx';
import CompetenciaDetalle from './pages/personal/CompetenciaDetalle.jsx';
import Inscripciones from './pages/personal/Inscripciones.jsx';
import CalendarioPartidos from './pages/personal/CalendarioPartidos.jsx';
import Resultados from './pages/personal/Resultados.jsx';
import ResultadoDetalle from './pages/personal/ResultadoDetalle.jsx';
import Reportes from './pages/personal/Reportes.jsx';
import CompetenciasPublicas from './pages/public/CompetenciasPublicas.jsx';
import CompetenciaDetallePublica from './pages/public/CompetenciaDetallePublica.jsx';
import EquipoCompetenciaPublica from './pages/public/EquipoCompetenciaPublica.jsx';

// Layout del Personal de Competencias
import PersonalLayout from './layouts/PersonalLayout.jsx';

// Asociaciones afiliadas (portal público) - Estudiante 4
import AsociacionesPublicas from './pages/public/AsociacionesPublicas.jsx';
import AsociacionDetallePublica from './pages/public/AsociacionDetallePublica.jsx';

// Noticias (portal público) - Estudiante 4
import NoticiasPublicas from './pages/public/NoticiasPublicas.jsx';
import NoticiaDetallePublica from './pages/public/NoticiaDetallePublica.jsx';

// Selecciones nacionales (portal público) - Estudiante 4
import SeleccionesPublicas from './pages/public/SeleccionesPublicas.jsx';

// La Federación (portal público) - Estudiante 4
import LaFederacion from './pages/public/LaFederacion.jsx';

export default function App() {
  return (
    <Routes>
      {/* ── Portal público ────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route index element={<Inicio />} />
        <Route path="competencias" element={<CompetenciasPublicas />} />
        <Route path="competencias/:id" element={<CompetenciaDetallePublica />} />
        <Route path="competencias/:id/equipos/:equipoId" element={<EquipoCompetenciaPublica />} />
        <Route path="selecciones" element={<SeleccionesPublicas />} />
        <Route path="asociaciones" element={<AsociacionesPublicas />} />
        <Route path="asociaciones/:id" element={<AsociacionDetallePublica />} />
        <Route path="noticias" element={<NoticiasPublicas />} />
        <Route path="noticias/:id" element={<NoticiaDetallePublica />} />
        <Route path="federacion" element={<LaFederacion />} />
        <Route path="buscar"         element={<EnConstruccion titulo="Buscar" />} />
        <Route path="ingresar"       element={<Ingresar />} />
        <Route path="restablecer-contrasena" element={<Ingresar />} />
        <Route path="*"              element={<EnConstruccion titulo="Página no encontrada" noEncontrada />} />
      </Route>

      {/* ── Entorno de Administración FECOVOL (/admin) ── */}
      <Route element={<RutaProtegida subruta="/admin" rolesPermitidos={['Administrador']} requireAdminAccess={true} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/panel" replace />} />
          <Route path="panel" element={<AdminInicio />} />
          <Route path="usuarios" element={<UsuariosPermisos />} />
          <Route path="listas-valores" element={<ListasValores />} />
          <Route path="parametros" element={<ParametrosSistema />} />
          <Route path="auditoria" element={<AuditoriaRespaldos />} />
          <Route path="noticias" element={<NoticiasComunicados />} />
          <Route path="noticias/redactar" element={<RedactarNoticia key="redactar" />} />
          <Route path="noticias/:id/editar" element={<RedactarNoticia key="editar" />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="incidentes" element={<Incidentes />} />
          <Route path="incidentes/faltas" element={<CatalogoFaltas />} />
          <Route path="incidentes/abrir" element={<AbrirExpediente />} />
          <Route path="incidentes/:id" element={<Expediente />} />
          <Route element={<GestionFederativa />}>
            <Route path="asociaciones" element={<AsociacionesFecovol />} />
            <Route path="asociaciones/afiliar" element={<AfiliarAsociacion />} />
            <Route path="asociaciones/:id" element={<AsociacionDetalleFecovol />} />
            <Route path="equipos/nuevo" element={<EquipoForm />} />
            <Route path="equipos/:id" element={<EquipoDetalle />} />
            <Route path="equipos/:id/editar" element={<EquipoForm />} />
            <Route path="personas" element={<PersonasFecovol />} />
            <Route path="personas/nueva" element={<PersonaForm />} />
            <Route path="personas/:id" element={<PersonaFichaFecovol />} />
            <Route path="documentos" element={<DocumentosFecovol />} />
            <Route path="arbitraje" element={<Arbitraje />} />
            <Route path="arbitraje/acreditar" element={<AcreditarArbitro />} />
            <Route path="arbitraje/cursos" element={<CursosArbitraje />} />
            <Route path="arbitraje/cursos/nuevo" element={<ProgramarCurso />} />
            <Route path="arbitraje/cursos/:id" element={<CursoArbitraje />} />
            <Route path="arbitraje/designaciones" element={<Designaciones />} />
            <Route path="arbitraje/:id" element={<FichaArbitro />} />
          </Route>
          <Route path="*" element={<EnConstruccion titulo="Sección administrativa" />} />
        </Route>
      </Route>

      {/* ── Entorno de Personal Técnico de Competencias (/personal) ── */}
      <Route element={<RutaProtegida subruta="/personal" rolesPermitidos={['Personal', 'Administrador']} />}>
        <Route path="/personal/*" element={<PersonalPanel />} />
        <Route path="/personal/competencia/:id" element={<CompetenciaDetalle />} />
        <Route path="/personal" element={<PersonalLayout />}>
          <Route index element={<PersonalPanel />} />
          <Route path="inscripciones" element={<Inscripciones />} />
          <Route path="calendario" element={<CalendarioPartidos />} />
          <Route path="resultados" element={<Resultados />} />
          <Route path="resultados/:matchId" element={<ResultadoDetalle />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="designaciones" element={<Suspense fallback={null}><Designaciones /></Suspense>} />
          <Route path="competencia/:id" element={<CompetenciaDetalle />} />
        </Route>
      </Route>

      {/* ── Entorno de Representante de Asociación (/asociacion) ── */}
      <Route element={<RutaProtegida subruta="/asociacion" rolesPermitidos={['Representante', 'Administrador']} />}>
        <Route path="/asociacion/*" element={<AsociacionPanel />} />
      </Route>

      {/* ── Entorno de Cuerpo Arbitral (/arbitro y alias /arbitros) ── */}
      <Route element={<RutaProtegida subruta="/arbitro" rolesPermitidos={['Arbitro', 'Administrador']} />}>
        <Route path="/arbitro/*" element={<ArbitroPanel />} />
      </Route>
      <Route path="/arbitros/*" element={<Navigate to="/arbitro" replace />} />
    </Routes>
  );
}