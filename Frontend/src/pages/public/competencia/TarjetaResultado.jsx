import EscudoEquipo from '../../../components/EscudoEquipo.jsx';
import { fechaDiaMesCorto, isoValida } from '../../../utils/formato.js';

// Tarjeta con el resultado de un partido finalizado: fecha y sede, los dos equipos con sus sets
// y el detalle de puntos por set. Un resultado especial (no presentación, ganado por defecto,
// suspensión) se indica con su texto; si fue suspendido no tiene marcador ni ganador.
export default function TarjetaResultado({ partido: p, as: Etiqueta = 'li' }) {
  const conMarcador = p.home_sets !== null && p.away_sets !== null;
  const ganaLocal = conMarcador && p.home_sets > p.away_sets;
  const ganaVisita = conMarcador && p.away_sets > p.home_sets;
  const local = p.home?.name || 'Por definir';
  const visita = p.away?.name || 'Por definir';
  const fecha = fechaDiaMesCorto(p.date);

  const fila = (equipo, nombre, sets, gana) => (
    <div className={`resultado__equipo${gana ? ' resultado__equipo--ganador' : ''}`}>
      <EscudoEquipo equipo={equipo} tamano="s" />
      <span className="resultado__nombre">{nombre}</span>
      <span className="resultado__sets">{sets}</span>
    </div>
  );

  return (
    <Etiqueta className="resultado">
      <div className="resultado__cabecera">
        <p className="resultado__lugar">
          {fecha && <time dateTime={isoValida(p.date)}>{fecha}</time>}
          {fecha && p.venue && ' · '}
          {p.venue}
        </p>
        <span className={`pastilla ${p.special_result ? 'pastilla--aviso' : 'pastilla--neutra'}`}>{p.special_result || 'Final'}</span>
      </div>
      <p className="visualmente-oculto">
        {conMarcador ? `${local} ${p.home_sets}, ${visita} ${p.away_sets}.` : `${local} contra ${visita}, sin marcador.`}
      </p>
      <div aria-hidden="true">
        {fila(p.home, local, conMarcador ? p.home_sets : '—', ganaLocal)}
        {fila(p.away, visita, conMarcador ? p.away_sets : '—', ganaVisita)}
      </div>
      {p.sets.length > 0 && (
        <ol className="resultado__parciales" aria-label="Puntos por set">
          {p.sets.map((s) => (
            <li key={s.number}>
              <span className="visualmente-oculto">Set {s.number}: </span>
              {s.home}-{s.away}
            </li>
          ))}
        </ol>
      )}
    </Etiqueta>
  );
}
