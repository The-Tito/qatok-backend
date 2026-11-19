// =====================================================================
// QATO'K · evento HABILIDAD_ELIMINADA (F1) · Parámetros: $id_habilidad
// PostgreSQL solo la deja borrar si ninguna simulación la usa (FK RESTRICT),
// así que no hay DESARROLLA; por si acaso se borran sus progresos.
// =====================================================================
MATCH (p:Progreso {id_habilidad: $id_habilidad})
DETACH DELETE p;
MATCH (h:Habilidad {id_habilidad: $id_habilidad})
DETACH DELETE h;
