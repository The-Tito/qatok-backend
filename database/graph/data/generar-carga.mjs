// Genera data/03-carga.cypher a partir de database/seed/dataset.json.
// Proyecta relacional + documental al grafo según docs/modelos/matriz-propiedad.md §3:
// solo ids y las propiedades que filtran C-01..C-05, con MERGE (idempotente).
// Los derivados (Progreso, DEMUESTRA) los calcula data/04-derivados.cypher.
//
// Uso:  node database/graph/data/generar-carga.mjs              (escribe el archivo)
//       node database/graph/data/generar-carga.mjs --comprobar  (falla si está desactualizado)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATASET = fileURLToPath(new URL('../../seed/dataset.json', import.meta.url));
const SALIDA = fileURLToPath(new URL('./03-carga.cypher', import.meta.url));

/** Literal Cypher de un valor del dataset (cadenas escapadas, nunca concatenación cruda). */
function literal(valor) {
  if (typeof valor === 'number') return Number.isInteger(valor) ? `${valor}.0` : `${valor}`;
  if (typeof valor === 'string')
    return `'${valor.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  throw new Error(`Tipo no soportado: ${JSON.stringify(valor)}`);
}

const fecha = (iso) => `datetime(${literal(iso)})`;
const entero = (n) => `${n}`;

/** SET con las propiedades que tienen valor: las opcionales sin valor no se guardan. */
function set(props) {
  const pares = Object.entries(props).filter(([, v]) => v !== null && v !== undefined);
  return pares.length ? ` SET ${pares.map(([k, v]) => `n.${k} = ${v}`).join(', ')}` : '';
}

const nodo = (etiqueta, id, valorId, props = {}) =>
  `MERGE (n:${etiqueta} {${id}: ${literal(valorId)}})${set(props)};`;

/** MERGE de la relación sin propiedades (identidad = extremos) y SET aparte: si cambia
 *  una propiedad, se actualiza en lugar de crear una segunda relación. */
function relacion([etqA, idA, valA], tipo, [etqB, idB, valB], props = {}) {
  const pares = Object.entries(props).map(([k, v]) => `x.${k} = ${v}`);
  const asignacion = pares.length ? ` SET ${pares.join(', ')}` : '';
  return (
    `MATCH (a:${etqA} {${idA}: ${literal(valA)}}), (b:${etqB} {${idB}: ${literal(valB)}}) ` +
    `MERGE (a)-[${pares.length ? 'x' : ''}:${tipo}]->(b)${asignacion};`
  );
}

export function generar(dataset) {
  const { relacional: r, documental: d } = dataset;

  // La simulación en BORRADOR no se proyecta (el grafo la recibe con SIMULACION_PUBLICADA).
  const simulaciones = r.simulacion.filter((s) => s.estado !== 'BORRADOR');
  const proyectadas = new Set(simulaciones.map((s) => s.id_simulacion));
  const contenidos = d.contenidos_simulacion.filter((c) => proyectadas.has(c._id));
  const intentos = r.intento.filter((i) => proyectadas.has(i.id_simulacion));
  const idsIntento = new Set(intentos.map((i) => i.id_intento));
  const respuestas = r.respuesta.filter((x) => idsIntento.has(x.id_intento));
  const evidencias = r.evidencia.filter((e) => idsIntento.has(e.id_intento));

  // Retroalimentación de cada opción (vive en el contenido): se copia a la respuesta.
  const tipoRetro = new Map();
  for (const c of contenidos)
    for (const p of c.pasos)
      for (const o of p.opciones) tipoRetro.set(o.id_opcion, o.retroalimentacion.tipo);

  const U = (id) => ['Usuario', 'id_usuario', id];
  const S = (id) => ['Simulacion', 'id_simulacion', id];
  const H = (id) => ['Habilidad', 'id_habilidad', id];
  const P = (id) => ['Paso', 'id_paso', id];
  const O = (id) => ['Opcion', 'id_opcion', id];
  const I = (id) => ['Intento', 'id_intento', id];
  const R = (id) => ['Respuesta', 'id_respuesta', id];
  const E = (id) => ['Evidencia', 'id_evidencia', id];

  const pasos = contenidos.flatMap((c) => c.pasos.map((p) => ({ ...p, id_simulacion: c._id })));
  const opciones = pasos.flatMap((p) => p.opciones.map((o) => ({ ...o, id_paso: p.id_paso })));

  const secciones = [
    [
      'Usuario (solo el id: el correo no se copia, RF-09)',
      r.usuario.map((u) => nodo('Usuario', 'id_usuario', u.id_usuario)),
    ],
    [
      'Habilidad',
      r.habilidad.map((h) =>
        nodo('Habilidad', 'id_habilidad', h.id_habilidad, {
          nombre: literal(h.nombre),
          nivel_objetivo: h.nivel_objetivo === null ? null : entero(h.nivel_objetivo),
        }),
      ),
    ],
    [
      'Simulacion (sin la de BORRADOR)',
      simulaciones.map((s) =>
        nodo('Simulacion', 'id_simulacion', s.id_simulacion, {
          titulo: literal(s.titulo),
          estado: literal(s.estado),
        }),
      ),
    ],
    ['Paso', pasos.map((p) => nodo('Paso', 'id_paso', p.id_paso, { orden: entero(p.orden) }))],
    ['Opcion', opciones.map((o) => nodo('Opcion', 'id_opcion', o.id_opcion))],
    [
      'Intento',
      intentos.map((i) =>
        nodo('Intento', 'id_intento', i.id_intento, {
          estado: literal(i.estado),
          fecha_inicio: fecha(i.fecha_inicio),
          fecha_fin: i.fecha_fin && fecha(i.fecha_fin),
          puntuacion: i.puntuacion === null ? null : literal(i.puntuacion),
        }),
      ),
    ],
    [
      'Respuesta (tipo_retroalimentacion = la de la opción elegida)',
      respuestas.map((x) =>
        nodo('Respuesta', 'id_respuesta', x.id_respuesta, {
          secuencia: entero(x.secuencia),
          tipo_retroalimentacion: literal(tipoRetro.get(x.id_opcion)),
        }),
      ),
    ],
    [
      'Evidencia',
      evidencias.map((e) =>
        nodo('Evidencia', 'id_evidencia', e.id_evidencia, { titulo: literal(e.titulo) }),
      ),
    ],
    [
      'DESARROLLA (Simulacion → Habilidad)',
      r.simulacion_habilidad
        .filter((x) => proyectadas.has(x.id_simulacion))
        .map((x) =>
          relacion(S(x.id_simulacion), 'DESARROLLA', H(x.id_habilidad), {
            peso: literal(x.peso),
            nivel_esperado: entero(x.nivel_esperado),
          }),
        ),
    ],
    [
      'CONTIENE (Simulacion → Paso)',
      pasos.map((p) => relacion(S(p.id_simulacion), 'CONTIENE', P(p.id_paso))),
    ],
    [
      'OFRECE (Paso → Opcion)',
      opciones.map((o) => relacion(P(o.id_paso), 'OFRECE', O(o.id_opcion))),
    ],
    [
      'CONDUCE_A (Opcion → Paso; las opciones terminales no tienen)',
      opciones
        .filter((o) => o.id_paso_siguiente)
        .map((o) => relacion(O(o.id_opcion), 'CONDUCE_A', P(o.id_paso_siguiente))),
    ],
    [
      'REALIZA (Usuario → Intento)',
      intentos.map((i) => relacion(U(i.id_usuario), 'REALIZA', I(i.id_intento))),
    ],
    [
      'TIENE (Simulacion → Intento)',
      intentos.map((i) => relacion(S(i.id_simulacion), 'TIENE', I(i.id_intento))),
    ],
    [
      'REGISTRA (Intento → Respuesta)',
      respuestas.map((x) => relacion(I(x.id_intento), 'REGISTRA', R(x.id_respuesta))),
    ],
    [
      'CORRESPONDE_A (Respuesta → Paso)',
      respuestas.map((x) => relacion(R(x.id_respuesta), 'CORRESPONDE_A', P(x.id_paso))),
    ],
    [
      'SELECCIONA (Respuesta → Opcion)',
      respuestas.map((x) => relacion(R(x.id_respuesta), 'SELECCIONA', O(x.id_opcion))),
    ],
    [
      'GENERA (Usuario → Evidencia)',
      evidencias.map((e) => relacion(U(e.id_usuario), 'GENERA', E(e.id_evidencia))),
    ],
    [
      'PRODUCE (Intento → Evidencia)',
      evidencias.map((e) => relacion(I(e.id_intento), 'PRODUCE', E(e.id_evidencia))),
    ],
  ];

  const encabezado = [
    '// =====================================================================',
    "// QATO'K · data/03 · Carga del grafo desde el dataset",
    '// ARCHIVO GENERADO: no se edita a mano. Se regenera con',
    '//   node database/graph/data/generar-carga.mjs',
    `// Origen: database/seed/dataset.json v${dataset._meta.version} (proyección de la matriz §3).`,
    '// Idempotente (MERGE por id): ejecutarlo dos veces da el mismo grafo.',
    '// Se puede pegar completo en Neo4j Browser o pasar a cypher-shell.',
    '// Después va data/04-derivados.cypher (Progreso y DEMUESTRA).',
    '// =====================================================================',
  ];
  const cuerpo = secciones.flatMap(([titulo, lineas]) => [
    '',
    `// ${titulo}: ${lineas.length}`,
    ...lineas,
  ]);
  return [...encabezado, ...cuerpo, ''].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const texto = generar(JSON.parse(readFileSync(DATASET, 'utf8')));
  if (process.argv.includes('--comprobar')) {
    if (readFileSync(SALIDA, 'utf8') !== texto) {
      console.error('03-carga.cypher está desactualizado: ejecuta npm run db:graph:generar');
      process.exit(1);
    }
    process.stdout.write('03-carga.cypher al día con dataset.json\n');
  } else {
    writeFileSync(SALIDA, texto);
    process.stdout.write(`Escrito ${SALIDA}\n`);
  }
}
