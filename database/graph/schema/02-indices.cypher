// =====================================================================
// QATO'K · schema/02 · Índices
// Las restricciones de 01 ya indexan los id_*, Habilidad.nombre y la clave
// de Progreso. Aquí van solo los índices que piden C-01..C-05.
// =====================================================================

// C-01 · simulaciones PUBLICADAS
CREATE INDEX simulacion_estado IF NOT EXISTS FOR (n:Simulacion) ON (n.estado);

// C-05 · intentos COMPLETADO de un usuario
CREATE INDEX intento_estado IF NOT EXISTS FOR (n:Intento) ON (n.estado);

// C-03 · recorrido ordenado por paso y por secuencia de la respuesta
CREATE INDEX paso_orden IF NOT EXISTS FOR (n:Paso) ON (n.orden);
CREATE INDEX respuesta_secuencia IF NOT EXISTS FOR (n:Respuesta) ON (n.secuencia);

// Salen respecto al modelo anterior: el índice de texto completo de
// Simulacion (la búsqueda RF-02 se hace en PostgreSQL), Habilidad.categoria,
// Evidencia.visibilidad y la vigencia de Comparticion (no se copian al grafo).

// Esperar a que todos los índices estén en línea
CALL db.awaitIndexes(120);
