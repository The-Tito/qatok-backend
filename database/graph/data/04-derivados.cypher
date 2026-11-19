// =====================================================================
// QATO'K · data/04 · Datos derivados (Neo4j es su dueño)
// Se ejecuta después de 03-carga.cypher. Idempotente: recalcula desde cero,
// nunca incrementa (matriz §5). Son las mismas consultas que aplicarán los
// eventos EVIDENCIA_GENERADA e INTENTO_FINALIZADO (backend #7), aquí para
// todos los usuarios a la vez.
// =====================================================================

// DEMUESTRA (RI-20): la evidencia demuestra las habilidades que desarrolla
// la simulación del intento que la produjo.
MATCH (e:Evidencia)<-[:PRODUCE]-(:Intento)<-[:TIENE]-(:Simulacion)-[:DESARROLLA]->(h:Habilidad)
MERGE (e)-[:DEMUESTRA]->(h);

// Progreso.nivel_actual (fórmula PROPUESTA para P-03, DEC-25):
// promedio ponderado por DESARROLLA.peso de la puntuación del último intento
// COMPLETADO de cada simulación que desarrolla la habilidad, redondeado a 2
// decimales. fecha_actualizacion = la fecha_fin más reciente que entra en el
// cálculo (así la carga es reproducible). Progreso solo existe en el grafo:
// su id lo genera Neo4j al crearlo y nunca viaja a otra base.
MATCH (u:Usuario)-[:REALIZA]->(i:Intento {estado: 'COMPLETADO'})<-[:TIENE]-(s:Simulacion)
WITH u, s, i ORDER BY i.fecha_fin DESC
WITH u, s, collect(i)[0] AS ultimo
MATCH (s)-[d:DESARROLLA]->(h:Habilidad)
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
