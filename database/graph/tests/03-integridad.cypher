// =====================================================================
// QATO'K · tests/03 · Integridad del grafo
// Relaciones obligatorias por entidad y reglas RI del KG que el grafo debe
// reflejar. Cada prueba cuenta las violaciones: ok = (violaciones = 0).
// =====================================================================

// C1 · Cada Paso pertenece a exactamente una Simulacion (CONTIENE)
MATCH (p:Paso) WHERE COUNT { (:Simulacion)-[:CONTIENE]->(p) } <> 1
WITH count(p) AS violaciones, collect(p.id_paso) AS detalle
RETURN 'C1 · Paso con una sola Simulacion' AS prueba, violaciones = 0 AS ok, detalle;

// C2 · Cada Opcion pertenece a exactamente un Paso (OFRECE)
MATCH (o:Opcion) WHERE COUNT { (:Paso)-[:OFRECE]->(o) } <> 1
WITH count(o) AS violaciones, collect(o.id_opcion) AS detalle
RETURN 'C2 · Opcion con un solo Paso' AS prueba, violaciones = 0 AS ok, detalle;

// C3 · Cada Paso ofrece al menos una opción (R05 1..N)
MATCH (p:Paso) WHERE NOT (p)-[:OFRECE]->(:Opcion)
WITH count(p) AS violaciones, collect(p.id_paso) AS detalle
RETURN 'C3 · Paso con opciones' AS prueba, violaciones = 0 AS ok, detalle;

// C4 · CONDUCE_A no cruza simulaciones y cada opción conduce a lo más a un paso
MATCH (o:Opcion)
WHERE COUNT { (o)-[:CONDUCE_A]->() } > 1
   OR EXISTS { MATCH (s1:Simulacion)-[:CONTIENE]->(:Paso)-[:OFRECE]->(o)-[:CONDUCE_A]->(:Paso)<-[:CONTIENE]-(s2:Simulacion)
               WHERE s1 <> s2 }
WITH count(o) AS violaciones, collect(o.id_opcion) AS detalle
RETURN 'C4 · rutas dentro de su simulación' AS prueba, violaciones = 0 AS ok, detalle;

// C5 · Cada simulación tiene exactamente un paso inicial (orden = 1)
MATCH (s:Simulacion) WHERE COUNT { (s)-[:CONTIENE]->(:Paso {orden: 1}) } <> 1
WITH count(s) AS violaciones, collect(s.id_simulacion) AS detalle
RETURN 'C5 · un paso inicial por simulación' AS prueba, violaciones = 0 AS ok, detalle;

// C6 · Cada Intento tiene exactamente un Usuario (REALIZA) y una Simulacion (TIENE)
MATCH (i:Intento)
WHERE COUNT { (:Usuario)-[:REALIZA]->(i) } <> 1 OR COUNT { (:Simulacion)-[:TIENE]->(i) } <> 1
WITH count(i) AS violaciones, collect(i.id_intento) AS detalle
RETURN 'C6 · Intento con un Usuario y una Simulacion' AS prueba, violaciones = 0 AS ok, detalle;

// C7 · Cada Respuesta: un Intento, un Paso y una Opcion
MATCH (r:Respuesta)
WHERE COUNT { (:Intento)-[:REGISTRA]->(r) } <> 1
   OR COUNT { (r)-[:CORRESPONDE_A]->(:Paso) } <> 1
   OR COUNT { (r)-[:SELECCIONA]->(:Opcion) } <> 1
WITH count(r) AS violaciones, collect(r.id_respuesta) AS detalle
RETURN 'C7 · Respuesta con Intento, Paso y Opcion' AS prueba, violaciones = 0 AS ok, detalle;

// C8 · RI-10: la opción elegida es del paso respondido
MATCH (p:Paso)<-[:CORRESPONDE_A]-(r:Respuesta)-[:SELECCIONA]->(o:Opcion)
WHERE NOT (p)-[:OFRECE]->(o)
WITH count(r) AS violaciones, collect(r.id_respuesta) AS detalle
RETURN 'C8 · RI-10 opción del paso respondido' AS prueba, violaciones = 0 AS ok, detalle;

// C9 · El paso respondido es de la simulación del intento
MATCH (s:Simulacion)-[:TIENE]->(:Intento)-[:REGISTRA]->(r:Respuesta)-[:CORRESPONDE_A]->(p:Paso)
WHERE NOT (s)-[:CONTIENE]->(p)
WITH count(r) AS violaciones, collect(r.id_respuesta) AS detalle
RETURN 'C9 · paso de la simulación del intento' AS prueba, violaciones = 0 AS ok, detalle;

// C10 · RI-16: la secuencia es 1..n sin huecos ni repetidos en cada intento
MATCH (i:Intento)-[:REGISTRA]->(r:Respuesta)
WITH i, r.secuencia AS s ORDER BY s
WITH i, collect(s) AS secuencias
WHERE secuencias <> range(1, size(secuencias))
WITH count(i) AS violaciones, collect(i.id_intento) AS detalle
RETURN 'C10 · RI-16 secuencia consecutiva por intento' AS prueba, violaciones = 0 AS ok, detalle;

