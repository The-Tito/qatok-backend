// =====================================================================
// QATO'K · schema/01 · Restricciones de unicidad (Neo4j Community)
// Fuente: docs/modelos/matriz-propiedad.md §3 (proyección v2: 9 etiquetas)
// y RI-01, RI-03 del KG. Cada restricción crea además su índice de respaldo.
// Neo4j es una proyección: los nodos copiados solo llevan su id y lo que
// filtran C-01..C-05. Las reglas de existencia, tipo y rango las garantizan
// PostgreSQL (dueño) y la aplicación; las pruebas de tests/ lo comprueban.
// =====================================================================

// RI-01 · Identificador UUID único en las 9 etiquetas del grafo
CREATE CONSTRAINT usuario_id IF NOT EXISTS FOR (n:Usuario) REQUIRE n.id_usuario IS UNIQUE;
CREATE CONSTRAINT simulacion_id IF NOT EXISTS FOR (n:Simulacion) REQUIRE n.id_simulacion IS UNIQUE;
CREATE CONSTRAINT habilidad_id IF NOT EXISTS FOR (n:Habilidad) REQUIRE n.id_habilidad IS UNIQUE;
CREATE CONSTRAINT paso_id IF NOT EXISTS FOR (n:Paso) REQUIRE n.id_paso IS UNIQUE;
CREATE CONSTRAINT opcion_id IF NOT EXISTS FOR (n:Opcion) REQUIRE n.id_opcion IS UNIQUE;
CREATE CONSTRAINT intento_id IF NOT EXISTS FOR (n:Intento) REQUIRE n.id_intento IS UNIQUE;
CREATE CONSTRAINT respuesta_id IF NOT EXISTS FOR (n:Respuesta) REQUIRE n.id_respuesta IS UNIQUE;
CREATE CONSTRAINT progreso_id IF NOT EXISTS FOR (n:Progreso) REQUIRE n.id_progreso IS UNIQUE;
CREATE CONSTRAINT evidencia_id IF NOT EXISTS FOR (n:Evidencia) REQUIRE n.id_evidencia IS UNIQUE;

// RI-03 · Nombre de habilidad único (C-04 y C-05 filtran por nombre)
CREATE CONSTRAINT habilidad_nombre IF NOT EXISTS FOR (n:Habilidad) REQUIRE n.nombre IS UNIQUE;

// Progreso es derivado: uno por par (usuario, habilidad). La clave compuesta
// permite recalcularlo con MERGE sin duplicarlo (matriz §5, paso 4).
CREATE CONSTRAINT progreso_usuario_habilidad IF NOT EXISTS FOR (n:Progreso) REQUIRE (n.id_usuario, n.id_habilidad) IS UNIQUE;

// Salen respecto al modelo anterior (matriz §3): Consecuencia, Retroalimentacion
// y Comparticion (con sus restricciones de id y Comparticion.token) y
// Usuario.correo (el correo no se copia al grafo, RF-09).
