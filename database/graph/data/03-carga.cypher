// =====================================================================
// QATO'K · data/03 · Carga del grafo desde el dataset
// ARCHIVO GENERADO: no se edita a mano. Se regenera con
//   node database/graph/data/generar-carga.mjs
// Origen: database/seed/dataset.json v1.0.0 (proyección de la matriz §3).
// Idempotente (MERGE por id): ejecutarlo dos veces da el mismo grafo.
// Se puede pegar completo en Neo4j Browser o pasar a cypher-shell.
// Después va data/04-derivados.cypher (Progreso y DEMUESTRA).
// =====================================================================

// Usuario (solo el id: el correo no se copia, RF-09): 3
MERGE (n:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'});
MERGE (n:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000102'});
MERGE (n:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000103'});

// Habilidad: 3
MERGE (n:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000201'}) SET n.nombre = 'Comunicación efectiva', n.nivel_objetivo = 75;
MERGE (n:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000202'}) SET n.nombre = 'Resolución de conflictos', n.nivel_objetivo = 70;
MERGE (n:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000203'}) SET n.nombre = 'Gestión del tiempo';

// Simulacion (sin la de BORRADOR): 2
MERGE (n:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}) SET n.titulo = 'Cliente molesto por un retraso', n.estado = 'PUBLICADA';
MERGE (n:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}) SET n.titulo = 'Tres entregas para mañana', n.estado = 'PUBLICADA';

// Paso: 4
MERGE (n:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}) SET n.orden = 1;
MERGE (n:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}) SET n.orden = 2;
MERGE (n:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}) SET n.orden = 3;
MERGE (n:Paso {id_paso: 'e0000000-0000-4000-8000-000000000404'}) SET n.orden = 1;

// Opcion: 9
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000501'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000502'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000503'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000504'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000505'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000506'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000507'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000508'});
MERGE (n:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000509'});

// Intento: 4
MERGE (n:Intento {id_intento: 'e0000000-0000-4000-8000-000000000703'}) SET n.estado = 'COMPLETADO', n.fecha_inicio = datetime('2026-09-20T16:00:00.000Z'), n.fecha_fin = datetime('2026-09-20T16:12:00.000Z'), n.puntuacion = 37.5;
MERGE (n:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}) SET n.estado = 'COMPLETADO', n.fecha_inicio = datetime('2026-10-01T10:00:00.000Z'), n.fecha_fin = datetime('2026-10-01T10:14:00.000Z'), n.puntuacion = 92.5;
MERGE (n:Intento {id_intento: 'e0000000-0000-4000-8000-000000000702'}) SET n.estado = 'COMPLETADO', n.fecha_inicio = datetime('2026-10-10T18:00:00.000Z'), n.fecha_fin = datetime('2026-10-10T18:08:00.000Z'), n.puntuacion = 40.0;
MERGE (n:Intento {id_intento: 'e0000000-0000-4000-8000-000000000704'}) SET n.estado = 'EN_CURSO', n.fecha_inicio = datetime('2026-11-11T09:00:00.000Z');

