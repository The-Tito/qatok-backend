// Ejecutor de los scripts Cypher contra el Neo4j de Docker (npm run db:graph:*).
// Usa el driver oficial y las credenciales de .env; no necesita cypher-shell ni Java.
//
// Uso:  node database/graph/ejecutar.mjs reset    (borra todo y reconstruye el grafo desde cero)
//       node database/graph/ejecutar.mjs probar   (reset + pruebas; escribe docs/pruebas/neo4j-<fecha>.md)
//
// Los .cypher siguen siendo scripts normales: se pueden pegar en Neo4j Browser en el
// mismo orden (schema/01, schema/02, data/03, data/04).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const GRAFO = fileURLToPath(new URL('./', import.meta.url));

export const ORDEN_RESET = [
  'schema/01-restricciones.cypher',
  'schema/02-indices.cypher',
  'data/03-carga.cypher',
  'data/04-derivados.cypher',
];

export function conectar() {
  const env = `${RAIZ}.env`;
  if (existsSync(env)) process.loadEnvFile(env);
  const {
    NEO4J_HOST = 'localhost',
    NEO4J_BOLT_PORT = '7688',
    NEO4J_USER,
    NEO4J_PASSWORD,
  } = process.env;
  if (!NEO4J_USER || !NEO4J_PASSWORD) {
    throw new Error('Faltan NEO4J_USER/NEO4J_PASSWORD: ejecuta npm run setup:env');
  }
  return neo4j.driver(
    `bolt://${NEO4J_HOST}:${NEO4J_BOLT_PORT}`,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    { disableLosslessIntegers: true },
  );
}

/**
 * Sentencias de un script: quita las líneas de comentario y corta en cada ';' de fin de
 * línea. Los scripts del repo terminan cada sentencia así (convención de database/graph).
 * Cada sentencia conserva su comentario previo como `titulo` (lo usan las pruebas).
 */
export function sentencias(relativo) {
  const texto = readFileSync(`${GRAFO}${relativo}`, 'utf8');
  const resultado = [];
  let titulo = '';
  let actual = [];
  for (const linea of texto.split('\n')) {
    const limpia = linea.trim();
    if (limpia.startsWith('//')) {
      if (actual.length === 0) titulo = limpia.replace(/^\/\/\s*/, '');
      continue;
    }
    if (limpia) actual.push(linea);
    if (limpia.endsWith(';')) {
      resultado.push({ titulo, cypher: actual.join('\n').replace(/;\s*$/, '') });
      actual = [];
      titulo = '';
    }
  }
  if (actual.join('').trim()) throw new Error(`${relativo}: la última sentencia no termina en ';'`);
  return resultado;
}

export async function ejecutarArchivo(driver, relativo) {
  const lista = sentencias(relativo);
  for (const { cypher } of lista) await driver.executeQuery(cypher);
  return lista.length;
}

/** Deja la base vacía: datos, restricciones e índices (salvo los LOOKUP del sistema). */
export async function vaciar(driver) {
  // CALL ... IN TRANSACTIONS exige una transacción implícita (sesión con run).
  const sesion = driver.session();
  try {
    await sesion.run('MATCH (n) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS');
  } finally {
    await sesion.close();
  }
  const { records: restricciones } = await driver.executeQuery('SHOW CONSTRAINTS YIELD name');
  for (const r of restricciones) await driver.executeQuery(`DROP CONSTRAINT \`${r.get('name')}\``);
  const { records: indices } = await driver.executeQuery(
    "SHOW INDEXES YIELD name, type WHERE type <> 'LOOKUP' RETURN name",
  );
  for (const r of indices) await driver.executeQuery(`DROP INDEX \`${r.get('name')}\``);
}

export async function reset(driver, log = () => {}) {
  await vaciar(driver);
  for (const archivo of ORDEN_RESET) {
    const n = await ejecutarArchivo(driver, archivo);
    log(`  ${archivo}: ${n} sentencias`);
  }
  const { records } = await driver.executeQuery(
    'MATCH (n) WITH count(n) AS nodos OPTIONAL MATCH ()-[r]->() RETURN nodos, count(r) AS relaciones',
  );
  return { nodos: records[0].get('nodos'), relaciones: records[0].get('relaciones') };
}

// ---------------------------------------------------------------------------------------
// Pruebas: tests/*.cypher (filas prueba/ok/detalle) y C-01..C-05 contra tests/esperados.mjs
// ---------------------------------------------------------------------------------------
export const PRUEBAS = [
  'tests/01-esquema.cypher',
  'tests/02-datos.cypher',
  'tests/03-integridad.cypher',
];

/** Valores del driver a JSON comparable: fechas como ISO, listas y mapas recursivos. */
export function normalizar(valor) {
  if (neo4j.isDateTime(valor) || neo4j.isDate(valor)) return valor.toString();
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v)]));
  }
  return valor;
}

