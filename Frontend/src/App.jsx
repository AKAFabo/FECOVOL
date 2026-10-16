import { Routes, Route } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import Inicio from './pages/public/Inicio.jsx';
import EnConstruccion from './pages/public/EnConstruccion.jsx';

// Portal publico. Las pantallas internas de cada modulo se agregan como rutas aparte
// (por ejemplo /admin, /asociacion) con su propio layout.
export default function App() {
  return (
    <Routes>
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
    </Routes>
  );
}
