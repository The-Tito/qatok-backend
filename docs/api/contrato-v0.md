# Contrato de la API v0 — QATO'K

- **Entregable E6 · contrato 0.6.0.** Salud, F1, F2, F3a y F3b tienen implementación.
- **Se apoya en:** `context/convenciones.md` §5 (prefijo `/api`, `snake_case`, formato de error, códigos HTTP) y `docs/modelos/matriz-propiedad.md` §4 (en qué bases escribe cada operación).
- **Del contrato al código:** en el paso 0.7 estas formas se escriben como esquemas zod en `shared/`, y de ahí se genera el OpenAPI (`/api/docs`). Si el código y este documento difieren, se corrige el que esté mal mediante un PR.
- **Para que la interfaz avance sin backend:** C puede simular cualquier endpoint con los ejemplos de este documento.

## 1. Acceso

| Nivel | Quién |
|---|---|
| **Público** | Sin token |
| **Usuario** | Token válido y cuenta activa en PostgreSQL |
| **Dueño** | El recurso pertenece al usuario identificado por el token. Si no es suyo → `404` |
| **Admin** | Cuenta activa con rol ADMIN en PostgreSQL |

Los errores de la API usan `{ error: { code, message, details? } }`. Los consumidores deben usar `code` para decidir cómo tratar el error. Los errores de validación incluyen `details.fields` cuando hay campos concretos que corregir.

## 2. Objetos de los flujos previstos

Los objetos siguientes conservan la notación del diseño original. Para los objetos vigentes, consulta los flujos implementados y sus esquemas en `shared/src/`.

```jsonc
// Usuario
{ "id_usuario": "uuid", "nombre": "Ana López", "correo": "ana@correo.com",
  "rol": "ESTUDIANTE", "estado": "ACTIVO", "fecha_registro": "2026-11-18T21:30:00.000Z" }

// Habilidad
{ "id_habilidad": "uuid", "nombre": "Comunicación efectiva", "descripcion": "…",
  "categoria": "Blanda", "nivel_objetivo": 70, "tipo_visual": "VOICE" }

// SimulacionResumen (catálogo)
{ "id_simulacion": "uuid", "titulo": "Cliente molesto por un retraso", "descripcion": "…",
  "dificultad": "INTERMEDIA", "duracion_estimada": 10, "estado": "PUBLICADA",
  "habilidades": [ { "id_habilidad": "uuid", "nombre": "…", "peso": 0.6, "nivel_esperado": 70 } ] }

// Sincronizacion (solo en operaciones que generan eventos)
{ "grafo": "APLICADO", "eventos": ["uuid"] }
```

`ContenidoSimulacion` (solo para admin) es el documento completo de la matriz §3: `pasos[]` con `contexto`, `opciones[]`, `valoracion`, `id_paso_siguiente`, `consecuencias[]` y `retroalimentacion`.

## 3. Endpoints

Columnas: **Bases** = PG / Mongo / Neo4j que toca (L = lectura, E = escritura, *ev* = evento hacia el grafo).

### Salud — dueño A

| Método y ruta | Acceso | Bases | Respuesta | Errores |
|---|---|---|---|---|
| `GET /api/health` | Público | L en las 3 | `200` si las 3 responden; `503` con el mismo cuerpo si alguna falla | — |

```json
{ "estado": "OK", "version": "0.1.0",
  "bases": { "relacional": { "ok": true, "latencia_ms": 3 },
             "documental": { "ok": true, "latencia_ms": 2 },
             "grafo":      { "ok": true, "latencia_ms": 5 } } }
```

`estado` vale `"DEGRADADO"` si alguna base tiene `ok: false`. En ese caso, la base que falla incluye `"error": "SIN_CONEXION" | "TIEMPO_AGOTADO"`; el detalle técnico solo va al log. Este endpoint es la base de la **prueba de conectividad**. Implementado en el paso 0.7: es la plantilla de capas que copian los demás endpoints.

### F1 Cuentas y sesiones (RF-01, RF-09)

