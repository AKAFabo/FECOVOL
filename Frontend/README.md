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
├── components/            Logo, ilustraciones, CabeceraSeccion (franja azul de cada sección),
│                          Migas, EstadoContenido (cargando / error / sin resultados), HtmlSeguro,
│                          EscudoEquipo, Selector (lista desplegable de filtro) y Segmentado
├── services/              Acceso a la API: apiPublica.js (cliente HTTP) y un archivo por módulo
├── hooks/useCarga.js      Estado de una carga asíncrona, con cancelación y reintento
├── utils/                 Formato de fechas, validación de ids y siglas para distintivos
├── pages/public/          Inicio, Competencias (listado, detalle con 5 pestañas en competencia/ y
│                          página de equipo), Selecciones, Asociaciones, Noticias, La Federación y
│                          "Sección en desarrollo"
├── data/portada.js        Contenido de ejemplo de la portada (ver abajo)
├── data/federacion.js     Contenido institucional de "La Federación" y del pie (solo datos oficiales)
├── data/redes.js          Redes sociales oficiales
├── data/selecciones.ejemplo.js  Datos inventados para revisar Selecciones en desarrollo
└── styles/paneles.css     Paneles, tablas y listas de datos compartidos por las páginas de detalle
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

## Selecciones nacionales

La página está lista, pero todavía no hay datos: falta definir cómo se registran las selecciones
y sus convocatorias. Mientras tanto muestra su estado vacío. El contrato que espera la página
(selecciones, próximos compromisos y convocatorias) está documentado en
`src/services/selecciones.js`; cuando exista el endpoint, solo cambia ese archivo.

Para revisar el diseño: `npm run dev` y abrir `/selecciones?demo`. Carga
`src/data/selecciones.ejemplo.js` (datos inventados, marcados en pantalla como ejemplo). Ese
archivo no entra en el build de producción.

## La Federación

Las cifras (asociaciones, equipos, personas y árbitros) salen de la base por
`/api/public/federation`. Misión, visión, junta directiva, reglamentos y datos de contacto se
escriben en `src/data/federacion.js` **solo cuando FECOVOL los confirme**: mientras estén vacíos,
esa sección no aparece. El pie de página toma de ahí la dirección, el correo y el teléfono.
No se mencionan organismos, afiliaciones ni aliados externos.
