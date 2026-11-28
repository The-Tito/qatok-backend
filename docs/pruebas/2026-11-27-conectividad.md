# E8. Conectividad · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** 3 de 3 casos aprobados. [Salida y entorno](README.md) · [Pruebas de conectividad](../../tests/integration/conectividad.test.ts)

| Escenario | Resultado observado |
|---|---|
| Consultar `GET /api/health` con los tres motores disponibles | HTTP 200, estado `OK` y `ok: true` en cada motor. El registro de la prueba mostró PostgreSQL 17 ms, MongoDB 18 ms y Neo4j 17 ms. |
| Configurar una contraseña incorrecta solo para Neo4j | HTTP 503, estado `DEGRADADO` y falla del grafo. PostgreSQL y MongoDB se mantuvieron disponibles. |
| Apuntar PostgreSQL a un puerto sin servicio | HTTP 503 con la falla identificada en la base relacional. |

Las latencias corresponden a una consulta de salud en el entorno local de esta corrida. Los casos negativos sustituyen la configuración dentro de la prueba.
