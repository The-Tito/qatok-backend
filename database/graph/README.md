# Neo4j — proyección del grafo de QATO'K (dueño: A)

Neo4j es una **proyección para recorridos** (C-01..C-05). Cada nodo copiado lleva solo su id y las propiedades que filtran las consultas (`docs/modelos/matriz-propiedad.md` §3). Neo4j es dueño únicamente de lo derivado: `Progreso` y `DEMUESTRA`.

- **9 etiquetas:** Usuario, Simulacion, Habilidad, Paso, Opcion, Intento, Respuesta, Progreso, Evidencia.
- **13 tipos de relación (14 patrones):** REALIZA, TIENE, CONTIENE, DESARROLLA, OFRECE, GENERA, CONDUCE_A, REGISTRA, CORRESPONDE_A (Respuesta→Paso y Progreso→Habilidad), SELECCIONA, TIENE_PROGRESO, PRODUCE, DEMUESTRA.
- **Fuera del grafo:** Consecuencia, Retroalimentacion y Comparticion (R06, R11, R17). La retroalimentación queda como `Respuesta.tipo_retroalimentacion`. El correo y los textos no se copian.

## Estructura

| Carpeta / archivo | Qué hay |
|---|---|
| `schema/01-restricciones.cypher` | 11 restricciones de unicidad: los 9 `id_*`, `Habilidad.nombre` y la clave compuesta (`id_usuario`, `id_habilidad`) de `Progreso` |
| `schema/02-indices.cypher` | Los 4 índices que piden C-01..C-05 |
| `data/generar-carga.mjs` | Genera `03-carga.cypher` desde `database/seed/dataset.json` |
| `data/03-carga.cypher` | **Generado** (no se edita): `MERGE` por id de nodos y relaciones. Sin la simulación en BORRADOR |
| `data/04-derivados.cypher` | `DEMUESTRA` (RI-20) y `Progreso` (fórmula DEC-25, PROPUESTA para P-03), recalculados desde cero |
| `queries/C-0N-*.cypher` | C-01..C-05 parametrizadas (`$idUsuario`, `$idSimulacion`, `$habilidad`) |
| `tests/01..03-*.cypher` | Pruebas de esquema (A), datos (B) e integridad (C) |
| `tests/esperados.mjs` | Resultados esperados de C-01..C-05 con el dataset |
| `ejecutar.mjs` | Ejecutor con `neo4j-driver` y `.env`: `reset` y `probar` |

## Comandos

```bash
npm run db:up               # Neo4j en Docker (bolt :7688, http :7475)
npm run db:graph:reset      # vacía Neo4j (datos, restricciones, índices) y aplica schema/01, 02, data/03, 04
npm run db:graph:probar     # reset + 39 pruebas; escribe docs/pruebas/neo4j-<fecha>.md; código 1 si algo falla
npm run db:graph:generar    # regenera data/03-carga.cypher después de cambiar dataset.json
npm run test:integration    # incluye tests/integration/grafo.test.ts (las mismas pruebas)
```

`npm run verificar` incluye `db:graph:comprobar`, que falla si `03-carga.cypher` no corresponde al dataset.

**Para verlo en Neo4j Browser** (http://localhost:7475, credenciales de `.env`): pegar en orden `schema/01`, `schema/02`, `data/03` y `data/04`. Después, por ejemplo, `MATCH (n) RETURN n`. Los scripts son idempotentes: ejecutarlos dos veces da el mismo grafo.

## Convenciones de los scripts

- Cada sentencia termina en `;` al final de la línea. El ejecutor corta ahí y quita las líneas `//`.
- En `tests/`, cada sentencia devuelve filas con `prueba`, `ok` y `detalle`. Una fila con `ok = false` es un fallo, y **una sentencia sin filas también**. Para que siempre haya una fila, se agrega con `WITH count(…) AS violaciones` antes del `RETURN`, o con subconsultas `COUNT {}`.
- Una sentencia cuyo comentario empieza por `ESPERA_ERROR` debe ser rechazada por la base (por ejemplo, un duplicado).
- `SHOW CONSTRAINTS` y `SHOW INDEXES` no admiten `WITH`: se agrega directamente en el `RETURN`.

## Datos esperados (dataset común)

| Concepto | Valor y derivación |
|---|---|
| Grafo | 34 nodos y 53 relaciones (la simulación 0303 en BORRADOR no se proyecta) |
| Progreso de Ana | Comunicación efectiva = (0.6·92.5 + 0.3·40) / 0.9 = **75**. Resolución de conflictos = **92.5** (último intento de 0301: 0701). Gestión del tiempo = **40** (0702) |
| C-01 | Ana: solo «Tres entregas para mañana» (Gestión del tiempo 40 < 60; prioridad 0.7·20 = 14). Bruno, sin progreso: 0301 (0.6·70 + 0.4·60 = 66) y 0302 (0.7·60 + 0.3·50 = 57) |
| C-02 | Ana: Resolución de conflictos y Comunicación efectiva = FORTALEZA (75 ≥ 75). Gestión del tiempo = ÁREA DE MEJORA (sin `nivel_objetivo`, usa el nivel esperado 60) |
| C-03 | Ana en 0301: 4 decisiones (0703: PARCIAL, ERROR; 0701: ACIERTO, ACIERTO) |
| C-04 | La evidencia 1101 demuestra Comunicación efectiva y Resolución de conflictos, no Gestión del tiempo |
| C-05 | Ana, Comunicación efectiva: 37.5 → 92.5 → 40. El intento EN_CURSO no cuenta |

Las pruebas se validaron también **al revés**: con errores introducidos a propósito (una opción de otro paso, una secuencia repetida, un `DEMUESTRA` de más, un nivel alterado, un correo copiado, una ruta entre simulaciones, un intento sin simulación, un tipo de retroalimentación fuera de catálogo), falló la prueba correspondiente en cada caso.

## Antecedente

Los scripts de la actividad anterior (12 etiquetas, runner Java embebido) se retiraron en backend #4. Su verificación sigue documentada en `verificacion/09-neo4j.md` y se pueden consultar en el historial de git.
