# E8. Consistencia y reconciliación · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** aprobados los escenarios de actualización, detección y reparación. [Salida y entorno](README.md)

| Escenario | Resultado observado | Evidencia |
|---|---|---|
| Registrar una decisión con Neo4j indisponible | PostgreSQL confirmó la decisión y el cierre. La API dio HTTP 201 con `synchronization.graph = PENDING`. El reintento aplicó los eventos y Neo4j reflejó la misma respuesta y puntuación. | [Respuesta confirmada y aplicación posterior](../../tests/integration/attempt.test.ts#L236) |
| Repetir eventos y recuperar una conexión | Reaplicar todos los eventos preservó exactamente el grafo. Al recuperar Neo4j, el consumidor reintentó en orden y avanzó tras confirmar la aplicación. | [Idempotencia](../../tests/integration/aplicador-grafo.test.ts) · [Cola y reintentos](../../tests/integration/outbox.test.ts) |
| Introducir diferencias controladas en Neo4j | El diagnóstico identificó nodos faltantes, sobrantes y modificados y una relación alterada. Conservó esas diferencias hasta pedir reparación. La reparación restauró la coherencia y una segunda ejecución quedó sin cambios. | [Diagnóstico y reparación](../../tests/integration/reconciliation.test.ts#L86) |
| Revisar documentos desconectados de PostgreSQL | La reconciliación eliminó candidatos antiguos que cumplían las condiciones de limpieza y esperó una segunda observación antes de retirar un borrador huérfano. | [Reconciliación documental](../../tests/integration/reconciliation.test.ts#L120) |