Las rutas, los campos HTTP y los códigos de error usan inglés. El modelo de PostgreSQL y los eventos conservan sus nombres de dominio. Los esquemas de la API y el frontend están en [shared/src/f1.ts](../../shared/src/f1.ts).

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `POST /api/auth/register` | Público | PG E + *ev* | `{ name, email, password }` | `201 { user, token, synchronization }` | `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED` |
| `POST /api/auth/login` | Público | PG L | `{ email, password }` | `200 { user, token }` | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE` |
| `GET /api/me` | Usuario | PG L | — | `200 Account` | `401 UNAUTHENTICATED` |
| `PATCH /api/me` | Usuario | PG E | `{ name? }` | `200 Account` | `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED` |
| `DELETE /api/me` | Usuario | PG E + *ev* → Mongo E | — | `200 { deleted: true, synchronization }` | `401 UNAUTHENTICATED` |

Una cuenta contiene `id`, `name`, `email`, `role` (`STUDENT` o `ADMIN`), `status` (`ACTIVE`, `INACTIVE`, `SUSPENDED`) y `registered_at` en UTC. El registro crea una cuenta de estudiante. El nombre admite 1–100 caracteres y el correo normalizado hasta 150. La contraseña requiere al menos ocho caracteres y admite hasta 72 bytes en UTF-8. Las respuestas excluyen contraseñas y hashes.

Las rutas protegidas usan `Authorization: Bearer <token>`. El JWT caduca a las ocho horas y lleva el ID de cuenta en `sub`. La API verifica firma, vencimiento, emisor y audiencia, y consulta el estado y rol actuales en PostgreSQL. Una baja o desactivación impide el acceso con tokens emitidos anteriormente. Al eliminar una cuenta, PostgreSQL revoca el acceso a sus evidencias. Si MongoDB falla después del commit, la reconciliación podrá retirar las instantáneas restantes.

`synchronization` tiene la forma `{ graph: "APPLIED" | "PENDING", event_ids: string[] }`. PENDING indica que PostgreSQL confirmó el cambio y el grafo todavía no lo confirma.

### F1 Habilidades

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/skills` | Usuario | PG L | — | `200 { items: Skill[], total }` | `401 UNAUTHENTICATED` |
| `POST /api/admin/skills` | Admin | PG E + *ev* | `{ name, description, category, target_level?, visual_type? }` | `201 { skill, synchronization }` | `400`, `403 FORBIDDEN`, `409 SKILL_ALREADY_EXISTS` |
| `PUT /api/admin/skills/:skillId` | Admin | PG E + *ev* | Igual que POST | `200 { skill, synchronization }` | `404 NOT_FOUND`, `409 SKILL_ALREADY_EXISTS` |
| `DELETE /api/admin/skills/:skillId` | Admin | PG E + *ev* | — | `200 { deleted: true, synchronization }` | `404 NOT_FOUND`, `409 SKILL_IN_USE` |

La respuesta incluye `id` y `target_level`, que puede ser un entero de 0 a 100 o nulo.

### F1 Catálogo de simulaciones (RF-02)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/simulations` | Usuario | PG L | `search?`, `skill_id?`, `difficulty?`, `limit?`, `offset?` | `200 { items: SimulationSummary[], total }` | `400 VALIDATION_ERROR` |
| `GET /api/simulations/:simulationId` | Usuario | PG L | — | `200 SimulationSummary` | `404 NOT_FOUND` si no existe o no está publicada |

El resumen incluye `id`, `title`, `description`, `difficulty` (`BASIC`, `INTERMEDIATE`, `ADVANCED`), `estimated_duration` (entero o nulo), `status: "PUBLISHED"` y `skills: [{ id, name, visual_type, weight, expected_level }]`. La búsqueda compara texto literal en el título o la descripción sin distinguir mayúsculas. Los filtros se combinan. Los resultados se ordenan por título e ID, con `limit=20` (máximo 100), `offset=0` y el total antes de paginar.

