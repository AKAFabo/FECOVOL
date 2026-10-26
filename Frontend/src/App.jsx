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
import ParametrosSistema from './pages/admin/parametros/ParametrosSistema.jsx';
import Perfil from './pages/admin/perfil/Perfil.jsx';

// Paneles protegidos por entorno/rol
import ArbitroPanel from './pages/arbitro/ArbitroPanel.jsx';
import AsociacionPanel from './pages/asociacion/AsociacionPanel.jsx';
import PersonalPanel from './pages/personal/PersonalPanel.jsx';

export default function App() {
  return (
    <Routes>
      {/* ── Portal público ────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route index element={<Inicio />} />
        <Route path="competencias/*" element={<EnConstruccion titulo="Competencias" />} />
        <Route path="selecciones/*"  element={<EnConstruccion titulo="Selecciones nacionales" />} />
        <Route path="asociaciones/*" element={<EnConstruccion titulo="Asociaciones afiliadas" />} />
        <Route path="noticias/*"     element={<EnConstruccion titulo="Noticias" />} />
        <Route path="federacion/*"   element={<EnConstruccion titulo="La Federación" />} />
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
          <Route path="perfil" element={<Perfil />} />
          <Route path="*" element={<EnConstruccion titulo="Sección administrativa" />} />
        </Route>
      </Route>

      {/* ── Entorno de Personal Técnico de Competencias (/personal) ── */}
      <Route element={<RutaProtegida subruta="/personal" rolesPermitidos={['Personal', 'Administrador']} />}>
        <Route path="/personal/*" element={<PersonalPanel />} />
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
