// =====================================================================
// QATO'K · C-03 · Recorrido de decisiones (RF-04, RF-05)
// Parámetros: $idUsuario, $idSimulacion. Cambio v2: el grafo da la
// estructura del recorrido (ids, orden y tipo de retroalimentación); el
// servicio completa los textos del paso, la opción, las consecuencias y la
// retroalimentación desde MongoDB (contenidos_simulacion).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:REALIZA]->(i:Intento)<-[:TIENE]-(s:Simulacion {id_simulacion: $idSimulacion})
MATCH (i)-[:REGISTRA]->(r:Respuesta)-[:CORRESPONDE_A]->(p:Paso)
MATCH (r)-[:SELECCIONA]->(o:Opcion)
RETURN i.id_intento AS id_intento, i.fecha_inicio AS inicio, r.secuencia AS secuencia,
       p.id_paso AS id_paso, p.orden AS orden, o.id_opcion AS id_opcion,
       r.tipo_retroalimentacion AS tipo_retroalimentacion
ORDER BY inicio, secuencia;
