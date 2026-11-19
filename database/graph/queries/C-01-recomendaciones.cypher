// =====================================================================
// QATO'K · C-01 · Simulaciones recomendadas según el progreso (RF-06)
// Parámetros: $idUsuario, $limite (entero ≥ 1). Sin progreso registrado,
// nivel 0. El servicio completa el resto de SimulacionResumen desde
// PostgreSQL (contrato F3a: GET /api/perfil/recomendaciones).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})
MATCH (s:Simulacion {estado: 'PUBLICADA'})-[d:DESARROLLA]->(h:Habilidad)
OPTIONAL MATCH (u)-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h)
WITH s, h, d, coalesce(p.nivel_actual, 0) AS nivel
WHERE nivel < d.nivel_esperado
WITH s, collect(h.nombre) AS habilidades_a_reforzar, sum(d.peso * (d.nivel_esperado - nivel)) AS prioridad
RETURN {id_simulacion: s.id_simulacion, titulo: s.titulo} AS simulacion,
       habilidades_a_reforzar, prioridad
ORDER BY prioridad DESC, simulacion.titulo
LIMIT toInteger($limite);
