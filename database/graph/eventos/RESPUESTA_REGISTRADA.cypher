// =====================================================================
// QATO'K · evento RESPUESTA_REGISTRADA (F2) · Parámetros: $id_respuesta,
// $id_intento, $id_paso, $id_opcion, $secuencia, $tipo_retroalimentacion
// =====================================================================
MATCH (i:Intento {id_intento: $id_intento}), (p:Paso {id_paso: $id_paso}), (o:Opcion {id_opcion: $id_opcion})
MERGE (r:Respuesta {id_respuesta: $id_respuesta})
SET r.secuencia = toInteger($secuencia), r.tipo_retroalimentacion = $tipo_retroalimentacion
MERGE (i)-[:REGISTRA]->(r)
MERGE (r)-[:CORRESPONDE_A]->(p)
MERGE (r)-[:SELECCIONA]->(o);
// Comprobación: existían el intento, el paso y la opción
RETURN EXISTS { MATCH (:Intento {id_intento: $id_intento})-[:REGISTRA]->(:Respuesta {id_respuesta: $id_respuesta}) } AS ok;
