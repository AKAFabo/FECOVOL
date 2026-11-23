# Backend FECOVOL — Asociaciones y Arbitraje

API en Express que usa Supabase (Postgres). Todas las escrituras pasan por los
procedimientos almacenados `sp_*`, que reciben el usuario y dejan el cambio en la
bitácora (`audit_logs`).

## Puesta en marcha

```bash
cd Backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```

Complete `SUPABASE_SERVICE_ROLE_KEY` en `.env` (Supabase → Project Settings → API Keys →
`service_role`). Esa llave **no** se sube al repositorio ni se usa en el frontend.

```bash
npm run dev     # http://localhost:4000
npm test        # pruebas de rutas y validaciones, sin conexión a la base de datos
npm run smoke   # con el servidor corriendo: recorre todo el flujo contra Supabase
```

`requests.http` tiene una petición de ejemplo por endpoint (extensión REST Client de VS Code).

## Usuario que ejecuta la acción

Mientras el módulo de Seguridad no entregue el inicio de sesión, el usuario llega en el
encabezado `x-user-email`. Si no viene, se registra como `sistema`.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/catalogs` | Lista de catálogos |
| GET | `/api/catalogs/:nombre/values` | Valores activos de un catálogo (para los select) |
| GET | `/api/associations?status=&province=&q=` | Lista de asociaciones |
| GET | `/api/associations/:id` | Detalle con junta directiva y totales |
| POST | `/api/associations` | Afiliar asociación (`name`, `tax_id` obligatorios) |
| PATCH | `/api/associations/:id` | Editar datos |
| GET | `/api/associations/:id/teams` | Equipos de la asociación |
| GET | `/api/associations/:id/persons` | Personas de la asociación |
| POST | `/api/associations/:id/board` | Agregar cargo de junta directiva |
| GET | `/api/teams?association_id=&status=&q=` | Lista de equipos |
| GET | `/api/teams/:id` | Detalle del equipo |
| POST | `/api/teams` | Registrar equipo (`category_code`, `branch_code`, `modality_code`) |
| PATCH | `/api/teams/:id` | Editar equipo |
| GET | `/api/teams/:id/members?incluir_bajas=true` | Nómina |
| POST | `/api/teams/:id/members` | Agregar integrante (`person_id`, `member_type`) |
| DELETE | `/api/teams/members/:memberId` | Dar de baja (no borra el histórico) |
| GET | `/api/persons?q=&association_id=&role=&status=` | Buscar personas |
| GET | `/api/persons/:id` | Ficha con equipos y documentos |
| POST | `/api/persons` | Registrar persona |
| PATCH | `/api/persons/:id` | Editar persona (cambiar nombre o nacimiento quita la verificación) |
| POST | `/api/persons/:id/verify` | FECOVOL verifica la identidad |
| POST | `/api/persons/:id/roles` | Habilitar o quitar un rol (`JUGADOR`, `TECNICO`, `ARBITRO`, `OFICIAL`) |
| GET | `/api/documents?person_id=&team_id=&association_id=&status=&por_vencer=30` | Documentos |
| POST | `/api/documents` | Registrar documento de una persona, equipo o asociación |
| PATCH | `/api/documents/:id/review` | Revisar (`VIGENTE`, `RECHAZADO`, `VENCIDO`) |
| POST | `/api/documents/expire` | Marcar como vencidos los que pasaron su fecha |
| GET | `/api/referee-assignments?match_id=&person_id=&status=` | Designaciones |
| POST | `/api/referee-assignments` | Designar árbitro (`match_id`, `person_id`, `official_type_code`) |
| PATCH | `/api/referee-assignments/:id` | Confirmar, rechazar, cumplir o anular |
| GET | `/api/news?status=&author_id=&q=&page=&limit=` | Noticias del panel (`status` admite tambien `PROGRAMADA`) |
| GET | `/api/news/summary` | Totales y autores para los filtros |
| GET | `/api/news/competitions` | Competencias para relacionar una noticia |
| GET | `/api/news/:id` | Detalle de la noticia |
| POST | `/api/news` | Crear noticia (`title` obligatorio; borrador por defecto) |
| PATCH | `/api/news/:id` | Editar, publicar, programar o archivar |
| DELETE | `/api/news/:id` | Retirar (borrado logico) |
| POST | `/api/news/cover` | Subir la imagen destacada (cuerpo binario JPG, PNG o WebP) |

Las rutas de `/api/news` exigen `Authorization: Bearer <token de sesion de Supabase>` de un usuario con rol Administrador.

## API pública (portal web)

`/api/public` es la parte de la API que consume el portal público, sin iniciar sesión. Está
separada de las rutas internas a propósito. `src/routes/public.routes.js` aplica el límite de
solicitudes y el manejo de errores, y monta un archivo por tema en `src/routes/public/`:

- Solo tiene `GET`; cualquier otro método responde 404.
- Cada respuesta se arma campo por campo en `src/public/*Dto.js` (lista blanca). Una columna
  nueva en la base de datos no se publica sola.
- De las asociaciones no se publican cédula jurídica, dirección, correo, teléfono ni junta
  directiva. Solo aparecen asociaciones `AFILIADA` y equipos `ACTIVO`.
- De los integrantes de un equipo inscrito en una competencia se publican **solo nombre, número
  y posición** (y la función del cuerpo técnico). Nunca cédula, fecha o año de nacimiento,
  contactos ni el estado de habilitación: hay categorías juveniles con menores de edad. Solo
  aparecen personas `ACTIVA`.
- Las cifras de `/federation` son conteos; no devuelven ningún registro.
- Las consultas que pueden pasar de 1000 filas (límite de Supabase por consulta) se piden por
  bloques con `src/public/paginar.js`.
- Una noticia es pública si está `PUBLICADA`, no fue borrada y su fecha de publicación ya pasó.
  Su cuerpo (HTML del editor) se limpia con `sanitize-html` y una lista blanca de etiquetas
  (`src/public/htmlSeguro.js`): no pasan scripts, eventos (`onclick`...), estilos, iframes, SVG ni
  enlaces `javascript:`. Los enlaces se abren en otra pestaña con `rel="noopener noreferrer nofollow"`.
- Las competencias en `PLANIFICACION` (borradores) no se muestran; pedirlas da 404, igual que si
  no existieran.
- Límite de 120 solicitudes por minuto por IP (`src/middleware/rateLimit.js`). Si la API se
  publica detrás de un proxy hay que configurar `app.set('trust proxy', ...)`.
- Un error de la base devuelve 503 con un mensaje genérico; el detalle solo queda en la consola
  del servidor.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/public/competitions?status=&season=` | Competencias publicadas con su avance (`status`: INSCRIPCIONES, EN_CURSO, FINALIZADA o CERRADA; `season`: año) |
| GET | `/api/public/competitions/:id` | Datos de una competencia con su avance (equipos, jornada actual, primer lugar) y la fecha de la última actualización |
| GET | `/api/public/competitions/:id/standings` | Tabla de posiciones, con todos los equipos inscritos |
| GET | `/api/public/competitions/:id/matches` | Calendario y resultados, con los puntos por set de los partidos terminados |
| GET | `/api/public/competitions/:id/statistics` | Totales de la competencia y rendimiento por equipo (sets, puntos, partidos a 5 sets, racha) |
| GET | `/api/public/competitions/:id/teams` | Equipos inscritos con asociación, provincia, sede y cantidad de jugadores en la nómina |
| GET | `/api/public/competitions/:id/teams/:teamId` | Equipo en la competencia: posición, nómina (nombre, número, posición), cuerpo técnico y partidos |
| GET | `/api/public/federation` | Cantidad de asociaciones afiliadas, equipos activos, personas registradas y árbitros activos |
| GET | `/api/public/associations` | Asociaciones afiliadas con su cantidad de equipos activos |
| GET | `/api/public/associations/:id` | Datos públicos de la asociación, sus equipos y las competencias en que participan |
| GET | `/api/public/news?page=` | Noticias publicadas, de la más reciente a la más antigua, 12 por página |
| GET | `/api/public/news/:id` | Noticia completa, con el cuerpo ya limpio (`content_html`) |

## Códigos de respuesta

- `400`: falta un dato, un valor no permitido o un id que no es UUID.
- `404`: el registro no existe.
- `409`: duplicado (cédula jurídica, documento de identidad, persona ya en la nómina,
  número de camiseta repetido, árbitro ya designado en ese partido).

## Pendiente de otros frentes

- `referee_assignments.match_id` todavía no tiene llave foránea: se agrega cuando el
  frente de Competencias cree la tabla de partidos.
- El usuario por encabezado se reemplaza por el token del módulo de Seguridad.
