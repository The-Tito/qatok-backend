// =====================================================================
// QATO'K · C-04 · Evidencias de una habilidad (RF-08, RF-09)
// Parámetros: $idUsuario, $idHabilidad. Comparticion sale del grafo: el
// servicio completa visibilidad, fecha de generación y enlaces vigentes desde
// PostgreSQL con los id_evidencia devueltos (contrato F3a: GET /api/evidencias?id_habilidad).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:GENERA]->(e:Evidencia)-[:DEMUESTRA]->(:Habilidad {id_habilidad: $idHabilidad})
MATCH (s:Simulacion)-[:TIENE]->(i:Intento)-[:PRODUCE]->(e)
RETURN e.id_evidencia AS id_evidencia, e.titulo AS titulo,
       {id_simulacion: s.id_simulacion, titulo: s.titulo} AS simulacion,
       i.fecha_fin AS fecha_intento
ORDER BY fecha_intento DESC;
