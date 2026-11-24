# Contrato de la API v0 — QATO'K

- **Entregable E6 · contrato 0.4.0.** Salud, F1 y F2 tienen implementación. Las demás secciones documentan flujos previstos.
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

Los objetos siguientes conservan la notación del diseño original. Para los objetos vigentes, consulta F1 y F2 y sus esquemas en `shared/src/`.

```jsonc
// Usuario
{ "id_usuario": "uuid", "nombre": "Ana López", "correo": "ana@correo.com",
  "rol": "ESTUDIANTE", "estado": "ACTIVO", "fecha_registro": "2026-11-18T21:30:00.000Z" }

// Habilidad
{ "id_habilidad": "uuid", "nombre": "Comunicación efectiva", "descripcion": "…",
  "categoria": "Blanda", "nivel_objetivo": 70 }

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
| `POST /api/admin/skills` | Admin | PG E + *ev* | `{ name, description, category, target_level? }` | `201 { skill, synchronization }` | `400`, `403 FORBIDDEN`, `409 SKILL_ALREADY_EXISTS` |
| `PUT /api/admin/skills/:skillId` | Admin | PG E + *ev* | Igual que POST | `200 { skill, synchronization }` | `404 NOT_FOUND`, `409 SKILL_ALREADY_EXISTS` |
| `DELETE /api/admin/skills/:skillId` | Admin | PG E + *ev* | — | `200 { deleted: true, synchronization }` | `404 NOT_FOUND`, `409 SKILL_IN_USE` |

La respuesta incluye `id` y `target_level`, que puede ser un entero de 0 a 100 o nulo.

### F1 Catálogo de simulaciones (RF-02)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/simulations` | Usuario | PG L | `search?`, `skill_id?`, `difficulty?`, `limit?`, `offset?` | `200 { items: SimulationSummary[], total }` | `400 VALIDATION_ERROR` |
| `GET /api/simulations/:simulationId` | Usuario | PG L | — | `200 SimulationSummary` | `404 NOT_FOUND` si no existe o no está publicada |

El resumen incluye `id`, `title`, `description`, `difficulty` (`BASIC`, `INTERMEDIATE`, `ADVANCED`), `estimated_duration` (entero o nulo), `status: "PUBLISHED"` y `skills: [{ id, name, weight, expected_level }]`. La búsqueda compara texto literal en el título o la descripción sin distinguir mayúsculas. Los filtros se combinan. Los resultados se ordenan por título e ID, con `limit=20` (máximo 100), `offset=0` y el total antes de paginar.

