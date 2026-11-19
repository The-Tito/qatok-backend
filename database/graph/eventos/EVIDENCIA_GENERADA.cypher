// =====================================================================
// QATO'K · evento EVIDENCIA_GENERADA (F3a) · Parámetros: $id_evidencia,
// $id_usuario, $id_intento, $titulo
// El MATCH exige que el intento sea del usuario (RI-14). DEMUESTRA se deriva
// de DESARROLLA de la simulación del intento (RI-20), como data/04-derivados.
// =====================================================================
MATCH (u:Usuario {id_usuario: $id_usuario})-[:REALIZA]->(i:Intento {id_intento: $id_intento})
MERGE (e:Evidencia {id_evidencia: $id_evidencia})
SET e.titulo = $titulo
MERGE (u)-[:GENERA]->(e)
MERGE (i)-[:PRODUCE]->(e);
MATCH (e:Evidencia {id_evidencia: $id_evidencia})<-[:PRODUCE]-(:Intento)<-[:TIENE]-(:Simulacion)-[:DESARROLLA]->(h:Habilidad)
MERGE (e)-[:DEMUESTRA]->(h);
// Comprobación: existía el intento del usuario
RETURN EXISTS { MATCH (:Usuario {id_usuario: $id_usuario})-[:GENERA]->(:Evidencia {id_evidencia: $id_evidencia})<-[:PRODUCE]-(:Intento {id_intento: $id_intento}) } AS ok;
