import { Routes, Route } from 'react-router-dom';

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
        <Route path="*"              element={<EnConstruccion titulo="Página no encontrada" noEncontrada />} />
      </Route>

      {/* ── Dashboards por rol (fuera del layout público) ─────────── */}
      {/* Cada uno tendrá su propio layout cuando esté listo el módulo */}
      <Route path="/admin/*"      element={<AdminPanel />} />
      <Route path="/personal/*"   element={<PersonalPanel />} />
      <Route path="/asociacion/*" element={<AsociacionPanel />} />
      <Route path="/arbitro/*"    element={<ArbitroPanel />} />

    </Routes>
  );
}
