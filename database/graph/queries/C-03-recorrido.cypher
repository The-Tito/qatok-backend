// =====================================================================
// QATO'K · C-03 · Recorrido de decisiones de un intento (RF-04, RF-05)
// Parámetros: $idUsuario, $idIntento. Solo el dueño: si el intento no es
// suyo (o no existe) no hay filas y el servicio responde 404. Un intento
// sin respuestas devuelve una fila con `decisiones` vacía. El grafo da la
// estructura (ids, orden y tipo de retroalimentación); el servicio completa
// los textos desde MongoDB (contrato F3a: GET /api/perfil/intentos/:id/recorrido).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:REALIZA]->(i:Intento {id_intento: $idIntento})<-[:TIENE]-(s:Simulacion)
OPTIONAL MATCH (i)-[:REGISTRA]->(r:Respuesta)-[:CORRESPONDE_A]->(p:Paso), (r)-[:SELECCIONA]->(o:Opcion)
WITH s, i, r, p, o ORDER BY r.secuencia
RETURN {id_intento: i.id_intento, id_simulacion: s.id_simulacion, estado: i.estado,
        fecha_inicio: i.fecha_inicio, fecha_fin: i.fecha_fin, puntuacion: i.puntuacion} AS intento,
       collect(CASE WHEN r IS NOT NULL THEN
         {secuencia: r.secuencia, id_paso: p.id_paso, orden: p.orden, id_opcion: o.id_opcion,
          tipo_retroalimentacion: r.tipo_retroalimentacion} END) AS decisiones;
