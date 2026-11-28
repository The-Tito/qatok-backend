// =====================================================================
// QATO'K · C-02 · Fortalezas y áreas de mejora (RF-07)
// Parámetros: $idUsuario. Los conteos leen Respuesta.tipo_retroalimentacion
// (el nodo Retroalimentacion sale del grafo, D-18). Filas con la forma de
// HabilidadPerfil (contrato F3a: GET /api/perfil/habilidades).
// =====================================================================
MATCH (u:Usuario {id_usuario: $idUsuario})-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h:Habilidad)
OPTIONAL MATCH (u)-[:REALIZA]->(i:Intento)<-[:TIENE]-(:Simulacion)-[d:DESARROLLA]->(h)
OPTIONAL MATCH (i)-[:REGISTRA]->(r:Respuesta)
WITH h, p,
     max(d.nivel_esperado) AS esperado_max,
     count(CASE WHEN r.tipo_retroalimentacion = 'ACIERTO' THEN 1 END) AS aciertos,
     count(CASE WHEN r.tipo_retroalimentacion = 'PARCIAL' THEN 1 END) AS parciales,
     count(CASE WHEN r.tipo_retroalimentacion = 'ERROR' THEN 1 END) AS errores
WITH h, p, coalesce(h.nivel_objetivo, esperado_max) AS objetivo, aciertos, parciales, errores
RETURN h.id_habilidad AS id_habilidad, h.nombre AS nombre, p.nivel_actual AS nivel_actual, objetivo,
       CASE
         WHEN objetivo IS NULL THEN 'SIN_REFERENCIA'
         WHEN p.nivel_actual >= objetivo THEN 'FORTALEZA'
         ELSE 'AREA_DE_MEJORA'
       END AS clasificacion,
       aciertos, parciales, errores
ORDER BY nivel_actual DESC, nombre;