// C11 · COMPLETADO tiene fecha_fin y puntuación en 0..100; EN_CURSO no tiene ninguna
MATCH (i:Intento)
WHERE (i.estado = 'COMPLETADO' AND (i.fecha_fin IS NULL OR NOT 0 <= i.puntuacion <= 100 OR i.fecha_fin < i.fecha_inicio))
   OR (i.estado = 'EN_CURSO' AND (i.fecha_fin IS NOT NULL OR i.puntuacion IS NOT NULL))
   OR NOT i.estado IN ['EN_CURSO', 'COMPLETADO', 'ABANDONADO']
WITH count(i) AS violaciones, collect(i.id_intento) AS detalle
RETURN 'C11 · estado, fecha_fin y puntuación del intento' AS prueba, violaciones = 0 AS ok, detalle;

// C12 · RI-23: un intento COMPLETADO termina en una opción terminal (sin CONDUCE_A)
MATCH (i:Intento {estado: 'COMPLETADO'})-[:REGISTRA]->(r:Respuesta)
WITH i, r ORDER BY r.secuencia DESC
WITH i, collect(r)[0] AS ultima
MATCH (ultima)-[:SELECCIONA]->(o:Opcion)
WHERE (o)-[:CONDUCE_A]->()
WITH count(i) AS violaciones, collect(i.id_intento) AS detalle
RETURN 'C12 · RI-23 el intento completado termina en opción terminal' AS prueba, violaciones = 0 AS ok, detalle;

// C13 · Evidencia: un autor, un intento COMPLETADO y el autor es quien realizó el intento
MATCH (e:Evidencia)
WHERE COUNT { (:Usuario)-[:GENERA]->(e) } <> 1
   OR COUNT { (:Intento)-[:PRODUCE]->(e) } <> 1
   OR NOT EXISTS { MATCH (u:Usuario)-[:GENERA]->(e)<-[:PRODUCE]-(i:Intento {estado: 'COMPLETADO'})<-[:REALIZA]-(u) }
WITH count(e) AS violaciones, collect(e.id_evidencia) AS detalle
RETURN 'C13 · evidencia de un intento completado propio' AS prueba, violaciones = 0 AS ok, detalle;

// C14 · RI-20: DEMUESTRA = DESARROLLA de la simulación del intento (en los dos sentidos)
MATCH (e:Evidencia)<-[:PRODUCE]-(:Intento)<-[:TIENE]-(s:Simulacion)
WITH e,
     [(s)-[:DESARROLLA]->(h) | h.id_habilidad] AS desarrolla,
     [(e)-[:DEMUESTRA]->(h) | h.id_habilidad] AS demuestra
WHERE size(desarrolla) <> size(demuestra) OR any(h IN desarrolla WHERE NOT h IN demuestra)
WITH count(e) AS violaciones, collect(e.id_evidencia) AS detalle
RETURN 'C14 · RI-20 DEMUESTRA igual a DESARROLLA' AS prueba, violaciones = 0 AS ok, detalle;

// C15 · Progreso coherente con sus relaciones y uno por (usuario, habilidad)
MATCH (p:Progreso)
WHERE COUNT { (:Usuario)-[:TIENE_PROGRESO]->(p) } <> 1
   OR COUNT { (p)-[:CORRESPONDE_A]->(:Habilidad) } <> 1
   OR NOT EXISTS { MATCH (u:Usuario {id_usuario: p.id_usuario})-[:TIENE_PROGRESO]->(p)-[:CORRESPONDE_A]->(:Habilidad {id_habilidad: p.id_habilidad}) }
   OR NOT 0 <= p.nivel_actual <= 100
WITH count(p) AS violaciones, collect(p.id_progreso) AS detalle
RETURN 'C15 · Progreso enlazado a su usuario y habilidad' AS prueba, violaciones = 0 AS ok, detalle;

// C16 · Progreso = fórmula DEC-25 recalculada desde cero (y no falta ni sobra ninguno)
MATCH (u:Usuario)-[:REALIZA]->(i:Intento {estado: 'COMPLETADO'})<-[:TIENE]-(s:Simulacion)
WITH u, s, i ORDER BY i.fecha_fin DESC
WITH u, s, collect(i)[0] AS ultimo
MATCH (s)-[d:DESARROLLA]->(h:Habilidad)
WITH u, h, round(sum(d.peso * ultimo.puntuacion) / sum(d.peso), 2) AS esperado
OPTIONAL MATCH (u)-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h)
WITH collect({ok: p IS NOT NULL AND p.nivel_actual = esperado, h: h.nombre, esperado: esperado, real: p.nivel_actual}) AS filas
MATCH (todos:Progreso)
WITH filas, count(todos) AS total
RETURN 'C16 · Progreso según DEC-25' AS prueba,
       all(f IN filas WHERE f.ok) AND total = size(filas) AS ok,
       reduce(s = '', f IN filas | s + f.h + '=' + f.real + ' ') AS detalle;

// C17 · Catálogos y rangos copiados
WITH COUNT { MATCH (r:Respuesta) WHERE NOT r.tipo_retroalimentacion IN ['ACIERTO', 'PARCIAL', 'ERROR'] }
     + COUNT { MATCH ()-[d:DESARROLLA]->() WHERE NOT (0 < d.peso <= 1) OR NOT (0 <= d.nivel_esperado <= 100) }
     + COUNT { MATCH (s:Simulacion) WHERE NOT s.estado IN ['PUBLICADA', 'INACTIVA'] } AS violaciones
RETURN 'C17 · catálogos (retroalimentación, estado) y rangos de DESARROLLA' AS prueba,
       violaciones = 0 AS ok, violaciones AS detalle;
