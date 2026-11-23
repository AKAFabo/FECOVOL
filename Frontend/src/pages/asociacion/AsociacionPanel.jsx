// Entorno del representante de asociación (/asociacion/*). App.jsx monta este componente detrás
// de RutaProtegida; aquí se definen las pantallas del entorno con su layout.
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from '../../components/EstadoContenido.jsx';
import AsociacionLayout from '../../layouts/AsociacionLayout.jsx';
import Panel from './Panel.jsx';
import Perfil from '../admin/perfil/Perfil.jsx';

// Las pantallas se cargan al abrirlas: el portal público no descarga el código del entorno.
const MisEquipos = lazy(() => import('./MisEquipos.jsx'));
const EquipoForm = lazy(() => import('./EquipoForm.jsx'));
const EquipoDetalle = lazy(() => import('./EquipoDetalle.jsx'));
const Personas = lazy(() => import('./Personas.jsx'));
const PersonaForm = lazy(() => import('./PersonaForm.jsx'));
const PersonaFicha = lazy(() => import('./PersonaFicha.jsx'));
const Documentos = lazy(() => import('./Documentos.jsx'));
const MiAsociacion = lazy(() => import('./MiAsociacion.jsx'));
const Inscripciones = lazy(() => import('./Inscripciones.jsx'));
const ParticipacionEquipo = lazy(() => import('./ParticipacionEquipo.jsx'));
const Calendario = lazy(() => import('./Calendario.jsx'));
const Reportes = lazy(() => import('./Reportes.jsx'));

const pagina = (Componente) => (
  <Suspense fallback={<Cargando texto="Cargando…" />}>
    <Componente />
  </Suspense>
);

export default function AsociacionPanel() {
  return (
    <Routes>
      <Route element={<AsociacionLayout />}>
        <Route index element={<Panel />} />
        <Route path="equipos" element={pagina(MisEquipos)} />
        <Route path="equipos/nuevo" element={pagina(EquipoForm)} />
        <Route path="equipos/:id" element={pagina(EquipoDetalle)} />
        <Route path="equipos/:id/editar" element={pagina(EquipoForm)} />
        <Route path="personas" element={pagina(Personas)} />
        <Route path="personas/nueva" element={pagina(PersonaForm)} />
        <Route path="personas/:id" element={pagina(PersonaFicha)} />
        <Route path="documentos" element={pagina(Documentos)} />
        <Route path="inscripciones" element={pagina(Inscripciones)} />
        <Route path="inscripciones/:competenciaId/equipos/:equipoId" element={pagina(ParticipacionEquipo)} />
        <Route path="calendario" element={pagina(Calendario)} />
        <Route path="reportes" element={pagina(Reportes)} />
        <Route path="mi-asociacion" element={pagina(MiAsociacion)} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/asociacion" replace />} />
      </Route>
    </Routes>
  );
}
