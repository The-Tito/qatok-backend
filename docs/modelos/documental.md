# Modelo lógico documental de QATO’K

**Entregable E2 · Backend #19 y #20.** MongoDB conserva el contenido de cada escenario, sus revisiones inmutables y las instantáneas de evidencias. PostgreSQL autoriza el acceso, registra los intentos y decide qué revisión está publicada. Neo4j proyecta las relaciones que usa para el recorrido y las recomendaciones. [Modelo relacional](relacional.md) · [Modelo de grafo](grafo.md)

## 1. Colecciones y cardinalidades

| Colección | Identidad y cardinalidad | Uso principal |
|---|---|---|
| `contenidos_simulacion` | `_id = id_simulacion`. Una simulación tiene cero o un borrador, con una versión entera. | Editar un escenario mediante reemplazo condicionado a la versión vista por quien edita. |
| `revisiones_simulacion` | `_id = id_revision_publicada`. Cada revisión pertenece a una simulación y a una versión de borrador. Solo una revisión puede quedar publicada en PostgreSQL por simulación en v0. Puede haber candidatas sin publicar. | Jugar, reconstruir el grafo y consultar intentos con el mismo contenido publicado. |
| `evidencias` | `_id = id_evidencia` de PostgreSQL. Una instantánea por evidencia registrada. | Mostrar el recorrido en un documento autocontenido después de comprobar el acceso. |

Cada escenario contiene pasos, cada paso contiene opciones y cada opción contiene consecuencias y retroalimentación. Una transición apunta a otro paso del mismo escenario o termina el recorrido. Al embeber el contexto, se puede guardar y validar el escenario como una unidad, aunque distintos pasos tengan formas distintas. La API entrega al estudiante solo el paso que necesita.

## 2. Identificadores y responsabilidades

Los IDs son UUID v4 en minúsculas compartidos con PostgreSQL y Neo4j. MongoDB los almacena como strings. Los IDs de paso y opción referenciados por las respuestas de PostgreSQL se comprueban en la API dentro de la revisión publicada. La reconciliación debe verificar la cadena de referencias completa: intento → simulación → revisión → paso → opción.

PostgreSQL conserva el dueño y el estado de un intento, la puntuación y los permisos de evidencia. En MongoDB, la instantánea de evidencia tiene la puntuación histórica para mostrarla junto con el recorrido. Neo4j recibe los IDs y propiedades que necesita por el evento de publicación y los eventos del juego.

## 3. Esquemas ejecutables

Los [validadores MongoDB](../../database/document/validators/esquemas.mjs) son la referencia exacta de campos, longitudes y catálogos. Usan validación estricta y rechazan campos adicionales. El [cargador](../../database/document/ejecutar.mjs) instala esquemas e índices y lee el dataset compartido. Las fechas documentales se almacenan como fechas BSON.

## 4. Colección contenidos_simulacion

Un borrador contiene `_id`, `version` y `pasos[]`. Puede empezar vacío y admitir transiciones sin destino definido todavía. En cada guardado se comprueba que los IDs de pasos y opciones y los órdenes de pasos sean únicos dentro del documento.

### 4.1 Estructura anidada

| Componente | Campos y límites |
|---|---|
| Paso | `id_paso`, `orden` entero positivo, `tipo`, `titulo`, `descripcion`, `contexto`, `opciones[]`. Hasta 30 pasos por escenario y 6 opciones por paso. |
| Opción | `id_opcion`, `descripcion`, `valoracion` entre 0 y 100, `id_paso_siguiente` (UUID o nulo), `consecuencias[]` (hasta 3) y `retroalimentacion`. |
| Consecuencia | `descripcion`, `impacto`, `tipo`. `id_consecuencia` es opcional por compatibilidad con el dataset. |
| Retroalimentación | `tipo` (ACIERTO, PARCIAL o ERROR), `comentario` y `recomendacion`. |

### 4.2 Contexto según el tipo de paso

| Tipo | Campos de `contexto` |
|---|---|
| CORREO | `remitente`, `asunto`, `cuerpo` |
| REUNION | `participantes[]`, `agenda[]` |
| CONVERSACION | `interlocutor`, `lineas[]` con `quien` y `texto` |
| TAREA | `entregables[]`, `plazo_horas` |
| INCIDENTE | `cronologia[]` con `momento` y `hecho`, `severidad` |

Un correo con campos de reunión se rechaza. La flexibilidad queda acotada por los tipos de paso que permite el escenario.

### 4.3 Revisiones y publicación

Cada revisión guarda `_id`, `id_simulacion`, `version`, `creado_en` y una copia de `pasos[]`. El validador exige al menos un paso, una opción por paso y una consecuencia por opción. El repositorio comprueba que exista `orden = 1`, que todos los pasos sean alcanzables, que las rutas no formen ciclos y que los destinos pertenezcan al escenario. Así, todas las rutas llegan a una opción terminal. PostgreSQL y la API comprueban la asociación con al menos una habilidad antes de publicar.

