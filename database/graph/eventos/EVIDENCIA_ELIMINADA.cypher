// =====================================================================
// QATO'K · evento EVIDENCIA_ELIMINADA (F3a) · Parámetros: $id_evidencia
// =====================================================================
MATCH (e:Evidencia {id_evidencia: $id_evidencia})
DETACH DELETE e;
