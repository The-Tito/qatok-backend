// =====================================================================
// QATO'K · C-05 · Evolución de una habilidad (RF-06)
// Parámetros: $idUsuario, $habilidad (nombre). Igual que el entregable 1.
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:REALIZA]->(i:Intento {estado: 'COMPLETADO'})<-[:TIENE]-(s:Simulacion)-[d:DESARROLLA]->(h:Habilidad {nombre: $habilidad})
OPTIONAL MATCH (u)-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h)
RETURN i.fecha_fin AS fecha, s.titulo AS simulacion,
       i.puntuacion AS puntuacion, d.peso AS peso,
       p.nivel_actual AS nivel_actual_consolidado
ORDER BY fecha;
