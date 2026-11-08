// Secciones del entorno que dependen del módulo de competencias (en desarrollo por otro frente).
import { Link } from 'react-router-dom';
import { Encabezado } from '../../components/gestion/Gestion.jsx';
import { RUTA, useAsociacion } from './contexto.js';

const TEXTOS = {
  Inscripciones: 'Aquí la asociación inscribirá sus equipos en las competencias abiertas y enviará las nóminas a FECOVOL.',
  Calendario: 'Aquí verá los partidos programados de sus equipos, con fecha, hora y sede.'
};

export default function EnDesarrollo({ titulo }) {
  useAsociacion([{ texto: titulo }]);
  return (
    <div className="g-pagina">
      <Encabezado titulo={titulo} />
      <p className="g-aviso">
        <span className="g-aviso__titulo">En desarrollo</span>
        {TEXTOS[titulo] || 'Esta sección todavía no está disponible.'} Mientras tanto, mantenga al día sus equipos y nóminas.
      </p>
      <div><Link to={RUTA.equipos} className="g-boton">Ir a Mis equipos</Link></div>
    </div>
  );
}
