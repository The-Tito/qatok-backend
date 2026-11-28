# E2. Diccionario de datos y reglas del dominio

El diccionario vincula las entidades del [modelo conceptual](conceptual.md) con el dato que usa la aplicación en cada motor. Los nombres corresponden al dominio y a la persistencia. El [contrato HTTP](../api/contrato-v0.md) define los nombres y formatos que recibe la interfaz.

## Identificadores y tipos

- Los identificadores que se comparten entre motores usan UUID. PostgreSQL los almacena como `UUID`, MongoDB y Neo4j como cadenas. En Neo4j, `id_progreso` se genera al crear el progreso y se conserva dentro de la proyección.
- Las fechas de PostgreSQL son `TIMESTAMPTZ`, las documentales son BSON Date y las del grafo son `DateTime`. La API usa ISO 8601 en UTC.
- Las puntuaciones, valoraciones, metas y niveles usan una escala de 0 a 100. PostgreSQL almacena `puntuacion`, `nivel_objetivo` y `nivel_esperado` como `NUMERIC(5,2)`. En las operaciones actuales, la API y los eventos usan enteros para las metas y niveles esperados. Neo4j guarda esos dos campos como enteros y las puntuaciones y niveles de progreso como flotantes.
- `peso` pertenece a la asociación entre simulación y habilidad. PostgreSQL lo guarda como `NUMERIC(3,2)`, con valores mayores que 0 y hasta 1. Los pesos se aplican por asociación y pueden sumar más o menos de 1 en una simulación.

## Entidades y campos

