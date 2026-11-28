# E8. Integridad de datos · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** aprobadas las comprobaciones en los tres modelos. [Salida y entorno](README.md)

| Motor | Escenario y resultado observado | Evidencia |
|---|---|---|
| PostgreSQL | El esquema rechazó filas que violaban claves, estados, fechas y rangos. La reversión retiró juntos la respuesta, el cierre y el evento asociado. | [Pruebas relacionales](../../tests/integration/relacional.test.ts) · [Consultas SQL de validación](../../database/relational/tests) |
| MongoDB | El validador rechazó un paso con contexto de otro tipo. La validación de publicación rechazó ciclos, destinos externos y pasos inalcanzables. Dos publicaciones con el mismo ID de paso u opción produjeron una sola inserción válida. | [Pruebas documentales](../../tests/integration/documental.test.ts) · [Validadores](../../database/document/validators/esquemas.mjs) |
| Neo4j | La carga produjo **34 nodos y 53 relaciones**. Pasaron las comprobaciones de esquema, datos, cardinalidad, integridad y resultados de C-01 a C-05. | [Pruebas del grafo](../../tests/integration/grafo.test.ts) · [Consultas Cypher de integridad](../../database/graph/tests/03-integridad.cypher) |
