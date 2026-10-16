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
├── components/            Logo e ilustraciones
├── pages/public/          Inicio y la página provisional "Sección en desarrollo"
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

## Contenido de ejemplo

Los partidos, noticias, competencias y selecciones de la portada salen de
`src/data/portada.js` mientras los módulos de Competencias, Noticias y Selecciones no tengan
sus endpoints. Cuando existan, cada bloque se reemplaza por su llamada a la API.

Las secciones del menú (Competencias, Selecciones, Asociaciones, Noticias, La Federación) muestran
por ahora la página "Sección en desarrollo"; quien construya cada una cambia su ruta en `App.jsx`.
