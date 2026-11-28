# E8. Pruebas funcionales · 27 de noviembre de 2026

**Versión probada** `qatok-backend@d843833`. **Resultado** aprobados los casos de los flujos de API indicados. [Salida y entorno](README.md)

| Flujo | Escenario y resultado observado | Evidencia |
|---|---|---|
| **F1 · Cuentas y catálogo** | El registro normalizó el correo, el inicio de sesión devolvió la cuenta sin credenciales y el catálogo mostró las simulaciones publicadas. Los filtros, la búsqueda literal y la paginación devolvieron los resultados esperados. | [Cuentas, catálogo y roles](../../tests/integration/f1.test.ts) |
| **F1 · Administración** | Una persona con rol Admin consultó el borrador por ID y obtuvo los mismos metadatos que al editarlo. El ID inexistente dio 404 y el rol estudiante recibió 403. | [Administración](../../tests/integration/simulation-admin.test.ts#L204) |
| **F2 · Juego** | El intento recuperó el siguiente paso después de responder. La opción terminal completó la partida con puntuación 92.5 y `next_step: null`. | [Reanudación y cierre](../../tests/integration/attempt.test.ts#L170) |
| **F3a · Perfil y evolución** | El perfil reportó tres intentos completados y una evidencia para la cuenta de prueba. La evolución de Comunicación efectiva devolvió su nombre, meta 75, nivel 75 y puntos de historial. | [Perfil y evolución](../../tests/integration/profile.test.ts#L154) |
| **F3b · Compartición** | El enlace vigente devolvió la vista pública prevista. La revocación retiró el acceso y mantuvo la entrada en el historial del dueño. | [Creación, lectura y revocación](../../tests/integration/share.test.ts) |
