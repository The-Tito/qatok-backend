// =====================================================================
// QATO'K · tests/02 · Datos cargados (proyección de la matriz §3)
// Valores esperados: database/seed/dataset.json sin la simulación en BORRADOR.
// =====================================================================

// B1 · Nodos por etiqueta (9 etiquetas)
MATCH (n)
UNWIND labels(n) AS etiqueta
WITH etiqueta, count(*) AS n ORDER BY etiqueta
WITH collect(etiqueta + ':' + n) AS obtenido
WITH obtenido, ['Evidencia:1', 'Habilidad:3', 'Intento:4', 'Opcion:9', 'Paso:4', 'Progreso:3',
                'Respuesta:5', 'Simulacion:2', 'Usuario:3'] AS esperado
RETURN 'B1 · nodos por etiqueta' AS prueba, obtenido = esperado AS ok,
       reduce(s = '', x IN obtenido | s + x + ' ') AS detalle;

// B2 · Relaciones por patrón (13 tipos, 14 patrones)
MATCH (a)-[r]->(b)
WITH labels(a)[0] + '-' + type(r) + '->' + labels(b)[0] AS patron, count(*) AS n ORDER BY patron
WITH collect(patron + ':' + n) AS obtenido
WITH obtenido, ['Evidencia-DEMUESTRA->Habilidad:2', 'Intento-PRODUCE->Evidencia:1',
                'Intento-REGISTRA->Respuesta:5', 'Opcion-CONDUCE_A->Paso:3', 'Paso-OFRECE->Opcion:9',
                'Progreso-CORRESPONDE_A->Habilidad:3', 'Respuesta-CORRESPONDE_A->Paso:5',
                'Respuesta-SELECCIONA->Opcion:5', 'Simulacion-CONTIENE->Paso:4',
                'Simulacion-DESARROLLA->Habilidad:4', 'Simulacion-TIENE->Intento:4',
                'Usuario-GENERA->Evidencia:1', 'Usuario-REALIZA->Intento:4',
                'Usuario-TIENE_PROGRESO->Progreso:3'] AS esperado
RETURN 'B2 · relaciones por patrón' AS prueba, obtenido = esperado AS ok,
       size(obtenido) + ' patrones' AS detalle;

// B3 · Las etiquetas retiradas no tienen nodos
MATCH (n) WHERE n:Consecuencia OR n:Retroalimentacion OR n:Comparticion
WITH count(n) AS violaciones, count(n) AS detalle
RETURN 'B3 · sin Consecuencia, Retroalimentacion ni Comparticion' AS prueba, violaciones = 0 AS ok, detalle;

// B4 · Cada nodo lleva solo su id y lo que filtran C-01..C-05 (sin correo ni textos)
WITH {Usuario: ['id_usuario'],
      Simulacion: ['id_simulacion', 'titulo', 'estado'],
      Habilidad: ['id_habilidad', 'nombre', 'nivel_objetivo'],
      Paso: ['id_paso', 'orden'],
      Opcion: ['id_opcion'],
      Intento: ['id_intento', 'estado', 'fecha_inicio', 'fecha_fin', 'puntuacion'],
      Respuesta: ['id_respuesta', 'secuencia', 'tipo_retroalimentacion'],
      Progreso: ['id_progreso', 'id_usuario', 'id_habilidad', 'nivel_actual', 'fecha_actualizacion'],
      Evidencia: ['id_evidencia', 'titulo']} AS permitidas
MATCH (n)
WITH n, permitidas[labels(n)[0]] AS p
WHERE p IS NULL OR any(k IN keys(n) WHERE NOT k IN p)
WITH count(n) AS violaciones, collect([labels(n)[0]] + keys(n)) AS detalle
RETURN 'B4 · propiedades de nodo según la matriz §3' AS prueba, violaciones = 0 AS ok, detalle;

// B5 · Solo DESARROLLA tiene propiedades (peso, nivel_esperado)
MATCH ()-[r]->()
WITH r, CASE type(r) WHEN 'DESARROLLA' THEN ['nivel_esperado', 'peso'] ELSE [] END AS p
WHERE any(k IN keys(r) WHERE NOT k IN p) OR (type(r) = 'DESARROLLA' AND size(keys(r)) <> 2)
WITH count(r) AS violaciones, collect(type(r)) AS detalle
RETURN 'B5 · propiedades de relación según la matriz §3' AS prueba, violaciones = 0 AS ok, detalle;

// B6 · La simulación en BORRADOR (0303) no se proyecta
OPTIONAL MATCH (s:Simulacion)
WHERE s.estado = 'BORRADOR' OR s.id_simulacion = 'e0000000-0000-4000-8000-000000000303'
WITH count(s) AS violaciones, count(s) AS detalle
RETURN 'B6 · sin simulaciones en BORRADOR' AS prueba, violaciones = 0 AS ok, detalle;

// B7 · Tipos de dato
MATCH (i:Intento {estado: 'COMPLETADO'})-[:REGISTRA]->(r:Respuesta)-[:CORRESPONDE_A]->(p:Paso)
MATCH (:Simulacion)-[d:DESARROLLA]->(:Habilidad)
MATCH (pr:Progreso)
WITH collect(DISTINCT valueType(i.fecha_inicio)) + collect(DISTINCT valueType(i.fecha_fin))
       + collect(DISTINCT valueType(pr.fecha_actualizacion)) AS fechas,
     collect(DISTINCT valueType(i.puntuacion)) + collect(DISTINCT valueType(d.peso))
       + collect(DISTINCT valueType(pr.nivel_actual)) AS decimales,
     collect(DISTINCT valueType(r.secuencia)) + collect(DISTINCT valueType(p.orden))
       + collect(DISTINCT valueType(d.nivel_esperado)) AS enteros
RETURN 'B7 · fechas DATETIME, puntuación/peso/nivel FLOAT, secuencia/orden/nivel_esperado INTEGER' AS prueba,
       all(t IN fechas WHERE t = 'ZONED DATETIME NOT NULL')
         AND all(t IN decimales WHERE t = 'FLOAT NOT NULL')
         AND all(t IN enteros WHERE t = 'INTEGER NOT NULL') AS ok,
       fechas + decimales + enteros AS detalle;

// B8 · Las propiedades opcionales sin valor no se guardan
MATCH (h:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000203'})
MATCH (i:Intento {id_intento: 'e0000000-0000-4000-8000-000000000704'})
RETURN 'B8 · sin nivel_objetivo nulo ni fecha_fin/puntuación del intento EN_CURSO' AS prueba,
       NOT 'nivel_objetivo' IN keys(h) AND NOT 'fecha_fin' IN keys(i) AND NOT 'puntuacion' IN keys(i) AS ok,
       keys(h) + keys(i) AS detalle;
