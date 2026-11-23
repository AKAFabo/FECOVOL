// Entorno del cuerpo arbitral (/arbitro/*). App.jsx monta este componente detrás de RutaProtegida;
// aquí se definen sus pantallas con su layout: designaciones, partido (nóminas, cierre y evidencias)
// y ficha.
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from '../../components/EstadoContenido.jsx';
import ArbitroLayout from '../../layouts/ArbitroLayout.jsx';
import Perfil from '../admin/perfil/Perfil.jsx';

const MisDesignaciones = lazy(() => import('./MisDesignaciones.jsx'));
const MiFicha = lazy(() => import('./MiFicha.jsx'));
const PartidoArbitro = lazy(() => import('./PartidoArbitro.jsx'));
const Actas = lazy(() => import('./Actas.jsx'));

const pagina = (Componente) => (
  <Suspense fallback={<Cargando texto="Cargando…" />}>
    <Componente />
  </Suspense>
);

export default function ArbitroPanel() {
  return (
    <Routes>
      <Route element={<ArbitroLayout />}>
        <Route index element={pagina(MisDesignaciones)} />
        <Route path="actas" element={pagina(Actas)} />
        <Route path="partidos/:partidoId" element={pagina(PartidoArbitro)} />
        <Route path="mi-ficha" element={pagina(MiFicha)} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/arbitro" replace />} />
      </Route>
    </Routes>
  );
}
