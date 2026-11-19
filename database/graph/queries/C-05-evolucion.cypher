// =====================================================================
// QATO'K · C-05 · Evolución de una habilidad (RF-06)
// Parámetros: $idUsuario, $idHabilidad. Una fila con el nivel consolidado y
// los puntos (intentos COMPLETADO en orden de fecha). Sin fila si el usuario
// o la habilidad no están en el grafo: el servicio responde 404
// (contrato F3a: GET /api/perfil/habilidades/:id_habilidad/evolucion).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})
MATCH (h:Habilidad {id_habilidad: $idHabilidad})
OPTIONAL MATCH (u)-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h)
OPTIONAL MATCH (u)-[:REALIZA]->(i:Intento {estado: 'COMPLETADO'})<-[:TIENE]-(s:Simulacion)-[d:DESARROLLA]->(h)
WITH p, i, s, d ORDER BY i.fecha_fin
RETURN p.nivel_actual AS nivel_actual,
       collect(CASE WHEN i IS NOT NULL THEN
         {fecha: i.fecha_fin, id_simulacion: s.id_simulacion, titulo: s.titulo,
          puntuacion: i.puntuacion, peso: d.peso} END) AS puntos;
