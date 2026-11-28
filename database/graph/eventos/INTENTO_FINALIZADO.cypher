// =====================================================================
// QATO'K · evento INTENTO_FINALIZADO (F2) · Parámetros: $id_intento,
// $estado (COMPLETADO o ABANDONADO), $fecha_fin (ISO), $puntuacion (o null)
// Cierra el intento y recalcula desde cero el Progreso del usuario en las
// habilidades de la simulación. Es la misma fórmula que data/04-derivados
// (DEC-25, PROPUESTA para P-03) limitada a un usuario y sus habilidades.
// =====================================================================
OPTIONAL MATCH (i:Intento {id_intento: $id_intento})
SET i.estado = $estado, i.fecha_fin = datetime($fecha_fin), i.puntuacion = toFloat($puntuacion);
MATCH (u:Usuario)-[:REALIZA]->(:Intento {id_intento: $id_intento})<-[:TIENE]-(:Simulacion)-[:DESARROLLA]->(h:Habilidad)
WITH DISTINCT u, h
MATCH (u)-[:REALIZA]->(i:Intento {estado: 'COMPLETADO'})<-[:TIENE]-(s:Simulacion)-[:DESARROLLA]->(h)
WITH u, h, s, i ORDER BY i.fecha_fin DESC, i.id_intento DESC
WITH u, h, s, collect(i)[0] AS ultimo
MATCH (s)-[d:DESARROLLA]->(h)
WITH u, h,
     sum(d.peso * ultimo.puntuacion) AS suma,
     sum(d.peso) AS pesos,
     max(ultimo.fecha_fin) AS fecha
MERGE (p:Progreso {id_usuario: u.id_usuario, id_habilidad: h.id_habilidad})
  ON CREATE SET p.id_progreso = randomUUID()
SET p.nivel_actual = round(suma / pesos, 2),
    p.fecha_actualizacion = fecha
MERGE (u)-[:TIENE_PROGRESO]->(p)
MERGE (p)-[:CORRESPONDE_A]->(h);
// Comprobación: el intento ya estaba proyectado
RETURN EXISTS { MATCH (:Intento {id_intento: $id_intento}) } AS ok;
