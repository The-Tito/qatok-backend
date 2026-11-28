// =====================================================================
// QATO'K · tests/01 · Esquema
// Convención de database/graph/tests: cada sentencia devuelve filas con
// `prueba`, `ok` (booleano) y `detalle`; toda fila con ok = false es un fallo.
// Una sentencia cuyo comentario empieza por ESPERA_ERROR debe fallar.
// =====================================================================

// A1 · Las 11 restricciones de unicidad existen (SHOW no admite WITH: se agrega en RETURN)
SHOW CONSTRAINTS YIELD name, type
RETURN 'A1 · 11 restricciones de unicidad (9 ids, Habilidad.nombre, clave de Progreso)' AS prueba,
       count(*) = 11
         AND sum(CASE WHEN type = 'UNIQUENESS' AND name IN
               ['usuario_id', 'simulacion_id', 'habilidad_id', 'paso_id', 'opcion_id', 'intento_id',
                'respuesta_id', 'progreso_id', 'evidencia_id', 'habilidad_nombre',
                'progreso_usuario_habilidad'] THEN 1 ELSE 0 END) = 11 AS ok,
       count(*) + ' restricciones' AS detalle;

// A2 · Los 4 índices de las consultas existen y todos los índices están en línea
SHOW INDEXES YIELD name, type, state WHERE type <> 'LOOKUP'
RETURN 'A2 · índices de C-01..C-05 en línea' AS prueba,
       sum(CASE WHEN name IN ['simulacion_estado', 'intento_estado', 'paso_orden', 'respuesta_secuencia']
                THEN 1 ELSE 0 END) = 4
         AND sum(CASE WHEN state <> 'ONLINE' THEN 1 ELSE 0 END) = 0 AS ok,
       count(*) + ' índices' AS detalle;

// A3 · Sin restricciones de las etiquetas retiradas ni de Usuario.correo
SHOW CONSTRAINTS YIELD labelsOrTypes, properties
RETURN 'A3 · sin restricciones de Consecuencia, Retroalimentacion, Comparticion ni correo' AS prueba,
       sum(CASE WHEN labelsOrTypes[0] IN ['Consecuencia', 'Retroalimentacion', 'Comparticion']
                  OR 'correo' IN properties THEN 1 ELSE 0 END) = 0 AS ok,
       '' AS detalle;

// ESPERA_ERROR A4 · un id_usuario duplicado se rechaza (RI-01)
CREATE (:Usuario {id_usuario: 'e0000000-0000-4000-8000-000000000101'});

// ESPERA_ERROR A5 · un nombre de habilidad duplicado se rechaza (RI-03)
CREATE (:Habilidad {id_habilidad: 'e0000000-0000-4000-8000-000000000299', nombre: 'Gestión del tiempo'});

// ESPERA_ERROR A6 · un segundo Progreso del mismo usuario y habilidad se rechaza
CREATE (:Progreso {id_progreso: 'e0000000-0000-4000-8000-000000001099',
                   id_usuario: 'e0000000-0000-4000-8000-000000000101',
                   id_habilidad: 'e0000000-0000-4000-8000-000000000201'});
