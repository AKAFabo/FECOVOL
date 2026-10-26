import { Link } from 'react-router-dom';

// Nombre de la asociación de un equipo. Lleva enlace solo si la API entrega su id, que es cuando
// la asociación está afiliada y tiene página propia en el portal.
export default function EnlaceAsociacion({ asociacion, className }) {
  if (!asociacion?.name) return null;
  if (!asociacion.id) return asociacion.name;
  return <Link to={`/asociaciones/${asociacion.id}`} className={className}>{asociacion.name}</Link>;
}
