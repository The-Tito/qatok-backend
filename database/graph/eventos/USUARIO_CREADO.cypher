// =====================================================================
// QATO'K · evento USUARIO_CREADO (F1) · Parámetros: $id_usuario
// Convención de eventos/: el aplicador (backend/src/repositories/graph/
// sincronizacion.repository.ts) corre todas las sentencias del archivo en
// una sola transacción con el payload como parámetros. Todo efecto es un
// MERGE por id (aplicar dos veces da lo mismo). Una sentencia que devuelve
// la columna `ok` en false revierte la transacción: el evento queda
// PENDIENTE y se reintenta (p. ej., llegó antes que sus dependencias).
// =====================================================================
MERGE (:Usuario {id_usuario: $id_usuario});