/** Igualdad para resultados: números con tolerancia y listas de texto sin importar el orden. */
export function iguales(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const textos = (l) => l.every((x) => typeof x === 'string');
    if (textos(a) && textos(b))
      return [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
    return a.every((x, i) => iguales(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.join() === kb.join() && ka.every((k) => iguales(a[k], b[k]));
  }
  return a === b;
}

const grupoDe = (archivo) => archivo.replace(/^.*\/\d+-|\.cypher$/g, '');

async function probarArchivo(driver, archivo) {
  const resultados = [];
  for (const { titulo, cypher } of sentencias(archivo)) {
    const grupo = grupoDe(archivo);
    if (titulo.startsWith('ESPERA_ERROR')) {
      const prueba = titulo.replace(/^ESPERA_ERROR\s*/, '');
      try {
        await driver.executeQuery(cypher);
        resultados.push({ grupo, prueba, ok: false, detalle: 'la base aceptó la escritura' });
      } catch (error) {
        resultados.push({ grupo, prueba, ok: true, detalle: `rechazada: ${error.code}` });
      }
      continue;
    }
    const { records } = await driver.executeQuery(cypher);
    if (records.length === 0) {
      resultados.push({ grupo, prueba: titulo, ok: false, detalle: 'la prueba no devolvió filas' });
    }
    for (const r of records) {
      const detalle = normalizar(r.get('detalle'));
      resultados.push({
        grupo,
        prueba: r.get('prueba'),
        ok: r.get('ok') === true,
        detalle: typeof detalle === 'string' ? detalle.trim() : JSON.stringify(detalle),
      });
    }
  }
  return resultados;
}

async function probarConsultas(driver) {
  const { CASOS } = await import('./tests/esperados.mjs');
  const resultados = [];
  for (const { consulta, caso, parametros, esperado } of CASOS) {
    const [{ cypher }] = sentencias(`queries/${consulta}`);
    const { records } = await driver.executeQuery(cypher, parametros);
    const obtenido = records.map((r) => normalizar(r.toObject()));
    const ok = iguales(obtenido, esperado);
    resultados.push({
      grupo: 'consultas',
      prueba: caso,
      ok,
      detalle: ok ? `${obtenido.length} filas` : `obtenido ${JSON.stringify(obtenido)}`,
    });
  }
  return resultados;
}

/** Reconstruye el grafo, corre todas las pruebas y lo deja reconstruido otra vez. */
export async function probar(driver, log = () => {}) {
  const grafo = await reset(driver, log);
  const { records } = await driver.executeQuery(
    'CALL dbms.components() YIELD versions, edition RETURN versions[0] AS version, edition',
  );
  const resultados = [];
  for (const archivo of PRUEBAS) resultados.push(...(await probarArchivo(driver, archivo)));
  resultados.push(...(await probarConsultas(driver)));
  await reset(driver); // por si una escritura que debía fallar no falló
  return {
    neo4j: `${records[0].get('version')} ${records[0].get('edition')}`,
    grafo,
    resultados,
    fallos: resultados.filter((r) => !r.ok),
  };
}

function commitActual() {
  try {
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ })
      .toString()
      .trim();
    const sucio = execFileSync('git', ['status', '--porcelain'], { cwd: RAIZ }).toString().trim();
    return sucio ? `${hash} (con cambios sin commit)` : hash;
  } catch {
    return 'desconocido';
  }
}

export function informe({ neo4j: version, grafo, resultados, fallos }, fecha, commit) {
  const celda = (t) => String(t).replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `# Pruebas del grafo (Neo4j) — ${fecha}`,
    '',
    '> Generado por `npm run db:graph:probar` (database/graph/ejecutar.mjs). No se edita a mano.',
    '',
    '| Dato | Valor |',
    '|---|---|',
    `| Fecha (UTC) | ${new Date().toISOString()} |`,
    `| Neo4j | ${version} (Docker) |`,
    `| Commit | ${commit} |`,
    `| Grafo cargado | ${grafo.nodos} nodos, ${grafo.relaciones} relaciones |`,
    `| Resultado | **${resultados.length - fallos.length}/${resultados.length} pruebas OK, ${fallos.length} fallos** |`,
    '',
    '| Grupo | Prueba | OK | Detalle |',
    '|---|---|---|---|',
    ...resultados.map(
      (r) => `| ${r.grupo} | ${celda(r.prueba)} | ${r.ok ? '✔' : '✘'} | ${celda(r.detalle)} |`,
    ),
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const comando = process.argv[2];
  const escribir = (linea) => process.stdout.write(`${linea}\n`);
  const driver = conectar();
  try {
    if (comando === 'reset') {
      process.stdout.write('Reconstruyendo el grafo desde cero…\n');
      const { nodos, relaciones } = await reset(driver, escribir);
      escribir(`Grafo listo: ${nodos} nodos, ${relaciones} relaciones`);
    } else if (comando === 'probar') {
      const resultado = await probar(driver, escribir);
      for (const r of resultado.resultados) {
        escribir(`${r.ok ? '✔' : '✘'} [${r.grupo}] ${r.prueba}${r.ok ? '' : ` → ${r.detalle}`}`);
      }
      const fecha = new Date().toISOString().slice(0, 10);
      const archivo = `${RAIZ}docs/pruebas/neo4j-${fecha}.md`;
      writeFileSync(archivo, informe(resultado, fecha, commitActual()));
      const { resultados, fallos } = resultado;
      escribir(
        `=== RESUMEN: ${resultados.length} pruebas, ${fallos.length} fallos (Neo4j ${resultado.neo4j}) ===`,
      );
      escribir(`Informe: docs/pruebas/neo4j-${fecha}.md`);
      if (fallos.length) process.exitCode = 1;
    } else {
      console.error('Uso: node database/graph/ejecutar.mjs reset|probar');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
}
