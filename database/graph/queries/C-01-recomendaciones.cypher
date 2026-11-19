// =====================================================================
// QATO'K · C-01 · Simulaciones recomendadas según el progreso (RF-06)
// Parámetros: $idUsuario. Igual que el entregable 1: ya usaba solo
// propiedades que el grafo conserva. Sin progreso registrado, nivel 0.
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})
MATCH (s:Simulacion {estado: 'PUBLICADA'})-[d:DESARROLLA]->(h:Habilidad)
OPTIONAL MATCH (u)-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h)
WITH s, h, d, coalesce(p.nivel_actual, 0) AS nivel
WHERE nivel < d.nivel_esperado
RETURN s.id_simulacion AS id_simulacion,
       s.titulo AS simulacion,
       collect(h.nombre) AS habilidades_a_fortalecer,
       sum(d.peso * (d.nivel_esperado - nivel)) AS prioridad
ORDER BY prioridad DESC;
