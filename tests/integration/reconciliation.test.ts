import { randomUUID } from 'node:crypto';
import { Pool, type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import {
  cerrarConexiones,
  crearConexiones,
  type Conexiones,
} from '../../backend/src/db/conexiones.js';
import { reconcile } from '../../backend/src/reconciliation/service.js';
import type {
  Borrador,
  Revision,
} from '../../backend/src/repositories/document/contenido.repository.js';
import type { InstantaneaEvidencia } from '../../backend/src/repositories/document/evidencia.repository.js';
import {
  crearOutboxRepository,
  encolarEventos,
  tryLockOutboxConsumer,
} from '../../backend/src/repositories/relational/outbox.repository.js';
import { inTransaction } from '../../backend/src/repositories/relational/transaction.js';
import { nuevoEvento } from '../../backend/src/sync/eventos.js';
import { cargarDataset, crearColecciones } from '../../database/document/ejecutar.mjs';
import { reset } from '../../database/graph/ejecutar.mjs';
import {
  conectar,
  eliminarEsquemaDePrueba,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { loggerSilencioso } from '../apoyo/app-de-prueba.js';

const environment = cargarEntorno();
const fixture = (suffix: string) => 'e0000000-0000-4000-8000-00000000' + suffix;
const ana = fixture('0101');
const communication = fixture('0201');
const negotiation = fixture('0301');
const evidenceId = fixture('1101');
const revisionId = fixture('1301');
let admin: Client;
let schema: string;
let connections: Conexiones;

beforeAll(async () => {
  admin = conectar();
  await admin.connect();
  schema = await prepararEsquemaDePrueba(admin);
  await admin.query('COMMIT');
  const base = crearConexiones(environment);
  await base.postgres.end();
  const postgres = new Pool({
    host: environment.POSTGRES_HOST,
    port: environment.POSTGRES_PORT,
    database: environment.POSTGRES_DB,
    user: environment.POSTGRES_USER,
    password: environment.POSTGRES_PASSWORD,
    options: '-c search_path=' + schema,
  });
  const db = base.mongo.cliente.db('reconciliation_test_' + randomUUID().replaceAll('-', ''));
  connections = { ...base, postgres, mongo: { ...base.mongo, db } };
  await crearColecciones(db);
  await cargarDataset(db);
  await reset(connections.neo4j);
}, 60_000);

afterAll(async () => {
  try {
    if (connections) {
      try {
        await reset(connections.neo4j);
      } finally {
        await connections.mongo.db.dropDatabase();
      }
    }
  } finally {
    if (connections) await cerrarConexiones(connections);
    if (schema) await eliminarEsquemaDePrueba(admin, schema);
    await admin?.end();
  }
}, 60_000);

const run = (apply = false, opts: { rebuild?: boolean; now?: Date } = {}) =>
  reconcile(connections, loggerSilencioso, { apply, ...opts });
const key = (...values: string[]) => JSON.stringify(values);

describe('reconciliation of PostgreSQL, MongoDB and Neo4j', () => {
  it('reports drift without writing and repairs the graph and derived progress', async () => {
    const clean = await run();
    expect(clean.consistent, JSON.stringify(clean)).toBe(true);
    const extraUser = randomUUID();
    const graph = connections.neo4j;
    await graph.executeQuery('CREATE (:Usuario {id_usuario: $extraUser})', { extraUser });
    await graph.executeQuery('MATCH (n:Evidencia {id_evidencia: $evidenceId}) DETACH DELETE n', {
      evidenceId,
    });
    await graph.executeQuery(
      'MATCH (p:Progreso {id_usuario: $ana, id_habilidad: $communication}) SET p.nivel_actual = 1, p.id_progreso = "invalid"',
      { ana, communication },
    );
    await graph.executeQuery(
      'MATCH (:Simulacion {id_simulacion: $negotiation})-[d:DESARROLLA]->(:Habilidad {id_habilidad: $communication}) SET d.peso = 0.1',
      { negotiation, communication },
    );
    const preview = await run();
    expect(preview.consistent).toBe(false);
    expect(preview.graph.repaired).toBe(false);
    expect(preview.graph.initial.nodes.missing).toContain(key('Evidencia', evidenceId));
    expect(preview.graph.initial.nodes.changed).toContain(key('Progreso', ana, communication));
    expect(preview.graph.initial.nodes.extra).toContain(key('Usuario', extraUser));
    expect(preview.graph.initial.edges.changed).toContain(
      key('DESARROLLA', key('Simulacion', negotiation), key('Habilidad', communication)),
    );
    expect((await run()).graph.initial).toEqual(preview.graph.initial);

    const repaired = await run(true);
    expect(repaired.graph.repaired).toBe(true);
    expect(repaired.consistent, JSON.stringify(repaired)).toBe(true);
    expect((await run(true)).graph.repaired).toBe(false);
  });

  it('deletes aged documents and waits for a second observation of an orphan draft', async () => {
    const db = connections.mongo.db;
    const evidence = db.collection<InstantaneaEvidencia>('evidencias');
    const revisions = db.collection<Revision>('revisiones_simulacion');
    const drafts = db.collection<Borrador>('contenidos_simulacion');
    const markers = db.collection('reconciliacion_borradores');
    const now = new Date('2026-11-24T12:00:00.000Z');
    const old = new Date(now.getTime() - 11 * 60_000);
    const recent = new Date(now.getTime() - 60_000);
    const original = (await evidence.findOne({ _id: evidenceId }))!;
    const oldId = randomUUID();
    const recentId = randomUUID();
    const draftId = randomUUID();
    const candidateId = randomUUID();
    const published = (await revisions.findOne({ _id: revisionId }))!;
    const stepIds = new Map(published.pasos.map(({ id_paso }) => [id_paso, randomUUID()]));
    await revisions.insertOne({
      ...published,
      _id: candidateId,
      version: published.version + 1,
      creado_en: old,
      pasos: published.pasos.map((step) => ({
        ...step,
        id_paso: stepIds.get(step.id_paso)!,
        opciones: step.opciones.map((option) => ({
          ...option,
          id_opcion: randomUUID(),
          id_paso_siguiente: option.id_paso_siguiente
            ? stepIds.get(option.id_paso_siguiente)!
            : null,
        })),
      })),
    });
    await evidence.insertMany([
      { ...original, _id: oldId, creado_en: old },
      { ...original, _id: recentId, creado_en: recent },
    ]);
    await drafts.insertOne({ _id: draftId, version: 1, pasos: published.pasos });
    const preview = await run(false, { now });
    expect(preview.documents.orphans).toEqual(
      expect.arrayContaining([
        { id: draftId, kind: 'orphan_draft', eligible: false },
        { id: candidateId, kind: 'orphan_revision', eligible: true },
        { id: oldId, kind: 'orphan_evidence', eligible: true },
        { id: recentId, kind: 'orphan_evidence', eligible: false },
      ]),
    );
    expect(await markers.countDocuments()).toBe(0);

    const first = await run(true, { now });
    expect(first.documents.removed).toEqual(
      expect.arrayContaining([
        { id: candidateId, kind: 'orphan_revision' },
        { id: oldId, kind: 'orphan_evidence' },
      ]),
    );
    expect(first.documents.remainingOrphans.map(({ id }) => id).sort()).toEqual(
      [draftId, recentId].sort(),
    );
    expect(await revisions.findOne({ _id: revisionId })).not.toBeNull();
    expect(await markers.countDocuments()).toBe(1);
    const afterGrace = new Date(now.getTime() + 10 * 60_000);
    const last = await run(true, { now: afterGrace });
    expect(last.documents.removed).toEqual(
      expect.arrayContaining([
        { id: draftId, kind: 'orphan_draft' },
        { id: recentId, kind: 'orphan_evidence' },
      ]),
    );
    expect(last.consistent).toBe(true);
    expect(await markers.countDocuments()).toBe(0);
  });

  it('reports broken references and does not rebuild the incomplete graph', async () => {
    const pool = connections.postgres;
    const graph = connections.neo4j;
    const missingRevision = randomUUID();
    await pool.query('UPDATE simulacion SET id_revision_publicada = $1 WHERE id_simulacion = $2', [
      missingRevision,
      negotiation,
    ]);
    try {
      const report = await run(true, { rebuild: true });
      expect(report.consistent).toBe(false);
      expect(report.graph.blockedBy).toEqual(['source_references']);
      expect(report.graph.repaired).toBe(false);
      expect(report.sourceProblems).toContainEqual({ kind: 'missing_revision', id: negotiation });
      expect(report.sourceProblems.some(({ kind }) => kind === 'invalid_response')).toBe(true);
      const query = await graph.executeQuery(
        'MATCH (n:Evidencia {id_evidencia: $evidenceId}) RETURN n',
        { evidenceId },
      );
      expect(query.records).toHaveLength(1);
    } finally {
      await pool.query(
        'UPDATE simulacion SET id_revision_publicada = $1 WHERE id_simulacion = $2',
        [revisionId, negotiation],
      );
    }
  });

  it('retries the failed head in order and respects a busy consumer', async () => {
    const pool = connections.postgres;
    const first = nuevoEvento('USUARIO_CREADO', { id_usuario: ana });
    const second = nuevoEvento('USUARIO_CREADO', { id_usuario: fixture('0102') });
    await inTransaction(pool, (client) => encolarEventos(client, [first, second]));
    await pool.query("UPDATE evento_sincronizacion SET estado = 'FALLIDO' WHERE id_evento = $1", [
      first.id_evento,
    ]);
    const preview = await run();
    expect(preview.pending.map(({ estado }) => estado)).toEqual(['FALLIDO', 'PENDIENTE']);
    expect(preview.graph.blockedBy).toEqual(['outbox']);

    const locked = await pool.connect();
    try {
      await locked.query('BEGIN');
      expect(await tryLockOutboxConsumer(locked)).toBe(true);
      await expect(run(true)).rejects.toThrow('El consumidor de outbox está ocupado');
    } finally {
      await locked.query('ROLLBACK');
      locked.release();
    }

    const applied = await run(true);
    expect(applied.retriedEvent).toBe(first.id_evento);
    expect(applied.pending).toEqual([]);
    expect(applied.consistent).toBe(true);
    expect(
      await crearOutboxRepository(pool).estanAplicados([first.id_evento, second.id_evento]),
    ).toBe(true);
  });

  it('fails fast if publication holds a lock before writing its revision', async () => {
    const client = await connections.postgres.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT id_simulacion FROM simulacion WHERE id_simulacion = $1 FOR UPDATE',
        [negotiation],
      );
      await expect(run(true)).rejects.toMatchObject({ code: '55P03' });
      expect((await run()).mode).toBe('diagnose');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('rebuilds the managed graph from current data rather than the development seed', async () => {
    const pool = connections.postgres;
    await pool.query("UPDATE evidencia SET titulo = 'Título actual' WHERE id_evidencia = $1", [
      evidenceId,
    ]);
    try {
      const plan = await run(false, { rebuild: true });
      expect(plan.mode).toBe('plan_rebuild');
      expect(plan.graph.repaired).toBe(false);
      const rebuilt = await run(true, { rebuild: true });
      expect(rebuilt.mode).toBe('rebuild');
      expect(rebuilt.graph.repaired).toBe(true);
      expect(rebuilt.consistent, JSON.stringify(rebuilt)).toBe(true);
      const { records } = await connections.neo4j.executeQuery(
        'MATCH (n:Evidencia {id_evidencia: $evidenceId}) RETURN n.titulo AS title',
        { evidenceId },
      );
      expect(records[0]?.get('title')).toBe('Título actual');
    } finally {
      await pool.query(
        "UPDATE evidencia SET titulo = 'Manejo de un cliente molesto' WHERE id_evidencia = $1",
        [evidenceId],
      );
    }
  });
});
