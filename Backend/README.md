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

## Códigos de respuesta

- `400`: falta un dato, un valor no permitido o un id que no es UUID.
- `404`: el registro no existe.
- `409`: duplicado (cédula jurídica, documento de identidad, persona ya en la nómina,
  número de camiseta repetido, árbitro ya designado en ese partido).

## Pendiente de otros frentes

- `referee_assignments.match_id` todavía no tiene llave foránea: se agrega cuando el
  frente de Competencias cree la tabla de partidos.
- El usuario por encabezado se reemplaza por el token del módulo de Seguridad.
