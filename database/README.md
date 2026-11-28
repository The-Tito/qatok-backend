# database/

Esquemas, cargas y consultas de las 3 bases, organizados como sugiere la guía (§10). Cada carpeta tiene un **dueño**, que es la referencia de esa base: si cambias algo de otra base, avísale.

| Carpeta | Base | Dueño | Subcarpetas |
|---|---|---|---|
| `relational/` | PostgreSQL | B | `schema/` (DDL: tablas, PK, FK, CHECK, índices) · `ejecutar.mjs` (carga desde `seed/dataset.json`) · `queries/` (consultas representativas) · `tests/` (integridad y reversión) |
| `document/` | MongoDB | C | `validators/` (`$jsonSchema` por colección) · `ejecutar.mjs` (índices y carga desde el dataset) |
| `graph/` | Neo4j | A | `schema/` (restricciones e índices) · `data/` (carga generada desde `seed/` + derivados) · `queries/` (C-01..C-05) · `tests/` (`npm run db:graph:probar`) |
| `seed/` | Las 3 | A (los cambios los aprueban los 3) | `dataset.json` + `validar_dataset.py` |

Qué datos van en cada base: `docs/modelos/matriz-propiedad.md`. Nombres y tipos: `context/convenciones.md`.

## PostgreSQL en desarrollo

Después de `npm run db:up`, ejecuta `npm run db:relational:reset` para reconstruir las tablas de QATO’K en el esquema `public` y cargarlas desde el dataset. **El comando reemplaza los datos relacionales locales de esas tablas.** Todo el cambio se confirma en una transacción y el comando solo admite PostgreSQL local fuera de producción.

Para habilitar el acceso a las cuentas de muestra, pasa al cargador `QATOK_SEED_PASSWORD_HASH` con un hash bcrypt de costo 10, como indica el [inicio rápido](../README.md#inicio-rápido). La carga predeterminada deja esas cuentas sin contraseña utilizable. PostgreSQL y MongoDB usan los mismos IDs de revisión para las simulaciones publicadas.

Ejecuta `npm run test:integration -- tests/integration/relacional.test.ts` para comprobar la carga, las restricciones, el orden de eventos y las consultas. La prueba construye un esquema temporal y lo revierte al terminar.

### Cola de sincronización

Si las tablas ya existen, ejecuta `npm run db:relational:migrar` antes de arrancar la API. La migración añade `proximo_intento` y conserva el contenido de la cola. Esa misma migración añade `habilidad.tipo_visual` (nulo hasta que la administración lo elija). Un reinicio relacional nuevo ya incluye ambas columnas.

El primer evento sin aplicar puede estar esperando su próximo intento o haber agotado cinco intentos. En este último caso la cola permanece pausada. Tras corregir la causa, ejecuta `npm run db:sync:reactivar -- <id_evento>` para devolver ese evento a PENDIENTE. La API reanuda el procesamiento por orden. La reactivación solo admite la primera fila si está FALLIDO.

## MongoDB en desarrollo

Ejecuta `npm run db:document:reset` para reemplazar las colecciones locales de borradores, revisiones y evidencias. El comando crea sus validadores e índices y carga las revisiones usando los mismos IDs que PostgreSQL. Se usa solo contra MongoDB local de desarrollo.

Ejecuta `npm run test:integration -- tests/integration/documental.test.ts` para comprobar la persistencia, las validaciones y la edición concurrente. Las pruebas usan una base temporal.