### F1 Administración de simulaciones

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/admin/simulations` | ADMIN | PG L | `status?`, `limit?`, `offset?` | `200 { items: AdminSimulation[], total }` | `400 VALIDATION_ERROR` |
| `POST /api/admin/simulations` | ADMIN | PG E | `SimulationInput` | `201 AdminSimulation` con estado DRAFT | `400 VALIDATION_ERROR`, `404 SKILL_NOT_FOUND` |
| `GET /api/admin/simulations/:simulationId` | ADMIN | PG L | — | `200 AdminSimulation` (cualquier estado) | `400 VALIDATION_ERROR`, `404 NOT_FOUND` |
| `PUT /api/admin/simulations/:simulationId` | ADMIN | PG E | `SimulationInput` | `200 AdminSimulation` | `400 VALIDATION_ERROR`, `404 NOT_FOUND` o `SKILL_NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` |
| `GET /api/admin/simulations/:simulationId/content` | ADMIN | PG + Mongo L | — | `200 { version, steps }` | `404 NOT_FOUND` o `MISSING_CONTENT` |
| `PUT /api/admin/simulations/:simulationId/content` | ADMIN | PG L → Mongo E | `{ version, steps }`; `version: null` para crear | `200 { version, steps }` | `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` o `STALE_CONTENT_VERSION` |
| `POST /api/admin/simulations/:simulationId/publish` | ADMIN | Mongo L/E → PG E + *ev* | `{ version }` | `200 { simulation, synchronization }` | `404 NOT_FOUND`, `409 MISSING_CONTENT`, `INCOMPLETE_CONTENT`, `INVALID_BRANCHES`, `STALE_CONTENT_VERSION`, `SIMULATION_NOT_EDITABLE` o `CONTENT_ID_CONFLICT` |
| `POST /api/admin/simulations/:simulationId/deactivate` | ADMIN | PG E + *ev* | — | `200 { simulation, synchronization }` | `404 NOT_FOUND`, `409 SIMULATION_NOT_PUBLISHED` |
| `DELETE /api/admin/simulations/:simulationId` | ADMIN | PG E → Mongo E | — | `204` | `404 NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` |

Todas estas rutas devuelven `401 UNAUTHENTICATED` sin sesión válida y `403 FORBIDDEN` sin rol ADMIN. Si una base es necesaria para completar la operación y no responde, se devuelve `503 DATABASE_UNAVAILABLE`.

- **Causa de los 409 al publicar.** `INCOMPLETE_CONTENT` e `INVALID_BRANCHES` traen `details: { reason, step_id?, option_id? }`. `reason`: `NO_SKILLS`, `NO_STEPS`, `STEP_WITHOUT_OPTIONS` (`step_id`), `OPTION_WITHOUT_CONSEQUENCES` (`step_id`, `option_id`), `MISSING_START_STEP`, `CYCLE` y `TARGET_OUTSIDE_SIMULATION` (`step_id` y `option_id` de la opción que cierra el ciclo o apunta fuera) y `UNREACHABLE_STEP` (`step_id` del primer paso inalcanzable).
- **Metadatos.** `SimulationInput` incluye `title`, `description`, `difficulty`, `estimated_duration?` y `skills: [{ skill_id, weight, expected_level }]`. Las habilidades son únicas, con un mínimo de una y máximo de 20. Los pesos van de 0.01 a 1 con hasta dos decimales y el nivel esperado es entero de 0 a 100. `AdminSimulation` amplía el resumen del catálogo con estados DRAFT, PUBLISHED e INACTIVE.
- **Contenido.** Los pasos llevan `id`, `order`, `title`, `description`, `type`, `context` y `options`. Los tipos son EMAIL, MEETING, CONVERSATION, TASK e INCIDENT. El contexto tiene campos propios de cada tipo. Cada opción incluye `id`, `description`, `score`, `next_step_id`, `consequences` y `feedback`. El cliente asigna UUID v4 a pasos y opciones. Un `next_step_id: null` termina la ruta. El cuerpo HTTP tiene el límite global de 1 MiB. Los [esquemas compartidos](../../shared/src/simulation-admin.ts) detallan rangos y campos.
- **Edición y publicación.** El primer guardado devuelve versión 1. Para reemplazar, enviar la versión que se leyó. Publicar usa una copia inmutable de esa versión. La API fija la referencia y el estado en PostgreSQL junto con el evento, y el catálogo puede mostrar la simulación aun si el grafo queda PENDING. Al desactivar, el catálogo la oculta y el administrador aún puede consultar la revisión publicada. Una baja de borrador puede dejar limpieza documental pendiente si MongoDB falla después del commit.

### F2 Jugar una simulación (RF-03, RF-04, RF-05)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `POST /api/attempts` | Usuario | PG L, Mongo L → PG E + *ev* | `{ simulation_id }` | `201 { attempt, current_step, synchronization }` | `404 NOT_FOUND`, `409 SIMULATION_NOT_PUBLISHED` (RI-19), `409 ACTIVE_ATTEMPT_EXISTS` con `details.attempt_id` |
| `GET /api/attempts` | Usuario | PG L | `status?`, `limit?` (1–100, por defecto 20), `offset?` (por defecto 0) | `200 { items: Attempt[], total }`, solo los propios, por inicio descendente e ID | — |
| `GET /api/attempts/:attemptId` | Dueño | PG L, Mongo L si sigue activo | — | `200 { attempt, current_step: PlayerStep \| null, responses: AttemptResponse[] }` | `404 NOT_FOUND` |
| `POST /api/attempts/:attemptId/responses` | Dueño | Mongo L → PG E + *ev* | `{ step_id, option_id }` | `201 { attempt, response, consequences, feedback, next_step, synchronization }` | `404 NOT_FOUND`, `409 ATTEMPT_NOT_IN_PROGRESS` (RI-22), `409 STEP_NOT_CURRENT` con `details.step_id`, `400 OPTION_NOT_IN_STEP` (RI-10) |
| `POST /api/attempts/:attemptId/abandon` | Dueño | PG E + *ev* | — | `200 { attempt, synchronization }` | `404 NOT_FOUND`, `409 ATTEMPT_NOT_IN_PROGRESS` |

- `Attempt`: `{ id, simulation_id, status, started_at, finished_at, score }`. Los estados son `IN_PROGRESS`, `COMPLETED` y `ABANDONED`. Solo un intento completado tiene puntuación. Las fechas son UTC y `finished_at` es nulo durante el intento.
- `AttemptResponse`: `{ id, step_id, option_id, sequence, answered_at }`. La secuencia empieza en 1. En el detalle, las respuestas se ordenan por secuencia.
- `PlayerStep`: `{ id, order, type, title, description, context, options }`. Usa los tipos y campos de contexto de F1 administración. Cada opción contiene únicamente `{ id, description }`. Tras elegir, `consequences` y `feedback` tienen la forma de la opción en F1 administración.
- El paso inicial tiene `order = 1`. A partir de ahí, manda el destino de la última opción. Una opción sin destino completa el intento y devuelve `next_step: null` (RI-23). La respuesta, el cierre y los eventos se confirman en una sola transacción.
- Si se reenvía una respuesta que ya avanzó el intento, la API devuelve `409 STEP_NOT_CURRENT`. Si ya lo cerró, devuelve `409 ATTEMPT_NOT_IN_PROGRESS`. En ambos casos, el cliente puede recuperar el estado con `GET`.
- Desactivar una simulación impide iniciar intentos nuevos. Los intentos activos pueden continuar con la revisión publicada que PostgreSQL conserva.
- Si MongoDB no está disponible, las operaciones que necesitan el contenido devuelven `503 DATABASE_UNAVAILABLE`. Si falta la revisión o no se puede resolver el recorrido en ella, devuelven `503 PUBLISHED_CONTENT_UNAVAILABLE`. No se registra ninguna respuesta en esos casos.
- Si Neo4j no confirma los eventos después del commit, `synchronization.graph` es `PENDING` y el cambio sigue guardado en PostgreSQL.
- **Puntuación provisional (D-21, P-03):** promedio de las valoraciones elegidas, en una escala de 0 a 100, redondeado a dos decimales. En un empate exacto se toma el centésimo par.

### F3a Perfil y evidencias (RF-06, RF-07, RF-08)

| Método y ruta | Acceso | Bases | Entrada | Respuesta |
|---|---|---|---|---|
| `GET /api/profile` | Usuario | PG L + Neo4j L + Mongo L | — | `200 Profile` |
| `GET /api/profile/skills` | Usuario | Neo4j L | — | `200 { items: ProfileSkill[] }` (C-02) |
| `GET /api/profile/recommendations` | Usuario | Neo4j L + PG L | `limit?` | `200 { items: Recommendation[] }` (C-01) |
| `GET /api/profile/skills/:skillId/evolution` | Usuario | Neo4j L | — | `200 { skill: { id, name, target }, current_level, points: [{ finished_at, simulation: { id, title }, score, weight }] }` (C-05) |
| `GET /api/profile/attempts/:attemptId/path` | Dueño | PG L + Neo4j L + Mongo L | — | `200 { attempt, decisions, graph_pending }` (C-03) |
| `POST /api/evidence` | Usuario | PG L + Mongo L/E → PG E + *ev* | `{ attempt_id, title? }` | `201 { evidence, synchronization }` |
| `GET /api/evidence` | Usuario | PG L (+ Neo4j L con filtro) | `skill_id?`, `limit?`, `offset?` | `200 { items, total }` (C-04 cuando se filtra) |
| `GET /api/evidence/:evidenceId` | Dueño | PG L + Mongo L | — | `200 { evidence, content }` |
| `PATCH /api/evidence/:evidenceId` | Dueño | PG E (+ *ev* si cambia el título) | `{ title?, visibility? }`, al menos un campo | `200 { evidence, synchronization }`, con sincronización nula si no cambia el título |
| `DELETE /api/evidence/:evidenceId` | Dueño | PG E + *ev* → Mongo E | — | `200 { deleted: true, synchronization }` |

`Profile` incluye `user: { id, name }`, `summary: { completed_attempts, evidence_count }`, `skills`, `recommendations`, `recent_evidence`, `incomplete_data` y `pending_sync_count`. Las habilidades incluyen `id, name, visual_type, current_level, target, classification, correct, partial, incorrect`. Las recomendaciones incluyen `simulation: SimulationSummary, skills_to_improve, priority`. Se valida en PostgreSQL que las recomendaciones sigan publicadas.

El perfil devuelve hasta cinco recomendaciones y cinco evidencias recientes. Cada evidencia reciente incluye la descripción de su instantánea. Si Neo4j o MongoDB no responden, el perfil conserva los datos disponibles y añade `graph` o `document` a `incomplete_data`. Una instantánea faltante también marca `document`. Si falla PostgreSQL, el perfil responde `503 DATABASE_UNAVAILABLE`. `pending_sync_count` cuenta los eventos sin aplicar atribuibles al usuario y sus intentos.

El recorrido devuelve decisiones con `sequence, step: { id, title, type }, option: { id, description }, consequences, feedback`. PostgreSQL valida la propiedad y conserva el recorrido confirmado. MongoDB aporta los textos de la revisión publicada. La API devuelve `graph_pending: true` si C-03 aún no refleja ese recorrido. Las rutas individuales devuelven `503 DATABASE_UNAVAILABLE` si falla una base requerida.

`Evidence` incluye `id, attempt_id, title, generated_at, visibility`. El listado añade `simulation, skills` (cada una con `id, name, visual_type`), `active_shares` y usa `limit` de 1 a 100 (20 por defecto) y `offset` de 0 por defecto. Los enlaces cuentan si están activos y no han vencido. El filtro de habilidad usa la proyección de Neo4j y respeta propiedad y existencia en PostgreSQL. Las evidencias nacen `PRIVATE`. Cambiar a `PUBLIC` no concede acceso anónimo al detalle.

Solo se genera una evidencia por intento completado. Si no se envía título, se usa el de la simulación. La instantánea conserva descripción, simulación, puntuación, habilidades, decisiones y fecha de creación. El propietario puede cambiar título y visibilidad sin alterar la instantánea. Si PostgreSQL rechaza la transacción se intenta retirar el documento. Si no se puede confirmar su estado, la reconciliación se encarga de revisar la copia. El borrado confirma registro y evento antes de retirar el documento.

Los recursos ausentes o ajenos devuelven `404 NOT_FOUND`. Generar evidencia de un intento sin completar devuelve `409 ATTEMPT_NOT_COMPLETED`. Una evidencia ya existente devuelve `409 EVIDENCE_ALREADY_EXISTS` con `details.evidence_id`. Una revisión o instantánea ausente devuelve `503 PUBLISHED_CONTENT_UNAVAILABLE` o `503 EVIDENCE_CONTENT_UNAVAILABLE`, según corresponda. Las formas completas están en `shared/src/f3a.ts`.

### F3b Compartir evidencias (RF-09)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `POST /api/evidence/:evidenceId/shares` | Dueño | PG E | `{ expires_in_days?, recipient? }` | `201 EvidenceShare` | `400 VALIDATION_ERROR`, `404 NOT_FOUND` |
| `GET /api/evidence/:evidenceId/shares` | Dueño | PG L | — | `200 { items: EvidenceShare[], total }` | `404 NOT_FOUND` |
| `DELETE /api/shares/:shareId` | Dueño | PG E | — | `204` | `404 NOT_FOUND` |
| `GET /api/public/evidence/:token` | Público | PG L → Mongo L | — | `200 SharedEvidence` | `404 INVALID_SHARE_LINK`, `410 SHARE_LINK_EXPIRED`, `503 DATABASE_UNAVAILABLE` o `EVIDENCE_CONTENT_UNAVAILABLE` |

- `EvidenceShare` incluye `id, token, public_url, recipient, created_at, expires_at, status, is_valid`. Los enlaces nuevos duran de 1 a 90 días de 24 horas, 30 por defecto. `recipient` es una etiqueta opcional de hasta 150 caracteres y solo la ve el dueño del enlace. Los enlaces existentes con `expires_at: null` no caducan.
- Los tokens nuevos usan 32 bytes aleatorios en base64url. PostgreSQL garantiza su unicidad (RI-15). `public_url` es una ruta relativa al origen de la API. El listado ordena por fecha de creación descendente e ID. Revocar guarda el estado `REVOKED` y puede repetirse con la misma respuesta `204`.
- El acceso público requiere un enlace activo y vigente, sin importar la visibilidad de la evidencia. Un enlace inexistente o revocado devuelve `404`, incluso si también venció. Un enlace activo que llegó a su vencimiento devuelve `410`. La API comprueba ambas condiciones en PostgreSQL antes de leer MongoDB.
- `SharedEvidence` incluye `title, generated_at, owner: { name }, content`. El contenido incluye descripción, título de la simulación, puntuación, nombres de habilidades y decisiones de la instantánea. El detalle público omite IDs internos, correo, destinatario y metadatos del enlace.
- Las respuestas de compartición usan `Cache-Control: no-store`. La ruta pública usa `Referrer-Policy: no-referrer` y oculta el token en los registros de la API. Los esquemas completos están en `shared/src/f3b.ts`.

## 4. Rutas por archivo (para no chocar en merges)

| Archivo en `backend/src/routes/` | Rutas | Dueño |
|---|---|---|
| `health.routes.ts` | `/api/health` | A |
| `f1.routes.ts` | `/api/auth/*`, `/api/me`, `/api/skills`, `/api/admin/skills/*`, `/api/simulations/*` | Antonio |
| `simulation-admin.routes.ts` | `/api/admin/simulations/*` | Antonio |
| `attempt.routes.ts` | `/api/attempts`, `/api/attempts/*` | Antonio |
| `profile.routes.ts` | `/api/profile`, `/api/profile/*` | A |
| `evidence.routes.ts` | `/api/evidence`, `/api/evidence/*` (GET, POST, PATCH, DELETE) | A |
| `share.routes.ts` | `/api/evidence/:evidenceId/shares`, `/api/shares/:shareId`, `/api/public/evidence/:token` | B |

## 5. Cobertura

| Requisito | Endpoints |
|---|---|
| Altas, cambios, consultas y bajas por base (nota de la guía) | PG: usuario, habilidad, simulación, intento, comparticion · Mongo: contenido (`PUT`/`GET`/`DELETE`), evidencia · Neo4j: lecturas C-01 a C-05 y escrituras por eventos |
| Flujo integrado (guía §8.1) | `GET /api/profile` |
| Escritura en varias bases con fallo parcial (guía §9) | `POST /api/admin/simulations/:simulationId/publish`, `DELETE /api/admin/simulations/:simulationId`, `DELETE /api/me`, generación y borrado de evidencias |
| Consistencia (guía §9) | Operaciones con `synchronization` y `GET /api/profile` (`pending_sync_count`) |
| RF-01 a RF-09 | Todos cubiertos. RF-10 (móvil, sesiones cortas) se cubre en la interfaz: retomar un intento con `409 ACTIVE_ATTEMPT_EXISTS` + `GET /api/attempts/:attemptId` |
