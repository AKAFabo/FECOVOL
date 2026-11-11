# Frontend FECOVOL

React 18 + Vite. Por ahora contiene el portal público (la portada y el marco de
navegación); las pantallas internas de cada módulo se agregan aquí mismo.

```bash
cd Frontend
npm install
npm run dev     # http://localhost:5173
```

## Estructura

```
src/
├── index.css              Variables del sistema de diseño (colores, tipografía, radios) y estilos base
├── App.css                Componentes compartidos: .contenedor, .boton, .pastilla, .antetitulo, .seccion-titulo, .enlace-flecha
├── App.jsx                Rutas
├── layouts/PublicLayout   Barra superior, encabezado con navegación, pie de página
├── components/            Logo, ilustraciones, CabeceraSeccion (franja azul de cada sección) y
│                          EstadoContenido (cargando / error / sin resultados) y HtmlSeguro
├── services/              Acceso a la API: apiPublica.js (cliente HTTP) y un archivo por módulo
├── hooks/useCarga.js      Estado de una carga asíncrona, con cancelación y reintento
├── utils/                 Formato de fechas, validación de ids y siglas para distintivos
├── pages/public/          Inicio, Competencias, Asociaciones, Noticias (listado y detalle de cada una)
│                          y "Sección en desarrollo"
└── data/portada.js        Contenido de ejemplo de la portada (ver abajo)
```

## Convenciones

- **Colores y tipografías solo por variables** (`var(--azul)`, `var(--fuente-titulo)`, etc.),
  tomadas del Figma. No escribir colores sueltos.
- **El rojo (`--rojo`) es de marca y para acciones destructivas.** Los botones de crear,
  guardar o enviar van en azul (`.boton--primario`).
- Cada componente o página tiene su propio `.css` al lado, con clases en español y
  nombres de bloque (`.partido`, `.partido__marcador`).
- Las tipografías Archivo y Source Sans 3 se sirven desde el propio sitio con `@fontsource`.
- Diseño adaptable: escritorio, tableta (≤ 1100 px) y teléfono (≤ 720 px). Para mostrar algo solo
  en una de las dos vistas existen `.solo-escritorio` y `.solo-movil`.

## Datos de la API en el portal público

- Las páginas públicas **no llaman a `fetch` directamente**: usan las funciones de `services/`
  (por ejemplo `listarCompetencias()`), que pasan por `services/apiPublica.js`. Ese cliente pone
  un tiempo máximo de espera, revisa el código de respuesta y convierte cualquier falla en un
  mensaje para el usuario, sin mostrar detalles internos.
- Solo consumen `/api/public`, la parte de la API de solo lectura pensada para el público.
- Cada zona que carga datos muestra los tres estados con `EstadoContenido`: cargando, error con
  botón para reintentar y sin resultados.
- Los identificadores que vienen en la URL se validan antes de pedir nada a la API.
- **Nunca usar `dangerouslySetInnerHTML` directamente.** El único HTML que se muestra (el cuerpo
  de las noticias) pasa por `components/HtmlSeguro.jsx`, que lo limpia con DOMPurify y una lista
  blanca de etiquetas, aunque la API ya lo entregue limpio.
- `VITE_BACKEND_URL` en `.env` indica dónde está la API (por defecto `http://localhost:4000`).

## Contenido de ejemplo

Los partidos, noticias, competencias y selecciones de la portada salen de
`src/data/portada.js` mientras los módulos de Competencias, Noticias y Selecciones no tengan
sus endpoints. Cuando existan, cada bloque se reemplaza por su llamada a la API.

Las secciones del menú (Competencias, Selecciones, Asociaciones, Noticias, La Federación) muestran
por ahora la página "Sección en desarrollo"; quien construya cada una cambia su ruta en `App.jsx`.
