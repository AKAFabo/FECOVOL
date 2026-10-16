import { Link } from 'react-router-dom';
import escudo from '../assets/logo-fecovol-escudo.webp';
import './Logo.css';

// Logotipo de FECOVOL. "claro" se usa sobre fondos oscuros (pie de página).
export default function Logo({ claro = false, conSubtitulo = true }) {
  return (
    <Link to="/" className={`logo${claro ? ' logo--claro' : ''}`} aria-label="FECOVOL, ir al inicio">
      <span className="logo__marca" aria-hidden="true">
        <img src={escudo} alt="" width="48" height="48" />
      </span>
      <span className="logo__texto">
        <span className="logo__nombre">FECOVOL</span>
        {conSubtitulo && <span className="logo__subtitulo">Federación Costarricense de Voleibol</span>}
      </span>
    </Link>
  );
}
