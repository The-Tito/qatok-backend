// Ejecutor de los scripts Cypher contra el Neo4j de Docker (npm run db:graph:*).
// Usa el driver oficial y las credenciales de .env; no necesita cypher-shell ni Java.
//
// Uso:  node database/graph/ejecutar.mjs reset   (borra todo y reconstruye el grafo desde cero)
//
// Los .cypher siguen siendo scripts normales: se pueden pegar en Neo4j Browser en el
// mismo orden (schema/01, schema/02, data/03, data/04).
import { existsSync, readFileSync } from 'node:fs';
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

export async function reset(driver) {
  await vaciar(driver);
  for (const archivo of ORDEN_RESET) {
    const n = await ejecutarArchivo(driver, archivo);
    process.stdout.write(`  ${archivo}: ${n} sentencias\n`);
  }
  const { records } = await driver.executeQuery(
    'MATCH (n) WITH count(n) AS nodos OPTIONAL MATCH ()-[r]->() RETURN nodos, count(r) AS relaciones',
  );
  return { nodos: records[0].get('nodos'), relaciones: records[0].get('relaciones') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const comando = process.argv[2];
  const driver = conectar();
  try {
    if (comando === 'reset') {
      process.stdout.write('Reconstruyendo el grafo desde cero…\n');
      const { nodos, relaciones } = await reset(driver);
      process.stdout.write(`Grafo listo: ${nodos} nodos, ${relaciones} relaciones\n`);
    } else {
      console.error('Uso: node database/graph/ejecutar.mjs reset');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
}
