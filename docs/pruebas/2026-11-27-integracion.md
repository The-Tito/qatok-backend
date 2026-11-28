# E8. Integración entre bases · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** aprobados los escenarios de extremo a extremo a través de la API. [Salida y entorno](README.md)

| Escenario | Coordinación y resultado observado | Evidencia |
|---|---|---|
| Publicar y desactivar un escenario | MongoDB conservó la revisión exacta publicada, PostgreSQL conservó su referencia y Neo4j proyectó los pasos. Tras desactivar, el catálogo ocultó la simulación y Admin pudo consultar la misma revisión. | [Publicación y desactivación](../../tests/integration/simulation-admin.test.ts#L288) |
| Consultar el perfil integrado | La misma respuesta reunió cuenta y resumen de PostgreSQL, habilidades y recomendaciones derivadas de Neo4j, y la descripción de una evidencia de MongoDB. El perfil devolvió 200 con los datos completos. | [Perfil de las tres bases](../../tests/integration/profile.test.ts#L154) |
| Responder y consultar el recorrido | La prueba registró una decisión de juego, consultó su recorrido con textos de MongoDB mientras la proyección estaba pendiente y confirmó el cambio de recomendación al aplicar los eventos. | [Juego, recorrido y recomendación](../../tests/integration/profile.test.ts#L207) |
| Crear, editar y eliminar una evidencia | La evidencia tuvo un registro de propiedad en PostgreSQL y una instantánea en MongoDB. La edición preservó la instantánea y el borrado retiró también la proyección de Neo4j. | [Ciclo de vida de evidencia](../../tests/integration/profile.test.ts#L249) |