| Entidad | Campos y significado | Persistencia y condiciones |
|---|---|---|
| **E01 Usuario** | `id_usuario` identifica la cuenta. `nombre`, `correo`, `contrasena_hash`, `rol`, `estado` y `fecha_registro` permiten autenticación y administración. | PostgreSQL. Correo único sin distinguir mayúsculas. Roles `ESTUDIANTE` y `ADMIN`. Estados `ACTIVO`, `INACTIVO`, `SUSPENDIDO`. Neo4j recibe el UUID como ancla de consultas. |
| **E02 Simulacion** | `id_simulacion`, `titulo`, `descripcion`, `dificultad`, `estado` y `duracion_estimada` en minutos. `id_revision_publicada` identifica el contenido utilizado al jugar. | PostgreSQL. Dificultad `BASICA`, `INTERMEDIA` o `AVANZADA`. Estado `BORRADOR`, `PUBLICADA` o `INACTIVA`. La duración es opcional y positiva. La referencia a MongoDB es nula en borrador y obligatoria en los otros dos estados. |
| **E03 Habilidad** | `id_habilidad`, `nombre`, `descripcion`, `categoria`, `nivel_objetivo` y `tipo_visual`. | PostgreSQL. Nombre único. Meta opcional. `tipo_visual` es opcional, solo afecta la presentación y su valor nulo equivale a `STONE`. [DEC-29](../decisiones-modelado.md#dec-29--tipo-visual-de-la-habilidad) |
| **E04 Paso** | `id_paso`, `orden`, `titulo`, `descripcion`, `tipo`, `contexto` y `opciones[]`. La pertenencia a la simulación se expresa por el documento que lo contiene. | MongoDB. `orden` es entero positivo y único por escenario. El tipo determina los campos del contexto. Neo4j proyecta UUID y orden de pasos publicados. |
| **E05 Opcion** | `id_opcion`, `descripcion`, `valoracion`, `id_paso_siguiente`, `consecuencias[]` y `retroalimentacion`. | MongoDB, dentro del paso. `id_paso_siguiente` es UUID o nulo. En una revisión publicada, nulo identifica una opción terminal. Neo4j proyecta el UUID y las relaciones de pertenencia y transición. |
| **E06 Consecuencia** | `descripcion`, `impacto`, `tipo` e `id_consecuencia` cuando existe. | MongoDB, dentro de la opción. Identificador opcional en el validador vigente. Impacto `POSITIVO`, `NEUTRO` o `NEGATIVO`. Tipo `RELACIONAL`, `TIEMPO`, `CALIDAD` o `REPUTACION`. |
| **E07 Intento** | `id_intento`, `id_usuario`, `id_simulacion`, `fecha_inicio`, `fecha_fin`, `estado` y `puntuacion`. | PostgreSQL. Un intento `EN_CURSO` carece de fecha de fin y puntuación. `COMPLETADO` y `ABANDONADO` requieren fecha de fin. La puntuación es obligatoria al completar y nula en los otros estados. |
| **E08 Respuesta** | `id_respuesta`, `id_intento`, `id_paso`, `id_opcion`, `fecha_respuesta` y `secuencia`. | PostgreSQL. Secuencia positiva y única por intento. La API valida los UUID de paso y opción contra la revisión de MongoDB. Neo4j proyecta las relaciones de la respuesta y el tipo de retroalimentación. |
| **E09 Retroalimentacion** | `tipo`, `comentario` y `recomendacion` explican la elección. | MongoDB, como objeto requerido de la opción. El modelo conceptual la vincula con la respuesta. La implementación obtiene el objeto de la opción elegida, y el grafo conserva `Respuesta.tipo_retroalimentacion`. Tipo `ACIERTO`, `PARCIAL` o `ERROR`. |
| **E10 Progreso** | `id_progreso`, `id_usuario`, `id_habilidad`, `nivel_actual` y `fecha_actualizacion`. | Neo4j. Un registro derivado por par usuario–habilidad. La fórmula en uso pondera el intento completado más reciente de cada simulación y conserva la fecha más reciente que intervino. Es una propuesta ligada a P-03. [DEC-25](../decisiones-modelado.md#dec-25--fórmula-de-progresonivel_actual-proyecto-final-2026-11-19) |
| **E11 Evidencia** | `id_evidencia`, `id_usuario`, `id_intento`, `titulo`, `fecha_generacion` y `visibilidad`. La instantánea aporta descripción, simulación, habilidades y recorrido. | PostgreSQL guarda metadatos y titularidad. La visibilidad empieza en `PRIVADA`. MongoDB conserva la instantánea con el mismo UUID. Neo4j proyecta `DEMUESTRA`. |
| **E12 Comparticion** | `id_comparticion`, `id_evidencia`, `token`, `fecha_creacion`, `fecha_expiracion`, `estado` y `destinatario`. | PostgreSQL. Token único, estado `ACTIVA` o `REVOCADA` y destinatario opcional como etiqueta privada. Los enlaces nuevos tienen vencimiento. El esquema también admite registros históricos sin vencimiento. |

## Registros de implementación

| Registro | Identidad y campos relevantes | Función |
|---|---|---|
| `simulacion_habilidad` | PK compuesta `id_simulacion`, `id_habilidad`. Atributos `peso` y `nivel_esperado`. | Materializa R04 en PostgreSQL. Neo4j copia ambos valores en `DESARROLLA`. |
| Borrador y revisión en MongoDB | Borrador: `_id = id_simulacion`, `version`, `pasos[]`. Revisión: `_id` propio, `id_simulacion`, `version`, `creado_en`, `pasos[]`. | El borrador admite cambios condicionados a su versión. La revisión referenciada por PostgreSQL conserva el contenido publicado. |
| Instantánea de evidencia | `_id = id_evidencia`, `descripcion`, `simulacion`, `puntuacion`, `habilidades[]`, `decisiones[]`, `creado_en`. | Guarda los textos, las consecuencias y el tipo de retroalimentación del recorrido al generar la evidencia. |
| `evento_sincronizacion` | `id_evento`, `orden_cola`, `tipo`, `id_entidad`, `payload`, `estado`, `intentos` y campos de fechas y error. | PostgreSQL confirma estos eventos con los cambios de negocio. El consumidor los aplica en orden a Neo4j. Estados `PENDIENTE`, `APLICADO` y `FALLIDO`. |

## Reglas del dominio y puntos de verificación

| Regla del KG | Aplicación en el proyecto |
|---|---|
| **RI-01 · Identidad** | Las entidades con identidad persistida usan UUID. Los objetos embebidos siguen su validador específico. La consecuencia puede omitir su UUID y la retroalimentación se identifica por su opción. |
| **RI-02 · Correo único** | El índice único sobre `lower(correo)` protege la cuenta con independencia de mayúsculas. |
| **RI-03 · Nombre de habilidad único** | La restricción `UNIQUE` de PostgreSQL protege el nombre de la habilidad. |
| **RI-04 · Campos esenciales** | PostgreSQL impone `NOT NULL` en los registros y MongoDB exige los campos de cada documento según su forma. Los opcionales están indicados en cada modelo lógico. |
| **RI-05 · Dificultad y estado de simulación** | PostgreSQL comprueba ambos catálogos con `CHECK`. |
| **RI-06 · Estado y puntuación del intento** | PostgreSQL limita los estados y exige puntuación de 0 a 100 en un intento completado. |
| **RI-07 · Rango de progreso** | El cálculo del grafo usa puntuaciones de 0 a 100 con pesos positivos. Las pruebas de integridad verifican el rango y el valor derivado. |
| **RI-08 · Asociación simulación–habilidad** | PostgreSQL impide duplicar un par mediante su clave primaria compuesta. |
| **RI-09 · Pertenencia del intento** | Las claves foráneas de `intento` exigen usuario y simulación existentes. |
| **RI-10 · Correspondencia de la respuesta** | La API valida que el paso sea el vigente en la revisión del intento y que la opción pertenezca a ese paso. |
| **RI-11 · Destino dentro de la simulación** | La validación de publicación comprueba que una transición permanezca en la misma revisión. |
| **RI-12 · Fechas del intento** | PostgreSQL obliga a que el fin de un intento cerrado sea igual o posterior al inicio. |
| **RI-13 · Progreso consolidado** | Neo4j protege la pareja usuario–habilidad y actualiza el mismo registro al recalcular. |
| **RI-14 · Titularidad de evidencia** | La clave foránea compuesta de `evidencia` exige que el intento pertenezca al mismo usuario. |
| **RI-15 · Acceso compartido** | PostgreSQL garantiza un token único. La API comprueba que el enlace autoriza la consulta antes de leer la instantánea. |
| **RI-16 · Secuencia** | PostgreSQL verifica secuencia positiva y única por intento. La API asigna la siguiente posición con el intento bloqueado. |
| **RI-17 · Contenido publicable** | La API exige una habilidad, un paso, una opción por paso y una consecuencia por opción. El validador de revisión exige contenido mínimo. |
| **RI-18 · Orden de pasos** | La API comprueba orden positivo y único. La publicación exige `orden = 1` como inicio y que todos los pasos sean alcanzables. |
| **RI-19 · Inicio en simulación publicada** | La API comprueba el estado de la simulación antes de iniciar la partida. |
| **RI-20 · Habilidades demostradas** | `DEMUESTRA` se deriva de las asociaciones de la simulación del intento. |
| **RI-21 · Vencimiento** | PostgreSQL comprueba que el fin de vigencia, cuando existe, sea posterior a la creación. |
| **RI-22 · Momento y estado de la respuesta** | La API registra respuestas solo en intentos activos, con la fila bloqueada y dentro de sus límites temporales. |
| **RI-23 · Opción terminal** | Una opción con destino nulo termina la ruta. La respuesta y el cierre se confirman juntos en PostgreSQL. |
| **RI-24 · Catálogos y rangos** | Los esquemas y validadores restringen catálogos, peso, metas, niveles y duración. Las fórmulas de puntuación y progreso mantienen el estado de propuesta de P-03. |
| **RI-25 · Evidencia de intento completado** | La API exige un intento propio y completado. PostgreSQL admite como máximo una evidencia por intento. |

Los detalles de tipos, claves e índices están en los [modelos relacional](relacional.md), [documental](documental.md) y [de grafo](grafo.md). Las definiciones ejecutables están en el [esquema SQL](../../database/relational/schema/01-esquema.sql), los [validadores MongoDB](../../database/document/validators/esquemas.mjs) y las [restricciones Cypher](../../database/graph/schema/01-restricciones.cypher). [Matriz de propiedad](matriz-propiedad.md)
