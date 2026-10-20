import { Routes, Route, Navigate } from 'react-router-dom';

// Layout público (portal web)
import PublicLayout from './layouts/PublicLayout.jsx';
import Inicio from './pages/public/Inicio.jsx';
import EnConstruccion from './pages/public/EnConstruccion.jsx';
import Ingresar from './pages/public/Ingresar.jsx';

// Dashboards por rol (temporales – reemplazar con layouts reales)
import AdminPanel      from './pages/admin/AdminPanel.jsx';
import PersonalPanel   from './pages/personal/PersonalPanel.jsx';
import AsociacionPanel from './pages/asociacion/AsociacionPanel.jsx';
import ArbitroPanel    from './pages/arbitro/ArbitroPanel.jsx';

// Layout administrativo
import AdminLayout from './layouts/AdminLayout.jsx';
import AdminInicio from './pages/admin/AdminInicio.jsx';
import UsuariosPermisos from './pages/admin/usuarios/UsuariosPermisos.jsx';
import ListasValores from './pages/admin/catalogos/ListasValores.jsx';
import AuditoriaRespaldos from './pages/admin/auditoria/AuditoriaRespaldos.jsx';

// --- NUEVOS IMPORTS PARA EL MÓDULO DE COMPETENCIAS ---
import CompetenciasPublicas from './pages/public/CompetenciasPublicas.jsx';
import CompetenciaDetallePublica from './pages/public/CompetenciaDetallePublica.jsx';
import CompetenciaDetalle from './pages/personal/CompetenciaDetalle.jsx';

// Asociaciones afiliadas (portal público)
import AsociacionesPublicas from './pages/public/AsociacionesPublicas.jsx';
import AsociacionDetallePublica from './pages/public/AsociacionDetallePublica.jsx';

export default function App() {
  return (
    <Routes>
      {/* ── Portal público ────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route index element={<Inicio />} />
        <Route path="competencias" element={<CompetenciasPublicas />} />
        <Route path="competencias/:id" element={<CompetenciaDetallePublica />} />
        <Route path="selecciones/*"  element={<EnConstruccion titulo="Selecciones nacionales" />} />
        <Route path="asociaciones" element={<AsociacionesPublicas />} />
        <Route path="asociaciones/:id" element={<AsociacionDetallePublica />} />
        <Route path="noticias/*"     element={<EnConstruccion titulo="Noticias" />} />
        <Route path="federacion/*"   element={<EnConstruccion titulo="La Federación" />} />
        <Route path="buscar"         element={<EnConstruccion titulo="Buscar" />} />
        <Route path="ingresar"       element={<Ingresar />} />
        <Route path="*"              element={<EnConstruccion titulo="Página no encontrada" noEncontrada />} />
      </Route>

      {/* ── Entorno de Administración FECOVOL ─────────────────────── */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/panel" replace />} />
        <Route path="panel" element={<AdminInicio />} />
        <Route path="usuarios" element={<UsuariosPermisos />} />
        <Route path="listas-valores" element={<ListasValores />} />
        <Route path="auditoria" element={<AuditoriaRespaldos />} />
        <Route path="*" element={<EnConstruccion titulo="Sección administrativa" />} />
      </Route>

      {/* ── Dashboards temporales para los demás roles ────────────── */}
      <Route path="/personal/*" element={<PersonalPanel />} />
      <Route path="/personal/competencia/:id" element={<CompetenciaDetalle />} />
      <Route path="/asociacion/*" element={<EnConstruccion titulo="Representante de asociación" />} />
      <Route path="/arbitro/*" element={<EnConstruccion titulo="Cuerpo arbitral" />} />
    </Routes>
  );
}