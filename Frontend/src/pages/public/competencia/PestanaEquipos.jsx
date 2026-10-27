import { useState } from 'react';
import { Link } from 'react-router-dom';
import EnlaceAsociacion from '../../../components/EnlaceAsociacion.jsx';
import EscudoEquipo from '../../../components/EscudoEquipo.jsx';
import { Cargando, ErrorCarga, SinResultados } from '../../../components/EstadoContenido.jsx';
import Selector from '../../../components/Selector.jsx';
import useCarga from '../../../hooks/useCarga.js';
import { CARGAS } from './cargas.js';
import { etiquetaInscritos } from './partidos.js';

const TODAS = 'todas';

function TarjetaEquipo({ competencia, equipo: e }) {
  const filas = [
    ['Asociación', e.association?.name ? <EnlaceAsociacion asociacion={e.association} /> : null],
    ['Sede local', e.home_venue],
    [etiquetaInscritos(competencia.branch), e.players || null]
  ].filter(([, valor]) => valor);

  return (
    <li className="tarjeta-inscrito">
      <div className="tarjeta-inscrito__cabecera">
        <EscudoEquipo equipo={e} tamano="l" />
        <div>
          <h3 className="tarjeta-inscrito__nombre">{e.name}</h3>
          {e.province && <p className="tarjeta-inscrito__provincia">{e.province}</p>}
        </div>
      </div>
      {filas.length > 0 && (
        <dl className="tarjeta-inscrito__datos">
          {filas.map(([nombre, valor]) => (
            <div key={nombre} className="tarjeta-inscrito__fila">
              <dt>{nombre}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link to={`/competencias/${competencia.id}/equipos/${e.id}`} className="enlace-flecha tarjeta-inscrito__accion">
        Ver equipo y nómina<span className="visualmente-oculto"> de {e.name}</span>
      </Link>
    </li>
  );
}

export default function PestanaEquipos({ competencia }) {
  const { clave, cargar } = CARGAS.equipos(competencia.id);
  const carga = useCarga(cargar, [competencia.id], { clave });
  const [provincia, setProvincia] = useState(TODAS);

  if (carga.estado === 'cargando') return <Cargando texto="Cargando equipos…" />;
  if (carga.estado === 'error') return <ErrorCarga mensaje={carga.error.message} onReintentar={carga.reintentar} />;

  const equipos = carga.datos;
  if (equipos.length === 0) {
    return <SinResultados titulo="Aún no hay equipos inscritos" texto="Los equipos aparecerán aquí cuando se confirme su inscripción." />;
  }

  const provincias = [...new Set(equipos.map((e) => e.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const visibles = equipos.filter((e) => provincia === TODAS || e.province === provincia);

  return (
    <>
      <div className="seccion-encabezado equipos-encabezado">
        <h2 className="equipos-encabezado__titulo">
          {equipos.length} {equipos.length === 1 ? 'equipo inscrito' : 'equipos inscritos'}
        </h2>
        {provincias.length > 1 && (
          <Selector
            etiqueta="Provincia"
            valor={provincia}
            onCambiar={setProvincia}
            opciones={[{ valor: TODAS, texto: 'Todas' }, ...provincias.map((p) => ({ valor: p, texto: p }))]}
          />
        )}
      </div>
      <ul className="rejilla-equipos">
        {visibles.map((e) => (
          <TarjetaEquipo key={e.id} competencia={competencia} equipo={e} />
        ))}
      </ul>
    </>
  );
}