El dataset usa un ID fijo de revisión por simulación publicada. El cargador de MongoDB usa ese ID como `_id` y toma los pasos del contenido correspondiente. La lectura de un paso comprueba tanto el ID de revisión como el de simulación. La vista del jugador incluye contexto y descripción de las opciones. Las valoraciones, destinos, consecuencias y retroalimentación quedan para la respuesta confirmada.

## 5. Colección evidencias

Una evidencia conserva `_id`, `descripcion`, `simulacion` (ID y título al generar), `puntuacion`, hasta 20 `habilidades[]`, hasta 100 `decisiones[]` y `creado_en`. Cada decisión guarda su secuencia, tipo y título del paso, texto de la opción, consecuencias y tipo de retroalimentación. El documento se inserta una vez y se consulta completo.

PostgreSQL autoriza la lectura privada o por enlace. El título editable y la visibilidad viven en el registro relacional. La API puede eliminar una instantánea al borrar la evidencia. Una escritura documental que no tenga registro relacional se revisa durante la reconciliación.

## 6. Operaciones representativas

| Operación | Acceso documental |
|---|---|
| Consultar un borrador | `findOne` por `_id`. |
| Editar borrador | `replaceOne` con `_id` y la versión que vio quien edita. Si coincide, guarda la versión siguiente. |
| Preparar una revisión | Inserción de la copia inmutable. Un reintento de la misma simulación y versión reutiliza la copia existente solo si su contenido coincide. |
| Consultar el paso inicial o por ID | Filtro por revisión, simulación y paso. Proyección del primer paso coincidente. |
| Guardar, consultar o eliminar evidencia | Operaciones por ID sobre una instantánea autocontenida. |

## 7. Validación, índices y concurrencia

### 7.1 Integridad dentro y entre documentos

MongoDB valida la forma y los límites. El repositorio comprueba las reglas que relacionan partes del escenario, como unicidad dentro del documento y alcanzabilidad. La API valida identidad y propiedad del intento en PostgreSQL. La identidad del paso se resuelve dentro de la revisión usada por ese intento.

### 7.2 Índices

| Colección | Índice | Garantía o consulta |
|---|---|---|
| Las tres | `_id` | Identidad y lectura directa. |
| `revisiones_simulacion` | Único `(id_simulacion, version)` | Un reintento puede localizar una única copia candidata. |
| `revisiones_simulacion` | Únicos sobre `pasos.id_paso` y `pasos.opciones.id_opcion` | Impiden IDs compartidos entre revisiones incluso en inserciones concurrentes. Neo4j necesita esa unicidad para los nodos del grafo. |
| `revisiones_simulacion`, `evidencias` | `creado_en` | Acota las consultas de reconciliación por antigüedad. |

Los índices únicos de arreglos se aplican en revisiones completas. Los borradores pueden estar vacíos y no reservan IDs globales. Una revisión candidata conserva sus IDs hasta que se confirme la publicación o se limpie. Si una candidata abandonada comparte IDs con una versión posterior, la operación se resuelve al reconciliar esa candidata. Una comparación previa de IDs no reemplaza estos índices ante escrituras concurrentes.

### 7.3 Tamaño de documentos

Los límites de pasos, opciones, consecuencias y texto acotan el documento. La API debe hacer concordar el límite de cuerpo de la ruta administrativa con el tamaño que acepte para un escenario. La consulta de juego proyecta un paso y la evidencia se recupera completa.

### 7.4 Concurrencia entre editar y publicar

El reemplazo del borrador usa la versión recibida. Cuando dos ediciones llegan con la misma versión, solo una puede guardar. La API bloquea en PostgreSQL la fila de la simulación para editar y publicar. Al publicar valida la versión solicitada y guarda una copia inmutable. Con la fila aún bloqueada, fija la referencia, el estado PUBLICADA y el evento en la misma transacción. La lectura del contenido publicado usa la revisión fijada en PostgreSQL. Por eso un cambio tardío en el borrador no cambia el contenido publicado.

Si el resultado de insertar en MongoDB es incierto, el repositorio intenta recuperar la candidata por simulación y versión y comprueba que coincida con el contenido solicitado. Si no puede confirmarla, PostgreSQL revierte. Una simulación aún en BORRADOR puede retirar candidatas de otras versiones bajo el mismo bloqueo antes de volver a publicar. La limpieza general de huérfanos sigue en el paso de reconciliación. [Contrato de administración](../api/contrato-v0.md#f1-administración-de-simulaciones) · [Diseño relacional de publicación](relacional.md#diseño-de-publicación-y-sincronización)

## 8. Pruebas y ejecución

`npm run db:document:reset` reconstruye las tres colecciones de desarrollo desde el dataset. El [conjunto de integración documental](../../tests/integration/documental.test.ts) usa una base temporal. Comprueba la carga, aislamiento de la revisión, concurrencia de edición, duplicados entre revisiones, rutas inválidas, contextos por tipo y evidencias.
