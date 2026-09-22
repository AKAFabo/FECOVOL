import { useEffect, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:4000';

function App() {
  const [mensaje, setMensaje] = useState('Cargando...');

  useEffect(() => {
    fetch(`${API_URL}/`)
      .then((res) => res.json())
      .then((data) => setMensaje(data.message))
      .catch(() => setMensaje('No se pudo conectar con el backend'));
  }, []);

  return (
    <div className="app">
      <h1>Proyecto Full Stack</h1>
      <p>Estado de la conexión con el backend:</p>
      <p className="mensaje">{mensaje}</p>
    </div>
  );
}

export default App;
