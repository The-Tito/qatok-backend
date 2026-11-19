// =====================================================================
// QATO'K · evento SIMULACION_PUBLICADA (F1) · Parámetros: $id_simulacion,
// $titulo, $habilidades [{id_habilidad, peso, nivel_esperado}],
// $pasos [{id_paso, orden, opciones [{id_opcion, id_paso_siguiente}]}]
// Proyecta la estructura publicada (inmutable, D-19).
// =====================================================================
MERGE (s:Simulacion {id_simulacion: $id_simulacion})
SET s.titulo = $titulo, s.estado = 'PUBLICADA';
MATCH (s:Simulacion {id_simulacion: $id_simulacion})
UNWIND $habilidades AS x
MATCH (h:Habilidad {id_habilidad: x.id_habilidad})
MERGE (s)-[d:DESARROLLA]->(h)
SET d.peso = toFloat(x.peso), d.nivel_esperado = toInteger(x.nivel_esperado);
MATCH (s:Simulacion {id_simulacion: $id_simulacion})
UNWIND $pasos AS x
MERGE (p:Paso {id_paso: x.id_paso})
SET p.orden = toInteger(x.orden)
MERGE (s)-[:CONTIENE]->(p);
UNWIND $pasos AS x
MATCH (p:Paso {id_paso: x.id_paso})
UNWIND x.opciones AS y
MERGE (o:Opcion {id_opcion: y.id_opcion})
MERGE (p)-[:OFRECE]->(o);
UNWIND $pasos AS x
UNWIND x.opciones AS y
WITH y WHERE y.id_paso_siguiente IS NOT NULL
MATCH (o:Opcion {id_opcion: y.id_opcion}), (p:Paso {id_paso: y.id_paso_siguiente})
MERGE (o)-[:CONDUCE_A]->(p);
// Comprobación: todas las habilidades existían en el grafo (si no, se reintenta)
MATCH (s:Simulacion {id_simulacion: $id_simulacion})
RETURN COUNT { (s)-[:DESARROLLA]->() } = size($habilidades)
       AND COUNT { (s)-[:CONTIENE]->() } = size($pasos) AS ok;
