import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// pg es una dependencia del workspace backend.
const { Client } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
const ARCHIVO_ENV = new URL('../../.env', import.meta.url);
const TABLAS = [
  'usuario',
  'habilidad',
  'simulacion',
  'simulacion_habilidad',
  'intento',
  'respuesta',
  'evidencia',
  'comparticion',
];

export function leerSql(ruta) {
  return readFileSync(new URL(ruta, import.meta.url), 'utf8');
}

export function leerDataset() {
  return JSON.parse(readFileSync(new URL('../seed/dataset.json', import.meta.url), 'utf8'))
    .relacional;
}

export function conectar({ reinicioLocal = false } = {}) {
  if (existsSync(ARCHIVO_ENV)) process.loadEnvFile(ARCHIVO_ENV);
  const {
    NODE_ENV,
    POSTGRES_HOST: host,
    POSTGRES_PORT: puerto,
    POSTGRES_DB: database,
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
  } = process.env;
  const port = Number(puerto);
  if (
    !host ||
    !database ||
    !user ||
    !password ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Configura las variables POSTGRES_* con npm run setup:env.');
  }
  if (
    reinicioLocal &&
    (NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host))
  ) {
    throw new Error('El reinicio relacional solo admite PostgreSQL local de desarrollo.');
  }
  return new Client({ host, port, database, user, password, connectionTimeoutMillis: 5_000 });
}

/** El llamador fija el esquema y abre la transacción. */
export async function reconstruir(client, hash = '!') {
  const dataset = leerDataset();
  if (hash !== '!' && !/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new Error('QATOK_SEED_PASSWORD_HASH debe ser un hash bcrypt de costo 10.');
  }
  for (const ruta of [
    'schema/00-reiniciar.sql',
    'schema/01-esquema.sql',
    'schema/02-indices.sql',
    'schema/03-reintentos.sql',
  ]) {
    await client.query(leerSql(ruta));
  }
  for (const tabla of TABLAS) {
    const filas =
      tabla === 'usuario'
        ? dataset.usuario.map((usuario) => ({ ...usuario, contrasena_hash: hash }))
        : dataset[tabla];
    // El nombre de tabla solo procede de la lista fija. Los datos viajan como un parámetro.
    await client.query(
      `INSERT INTO ${tabla} SELECT * FROM jsonb_populate_recordset(NULL::${tabla}, $1::jsonb)`,
      [JSON.stringify(filas)],
    );
  }
}

export async function prepararEsquemaDePrueba(client) {
  const esquema = `prueba_relacional_${randomUUID().replaceAll('-', '')}`;
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${esquema}`);
  await client.query(`SET LOCAL search_path TO ${esquema}`);
  await reconstruir(client);
  return esquema;
}

export async function eliminarEsquemaDePrueba(client, esquema) {
  if (!/^prueba_relacional_[a-f0-9]{32}$/.test(esquema)) {
    throw new Error('Nombre de esquema temporal inválido.');
  }
  await client.query(`DROP SCHEMA ${esquema} CASCADE`);
}

export async function revertir(client) {
  await client.query('ROLLBACK');
}

async function ejecutar(accion) {
  if (accion !== 'reset' && accion !== 'migrar') {
    throw new Error('Acción esperada: reset o migrar.');
  }
  const client = conectar({ reinicioLocal: true });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO public');
    if (accion === 'reset') await reconstruir(client, process.env.QATOK_SEED_PASSWORD_HASH);
    else await client.query(leerSql('schema/03-reintentos.sql'));
    await client.query('COMMIT');
    console.warn(
      accion === 'reset'
        ? 'PostgreSQL reconstruido desde el dataset de desarrollo.'
        : 'Migración de reintentos aplicada.',
    );
  } catch (error) {
    await revertir(client).catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  ejecutar(process.argv[2] ?? 'reset').catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
