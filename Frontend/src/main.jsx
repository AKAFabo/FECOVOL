import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Tipografías del sistema de diseño, servidas desde el propio sitio (sin Google Fonts).
import '@fontsource/archivo/latin-500.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/archivo/latin-700.css';
import '@fontsource/archivo/latin-800.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-700.css';

// Los estilos globales se cargan antes que los de cada componente para que estos puedan sobrescribirlos.
import './index.css';
import './App.css';
import App from './App.jsx';
import { instalarSesionEnBackend } from './services/sesionBackend.js';

// Antes de montar la app: las llamadas a la API privada del backend llevan el token de sesión.
instalarSesionEnBackend();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
