// =====================================================================
// QATO'K · C-04 · Evidencias de una habilidad (RF-08, RF-09)
// Parámetros: $idUsuario, $habilidad (nombre). Cambio v2: Comparticion sale
// del grafo; el servicio completa visibilidad y enlaces vigentes desde
// PostgreSQL (evidencia, comparticion) con los id_evidencia devueltos.
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:GENERA]->(e:Evidencia)-[:DEMUESTRA]->(h:Habilidad {nombre: $habilidad})
MATCH (s:Simulacion)-[:TIENE]->(i:Intento)-[:PRODUCE]->(e)
RETURN e.id_evidencia AS id_evidencia, e.titulo AS evidencia,
       s.titulo AS simulacion, i.fecha_fin AS fecha
ORDER BY fecha DESC;
