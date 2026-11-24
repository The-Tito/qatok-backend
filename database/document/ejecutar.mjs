import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { colecciones } from './validators/esquemas.mjs';

const { MongoClient } = createRequire(new URL('../../backend/package.json', import.meta.url))(
  'mongodb',
);
const ARCHIVO_ENV = new URL('../../.env', import.meta.url);

export function leerDataset() {
  return JSON.parse(readFileSync(new URL('../seed/dataset.json', import.meta.url), 'utf8'));
}

export function conectar({ reinicioLocal = false } = {}) {
  if (existsSync(ARCHIVO_ENV)) process.loadEnvFile(ARCHIVO_ENV);
  const { NODE_ENV, MONGO_HOST, MONGO_PORT, MONGO_DB, MONGO_USER, MONGO_PASSWORD } = process.env;
  const puerto = Number(MONGO_PORT);
  if (
    !MONGO_HOST ||
    !MONGO_DB ||
    !MONGO_USER ||
    !MONGO_PASSWORD ||
    !Number.isInteger(puerto) ||
    puerto < 1 ||
    puerto > 65535
  ) {
    throw new Error('Configura las variables MONGO_* con npm run setup:env.');
  }
  if (
    reinicioLocal &&
    (NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(MONGO_HOST))
  ) {
    throw new Error('El reinicio documental solo admite MongoDB local de desarrollo.');
  }
  const host = MONGO_HOST === '::1' ? '[::1]' : MONGO_HOST;
  const usuario = encodeURIComponent(MONGO_USER);
  const clave = encodeURIComponent(MONGO_PASSWORD);
  const cliente = new MongoClient(
    `mongodb://${usuario}:${clave}@${host}:${puerto}/?authSource=admin`,
    {
      serverSelectionTimeoutMS: 5_000,
    },
  );
  return { cliente, db: cliente.db(MONGO_DB) };
}

export async function crearColecciones(db) {
  for (const [nombre, esquema] of Object.entries(colecciones)) {
    await db.createCollection(nombre, {
      validator: { $jsonSchema: esquema },
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  const revisiones = db.collection('revisiones_simulacion');
  await revisiones.createIndexes([
    { key: { id_simulacion: 1, version: 1 }, unique: true, name: 'uq_revision_simulacion_version' },
    { key: { 'pasos.id_paso': 1 }, unique: true, name: 'uq_revision_id_paso' },
    { key: { 'pasos.opciones.id_opcion': 1 }, unique: true, name: 'uq_revision_id_opcion' },
    { key: { creado_en: 1 }, name: 'ix_revision_creado_en' },
  ]);
  await db
    .collection('evidencias')
    .createIndex({ creado_en: 1 }, { name: 'ix_evidencia_creado_en' });
}

export async function cargarDataset(db) {
  const { documental, relacional } = leerDataset();
  const contenidos = new Map(documental.contenidos_simulacion.map((doc) => [doc._id, doc]));
  const fechas = new Map(relacional.evidencia.map((e) => [e.id_evidencia, e.fecha_generacion]));
  const borradores = relacional.simulacion.filter(
    (sim) => sim.estado === 'BORRADOR' && contenidos.has(sim.id_simulacion),
  );
  const revisiones = relacional.simulacion
    .filter((sim) => sim.id_revision_publicada)
    .map((sim) => ({
      _id: sim.id_revision_publicada,
      id_simulacion: sim.id_simulacion,
      version: 1,
      creado_en: new Date(),
      pasos: contenidos.get(sim.id_simulacion).pasos,
    }));
  const evidencia = documental.evidencias.map((doc) => ({
    ...doc,
    creado_en: new Date(fechas.get(doc._id)),
  }));
  if (borradores.length) {
    await db
      .collection('contenidos_simulacion')
      .insertMany(borradores.map((sim) => ({ ...contenidos.get(sim.id_simulacion), version: 1 })));
  }
  if (revisiones.length) await db.collection('revisiones_simulacion').insertMany(revisiones);
  if (evidencia.length) await db.collection('evidencias').insertMany(evidencia);
}

async function reiniciar() {
  const { cliente, db } = conectar({ reinicioLocal: true });
  try {
    const existentes = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of existentes) {
      if (Object.hasOwn(colecciones, name)) await db.dropCollection(name);
    }
    await crearColecciones(db);
    await cargarDataset(db);
    console.warn('MongoDB reconstruido desde el dataset de desarrollo.');
  } finally {
    await cliente.close();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  reiniciar().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
