// =====================================================================
// QATO'K · evento INTENTO_INICIADO (F2) · Parámetros: $id_intento,
// $id_usuario, $id_simulacion, $fecha_inicio (ISO)
// El estado EN_CURSO solo se pone al crear: si el evento se reaplica
// después de INTENTO_FINALIZADO, no revierte el intento.
// =====================================================================
MATCH (u:Usuario {id_usuario: $id_usuario}), (s:Simulacion {id_simulacion: $id_simulacion})
MERGE (i:Intento {id_intento: $id_intento})
  ON CREATE SET i.estado = 'EN_CURSO'
SET i.fecha_inicio = datetime($fecha_inicio)
MERGE (u)-[:REALIZA]->(i)
MERGE (s)-[:TIENE]->(i);
// Comprobación: existían el usuario y la simulación
RETURN EXISTS { MATCH (:Usuario {id_usuario: $id_usuario})-[:REALIZA]->(:Intento {id_intento: $id_intento})<-[:TIENE]-(:Simulacion {id_simulacion: $id_simulacion}) } AS ok;
