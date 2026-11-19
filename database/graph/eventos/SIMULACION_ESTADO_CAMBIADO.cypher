// =====================================================================
// QATO'K · evento SIMULACION_ESTADO_CAMBIADO (F1) · Parámetros:
// $id_simulacion, $estado (PUBLICADA o INACTIVA; BORRADOR no llega al grafo)
// =====================================================================
OPTIONAL MATCH (s:Simulacion {id_simulacion: $id_simulacion})
SET s.estado = $estado;
// Comprobación: la simulación ya estaba proyectada
RETURN EXISTS { MATCH (:Simulacion {id_simulacion: $id_simulacion}) } AS ok;
