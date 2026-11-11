// Contenedor de las pantallas federativas de Administración (asociaciones, equipos, personas y
// documentos). Va dentro de AdminLayout: les indica a las pantallas compartidas con el entorno del
// representante que están en modo FECOVOL y con qué rutas enlazar.
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Cargando } from '../../../components/EstadoContenido.jsx';
import { RUTA_ADMIN } from '../../asociacion/contexto.js';
import '../../../styles/gestion.css';

const CONTEXTO = { modo: 'admin', rutas: RUTA_ADMIN, asociacion: null, asociacionId: null };

export default function GestionFederativa() {
  return (
    <Suspense fallback={<Cargando texto="Cargando…" />}>
      <Outlet context={CONTEXTO} />
    </Suspense>
  );
}
