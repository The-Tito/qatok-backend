import type { Conexiones } from '../db/conexiones.js';
import type { Logger } from '../lib/logger.js';
import { createDocumentReconciliation } from '../repositories/document/reconciliation.repository.js';
import { createGraphReconciliation } from '../repositories/graph/reconciliation.repository.js';
import { crearAplicadorGrafo } from '../repositories/graph/sincronizacion.repository.js';
import {
  crearOutboxRepository,
  listUnappliedEvents,
  tryLockOutboxConsumer,
} from '../repositories/relational/outbox.repository.js';
import {
  lockReconciliationSources,
  readReconciliationSources,
} from '../repositories/relational/reconciliation.repository.js';
import { inTransaction } from '../repositories/relational/transaction.js';
import { crearProcesadorSincronizacion } from '../sync/procesador.js';
import { projectionDiff, type ProjectionDiff } from './diff.js';
import { expectedProjection } from './model.js';

type Options = { apply: boolean; rebuild?: boolean; now?: Date };
function summarize(diff: ProjectionDiff) {
  return {
    nodes: {
      missing: diff.nodes.missing.map(({ key }) => key),
      changed: diff.nodes.changed.map(({ key }) => key),
      extra: diff.nodes.extra.map(({ key }) => key),
    },
    edges: {
      missing: diff.edges.missing.map(({ key }) => key),
      changed: diff.edges.changed.map(({ key }) => key),
      extra: diff.edges.extra.map(({ key }) => key),
    },
  };
}

function hasDifferences(diff: ProjectionDiff) {
  return Object.values(diff).some((group) =>
    Object.values(group).some((entries) => entries.length > 0),
  );
}

export async function reconcile(connections: Conexiones, logger: Logger, options: Options) {
  const { apply, rebuild = false, now = new Date() } = options;
  const pool = connections.postgres;
  const documents = createDocumentReconciliation(connections.mongo.db);
  const graph = createGraphReconciliation(connections.neo4j);
  const outbox = crearOutboxRepository(pool);

  let retriedEvent: string | null = null;
  if (apply) {
    const [head] = await listUnappliedEvents(pool);
    if (head?.estado === 'FALLIDO' && (await outbox.reactivarCabeza(head.id_evento))) {
      retriedEvent = head.id_evento;
    }
    if (head) {
      const processor = crearProcesadorSincronizacion(
        outbox,
        crearAplicadorGrafo(connections.neo4j),
        { logger },
      );
      await processor.procesarPendientes();
    }
  }

  return inTransaction(pool, async (client) => {
    if (apply) {
      await lockReconciliationSources(client);
      if (!(await tryLockOutboxConsumer(client)))
        throw new Error('El consumidor de outbox está ocupado.');
    } else {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    }
    const pending = await listUnappliedEvents(client);
    const sources = await readReconciliationSources(client);
    const documentState = await documents.inspect(sources, now);
    const expected = expectedProjection(sources, documentState.revisions);
    const graphBlockedBy = [
      ...(pending.length ? ['outbox'] : []),
      ...(expected.problems.length ? ['source_references'] : []),
    ];
    const writeGraph = apply && graphBlockedBy.length === 0;
    const graphState = await graph.run(writeGraph, async (repository) => {
      const initial = projectionDiff(expected.projection, await repository.inspect());
      if (!writeGraph || (!hasDifferences(initial) && !rebuild)) {
        return { initial, remaining: initial, repaired: false };
      }
      await repository.apply(expected.projection, initial, rebuild);
      const remaining = projectionDiff(expected.projection, await repository.inspect());
      if (hasDifferences(remaining))
        throw new Error('La proyección reparada no coincide; se revierte el grafo.');
      return { initial, remaining, repaired: true };
    });

    if (writeGraph && rebuild) await graph.ensureSchema();

    const removed = apply && !rebuild ? await documentState.repair() : [];
    const removedIds = new Set(removed.map(({ id, kind }) => JSON.stringify([kind, id])));
    const remainingOrphans = documentState.orphanSummary.filter(
      ({ id, kind }) => !removedIds.has(JSON.stringify([kind, id])),
    );
    return {
      mode: apply ? (rebuild ? 'rebuild' : 'repair') : rebuild ? 'plan_rebuild' : 'diagnose',
      pending,
      retriedEvent,
      graph: {
        blockedBy: graphBlockedBy,
        initial: summarize(graphState.initial),
        remaining: summarize(graphState.remaining),
        repaired: graphState.repaired,
      },
      documents: {
        orphans: documentState.orphanSummary,
        removed,
        remainingOrphans,
        missingEvidence: documentState.missingEvidence,
      },
      sourceProblems: expected.problems,
      consistent:
        pending.length === 0 &&
        !hasDifferences(graphState.remaining) &&
        remainingOrphans.length === 0 &&
        documentState.missingEvidence.length === 0 &&
        expected.problems.length === 0,
    };
  });
}
