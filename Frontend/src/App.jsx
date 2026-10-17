import { Routes, Route, Navigate } from 'react-router-dom';

// Layout público (portal web)
import PublicLayout from './layouts/PublicLayout.jsx';
import Inicio from './pages/public/Inicio.jsx';
import EnConstruccion from './pages/public/EnConstruccion.jsx';

// Layout administrativo
import AdminLayout from './layouts/AdminLayout.jsx';
import AdminInicio from './pages/admin/AdminInicio.jsx';
import UsuariosPermisos from './pages/admin/usuarios/UsuariosPermisos.jsx';
import ListasValores from './pages/admin/catalogos/ListasValores.jsx';
import AuditoriaRespaldos from './pages/admin/auditoria/AuditoriaRespaldos.jsx';


export default function App() {
  return (
    <Routes>
      {/* ── Portal público ────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route index element={<Inicio />} />
        <Route path="competencias/*" element={<EnConstruccion titulo="Competencias" />} />
        <Route path="selecciones/*" element={<EnConstruccion titulo="Selecciones nacionales" />} />
        <Route path="asociaciones/*" element={<EnConstruccion titulo="Asociaciones afiliadas" />} />
        <Route path="noticias/*" element={<EnConstruccion titulo="Noticias" />} />
        <Route path="federacion/*" element={<EnConstruccion titulo="La Federación" />} />
        <Route path="buscar" element={<EnConstruccion titulo="Buscar" />} />
        <Route path="ingresar" element={<EnConstruccion titulo="Ingresar al sistema" />} />
        <Route path="*" element={<EnConstruccion titulo="Página no encontrada" noEncontrada />} />
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
      <Route path="/personal/*" element={<EnConstruccion titulo="Personal de competencias" />} />
      <Route path="/asociacion/*" element={<EnConstruccion titulo="Representante de asociación" />} />
      <Route path="/arbitro/*" element={<EnConstruccion titulo="Cuerpo arbitral" />} />
    </Routes>
  );
}
