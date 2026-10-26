import { Link } from 'react-router-dom';

// Migas de pan sobre el título de una página ("Inicio › Competencias › Liga…").
// items: [{ texto, to }]; el último es la página actual y no lleva enlace.
export default function Migas({ items }) {
  return (
    <nav aria-label="Ruta de navegación" className="migas">
      <ol className="migas__lista">
        {items.map((item, i) => {
          const actual = i === items.length - 1;
          return (
            <li key={`${item.texto}-${i}`} className="migas__item">
              {actual ? <span aria-current="page">{item.texto}</span> : <Link to={item.to}>{item.texto}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
