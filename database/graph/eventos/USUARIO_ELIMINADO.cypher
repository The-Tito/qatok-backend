// =====================================================================
// QATO'K · evento USUARIO_ELIMINADO (F1) · Parámetros: $id_usuario
// Borra el usuario y lo que solo existe por él: intentos, respuestas,
// progresos y evidencias (matriz §5). Sin el usuario no hace nada.
// =====================================================================
MATCH (:Usuario {id_usuario: $id_usuario})-[:REALIZA]->(:Intento)-[:REGISTRA]->(r:Respuesta)
DETACH DELETE r;
MATCH (:Usuario {id_usuario: $id_usuario})-[:REALIZA]->(i:Intento)
DETACH DELETE i;
MATCH (:Usuario {id_usuario: $id_usuario})-[:TIENE_PROGRESO]->(p:Progreso)
DETACH DELETE p;
MATCH (:Usuario {id_usuario: $id_usuario})-[:GENERA]->(e:Evidencia)
DETACH DELETE e;
MATCH (u:Usuario {id_usuario: $id_usuario})
DETACH DELETE u;