### F1 Administración de simulaciones

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/admin/simulations` | ADMIN | PG L | `status?`, `limit?`, `offset?` | `200 { items: AdminSimulation[], total }` | `400 VALIDATION_ERROR` |
| `POST /api/admin/simulations` | ADMIN | PG E | `SimulationInput` | `201 AdminSimulation` con estado DRAFT | `400 VALIDATION_ERROR`, `404 SKILL_NOT_FOUND` |
| `PUT /api/admin/simulations/:simulationId` | ADMIN | PG E | `SimulationInput` | `200 AdminSimulation` | `400 VALIDATION_ERROR`, `404 NOT_FOUND` o `SKILL_NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` |
| `GET /api/admin/simulations/:simulationId/content` | ADMIN | PG + Mongo L | — | `200 { version, steps }` | `404 NOT_FOUND` o `MISSING_CONTENT` |
| `PUT /api/admin/simulations/:simulationId/content` | ADMIN | PG L → Mongo E | `{ version, steps }`; `version: null` para crear | `200 { version, steps }` | `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` o `STALE_CONTENT_VERSION` |
| `POST /api/admin/simulations/:simulationId/publish` | ADMIN | Mongo L/E → PG E + *ev* | `{ version }` | `200 { simulation, synchronization }` | `404 NOT_FOUND`, `409 MISSING_CONTENT`, `INCOMPLETE_CONTENT`, `INVALID_BRANCHES`, `STALE_CONTENT_VERSION`, `SIMULATION_NOT_EDITABLE` o `CONTENT_ID_CONFLICT` |
| `POST /api/admin/simulations/:simulationId/deactivate` | ADMIN | PG E + *ev* | — | `200 { simulation, synchronization }` | `404 NOT_FOUND`, `409 SIMULATION_NOT_PUBLISHED` |
| `DELETE /api/admin/simulations/:simulationId` | ADMIN | PG E → Mongo E | — | `204` | `404 NOT_FOUND`, `409 SIMULATION_NOT_EDITABLE` |

Todas estas rutas devuelven `401 UNAUTHENTICATED` sin sesión válida y `403 FORBIDDEN` sin rol ADMIN. Si una base es necesaria para completar la operación y no responde, se devuelve `503 DATABASE_UNAVAILABLE`.

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

### F3a Perfil y evidencias — dueño A (RF-06, RF-07, RF-08)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `GET /api/perfil` | Usuario | **PG L + Neo4j L + Mongo L** | — | `200` (abajo): **el flujo integrado** | `503` si falta PG; si falta Neo4j o Mongo responde con `datos_incompletos` |
| `GET /api/perfil/habilidades` | Usuario | Neo4j L | — | `200 { datos: HabilidadPerfil[] }` (C-02) | — |
| `GET /api/perfil/recomendaciones` | Usuario | Neo4j L | `limite?` | `200 { datos: [{ simulacion: SimulacionResumen, habilidades_a_reforzar: [nombre] }] }` (C-01) | — |
| `GET /api/perfil/habilidades/:id_habilidad/evolucion` | Usuario | Neo4j L | — | `200 { nivel_actual, puntos: [{ fecha, id_simulacion, titulo, puntuacion }] }` (C-05) | `404` |
| `GET /api/perfil/intentos/:id_intento/recorrido` | Dueño | Neo4j L + Mongo L | — | `200 { intento, decisiones: [{ secuencia, paso: { titulo, tipo }, opcion: { descripcion }, consecuencias[], retroalimentacion }] }` (C-03) | `404` |
| `POST /api/evidencias` | Usuario | Mongo E → PG E + *ev* | `{ id_intento, titulo? }` | `201 { evidencia, sincronizacion }` | `404` (no es suyo: RI-14), `409 INTENTO_NO_COMPLETADO` (RI-25), `409 EVIDENCIA_EXISTENTE` (una por intento) |
| `GET /api/evidencias` | Usuario | PG L (+ Neo4j L si hay filtro) | Query: `id_habilidad?` (C-04), paginación | `200 { datos: [{ id_evidencia, titulo, visibilidad, fecha_generacion, simulacion: { id_simulacion, titulo }, habilidades: [nombre], comparticiones_activas: n }], total }` | — |
| `GET /api/evidencias/:id_evidencia` | Dueño | PG L + Mongo L | — | `200 { evidencia, contenido }` | `404` |
| `PATCH /api/evidencias/:id_evidencia` | Dueño | PG E | `{ titulo?, visibilidad? }` | `200 evidencia` | `400`, `404` |
| `DELETE /api/evidencias/:id_evidencia` | Dueño | PG E + *ev* → Mongo E | — | `200 { eliminado: true, sincronizacion }` | `404` |

Respuesta de `GET /api/perfil`:

```json
{
  "usuario": { "id_usuario": "uuid", "nombre": "Ana López" },
  "resumen": { "intentos_completados": 3, "evidencias": 1 },
  "habilidades": [
    { "id_habilidad": "uuid", "nombre": "Comunicación efectiva", "nivel_actual": 75, "objetivo": 70,
      "clasificacion": "FORTALEZA", "aciertos": 2, "parciales": 1, "errores": 0 } ],
  "recomendaciones": [ { "id_simulacion": "uuid", "titulo": "Tres entregas para mañana", "habilidades_a_reforzar": ["Gestión del tiempo"] } ],
  "evidencias_recientes": [ { "id_evidencia": "uuid", "titulo": "Manejo de un cliente molesto" } ],
  "datos_incompletos": [],
  "sincronizacion_pendiente": 0
}
```

- `usuario` y `resumen` salen de PostgreSQL; `habilidades` y `recomendaciones`, de Neo4j; los títulos y textos, de Mongo cuando hace falta.
- `datos_incompletos` lista las bases que no respondieron (p. ej. `["grafo"]`). Las secciones de esas bases vienen vacías, en lugar de fallar toda la página.
- `sincronizacion_pendiente` = eventos del usuario que aún no llegan al grafo. Si es mayor que 0, la interfaz avisa que el progreso se está actualizando.

### F3b Compartir evidencias — dueño B (RF-09)

| Método y ruta | Acceso | Bases | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| `POST /api/evidencias/:id_evidencia/comparticiones` | Dueño | PG E | `{ dias_vigencia? (1–90, por defecto 30), destinatario? (≤150) }` | `201 { id_comparticion, token, url_publica, fecha_expiracion, estado }` | `400`, `404` |
| `GET /api/evidencias/:id_evidencia/comparticiones` | Dueño | PG L | — | `200 { datos: [ … ], total }` (cada una con `vigente: true/false`) | `404` |
| `DELETE /api/comparticiones/:id_comparticion` | Dueño de la evidencia | PG E | — | `204` (pasa a REVOCADA; no se borra) | `404` |
| `GET /api/publico/evidencias/:token` | **Público** | PG L → Mongo L | — | `200 { titulo, fecha_generacion, titular: { nombre }, contenido }` | `404 ENLACE_INVALIDO` (no existe o fue revocado), `410 ENLACE_VENCIDO`, `503 BASE_NO_DISPONIBLE` |

- **Token:** 32 bytes aleatorios en base64url, generados en el backend; único (RI-15).
- **Visibilidad:** en v0 solo el token da acceso público, sin importar `visibilidad`. Para qué sirve `PUBLICA` queda abierto (P-06).

## 4. Rutas por archivo (para no chocar en merges)

| Archivo en `backend/src/routes/` | Rutas | Dueño |
|---|---|---|
| `health.routes.ts` | `/api/health` | A |
| `f1.routes.ts` | `/api/auth/*`, `/api/me`, `/api/skills`, `/api/admin/skills/*`, `/api/simulations/*` | Antonio |
| `simulation-admin.routes.ts` | `/api/admin/simulations/*` | Antonio |
| `attempt.routes.ts` | `/api/attempts`, `/api/attempts/*` | Antonio |
| `perfil.routes.ts` | `/api/perfil/*` | A |
| `evidencias.routes.ts` | `/api/evidencias` (GET lista y detalle, POST, PATCH, DELETE) | A |
| `comparticiones.routes.ts` | `/api/evidencias/:id/comparticiones`, `/api/comparticiones/*`, `/api/publico/*` | B |

## 5. Cobertura

| Requisito | Endpoints |
|---|---|
| Altas, cambios, consultas y bajas por base (nota de la guía) | PG: usuario, habilidad, simulación, intento, comparticion · Mongo: contenido (`PUT`/`GET`/`DELETE`), evidencia · Neo4j: lecturas C-01 a C-05 y escrituras por eventos |
| Flujo integrado (guía §8.1) | `GET /api/perfil` |
| Escritura en varias bases con fallo parcial (guía §9) | `POST /api/admin/simulations/:simulationId/publish`, `DELETE /api/admin/simulations/:simulationId`, `DELETE /api/me`, evidencias previstas |
| Consistencia (guía §9) | Todo lo que devuelve `sincronizacion` + `GET /api/perfil` (`sincronizacion_pendiente`) |
| RF-01 a RF-09 | Todos cubiertos. RF-10 (móvil, sesiones cortas) se cubre en la interfaz: retomar un intento con `409 ACTIVE_ATTEMPT_EXISTS` + `GET /api/attempts/:attemptId` |