// Respuesta (tipo_retroalimentacion = la de la opción elegida): 5
MERGE (n:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000804'}) SET n.secuencia = 1, n.tipo_retroalimentacion = 'PARCIAL';
MERGE (n:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000805'}) SET n.secuencia = 2, n.tipo_retroalimentacion = 'ERROR';
MERGE (n:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000801'}) SET n.secuencia = 1, n.tipo_retroalimentacion = 'ACIERTO';
MERGE (n:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000802'}) SET n.secuencia = 2, n.tipo_retroalimentacion = 'ACIERTO';
MERGE (n:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000803'}) SET n.secuencia = 1, n.tipo_retroalimentacion = 'ERROR';

// Evidencia: 1
MERGE (n:Evidencia {id_evidencia: 'e0000000-0000-4000-8000-000000001101'}) SET n.titulo = 'Manejo de un cliente molesto';

// DESARROLLA (Simulacion → Habilidad): 4
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000201'}) MERGE (a)-[x:DESARROLLA]->(b) SET x.peso = 0.6, x.nivel_esperado = 70;
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000202'}) MERGE (a)-[x:DESARROLLA]->(b) SET x.peso = 0.4, x.nivel_esperado = 60;
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}), (b:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000203'}) MERGE (a)-[x:DESARROLLA]->(b) SET x.peso = 0.7, x.nivel_esperado = 60;
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}), (b:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000201'}) MERGE (a)-[x:DESARROLLA]->(b) SET x.peso = 0.3, x.nivel_esperado = 50;

// CONTIENE (Simulacion → Paso): 4
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}) MERGE (a)-[:CONTIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}) MERGE (a)-[:CONTIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}) MERGE (a)-[:CONTIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000404'}) MERGE (a)-[:CONTIENE]->(b);

// OFRECE (Paso → Opcion): 9
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000501'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000502'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000503'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000504'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000505'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000506'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000507'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000404'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000508'}) MERGE (a)-[:OFRECE]->(b);
MATCH (a:Paso {id_paso: 'e0000000-0000-4000-8000-000000000404'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000509'}) MERGE (a)-[:OFRECE]->(b);

// CONDUCE_A (Opcion → Paso; las opciones terminales no tienen): 3
MATCH (a:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000501'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}) MERGE (a)-[:CONDUCE_A]->(b);
MATCH (a:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000502'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}) MERGE (a)-[:CONDUCE_A]->(b);
MATCH (a:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000503'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}) MERGE (a)-[:CONDUCE_A]->(b);

// REALIZA (Usuario → Intento): 4
MATCH (a:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000703'}) MERGE (a)-[:REALIZA]->(b);
MATCH (a:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}) MERGE (a)-[:REALIZA]->(b);
MATCH (a:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000702'}) MERGE (a)-[:REALIZA]->(b);
MATCH (a:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000704'}) MERGE (a)-[:REALIZA]->(b);

// TIENE (Simulacion → Intento): 4
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000703'}) MERGE (a)-[:TIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000301'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}) MERGE (a)-[:TIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000702'}) MERGE (a)-[:TIENE]->(b);
MATCH (a:Simulacion {id_simulacion: 'e0000000-0000-4000-8000-000000000302'}), (b:Intento {id_intento: 'e0000000-0000-4000-8000-000000000704'}) MERGE (a)-[:TIENE]->(b);

// REGISTRA (Intento → Respuesta): 5
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000703'}), (b:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000804'}) MERGE (a)-[:REGISTRA]->(b);
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000703'}), (b:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000805'}) MERGE (a)-[:REGISTRA]->(b);
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}), (b:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000801'}) MERGE (a)-[:REGISTRA]->(b);
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}), (b:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000802'}) MERGE (a)-[:REGISTRA]->(b);
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000702'}), (b:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000803'}) MERGE (a)-[:REGISTRA]->(b);

// CORRESPONDE_A (Respuesta → Paso): 5
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000804'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}) MERGE (a)-[:CORRESPONDE_A]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000805'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000403'}) MERGE (a)-[:CORRESPONDE_A]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000801'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000401'}) MERGE (a)-[:CORRESPONDE_A]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000802'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000402'}) MERGE (a)-[:CORRESPONDE_A]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000803'}), (b:Paso {id_paso: 'e0000000-0000-4000-8000-000000000404'}) MERGE (a)-[:CORRESPONDE_A]->(b);

// SELECCIONA (Respuesta → Opcion): 5
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000804'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000502'}) MERGE (a)-[:SELECCIONA]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000805'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000507'}) MERGE (a)-[:SELECCIONA]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000801'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000501'}) MERGE (a)-[:SELECCIONA]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000802'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000504'}) MERGE (a)-[:SELECCIONA]->(b);
MATCH (a:Respuesta {id_respuesta: 'e0000000-0000-4000-8000-000000000803'}), (b:Opcion {id_opcion: 'e0000000-0000-4000-8000-000000000509'}) MERGE (a)-[:SELECCIONA]->(b);

// GENERA (Usuario → Evidencia): 1
MATCH (a:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'}), (b:Evidencia {id_evidencia: 'e0000000-0000-4000-8000-000000001101'}) MERGE (a)-[:GENERA]->(b);

// PRODUCE (Intento → Evidencia): 1
MATCH (a:Intento {id_intento: 'e0000000-0000-4000-8000-000000000701'}), (b:Evidencia {id_evidencia: 'e0000000-0000-4000-8000-000000001101'}) MERGE (a)-[:PRODUCE]->(b);
