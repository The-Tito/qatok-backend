import { randomUUID } from 'node:crypto';
import type { Evidence, EvidenceDetail, EvidenceQuery, UpdateEvidenceInput } from '@qatok/shared';
import type { Pool } from 'pg';
import type { z } from 'zod';
import { ErrorApp } from '../lib/errores.js';
import type { Logger } from '../lib/logger.js';
import { notAuthenticated } from './account.service.js';
import type {
  crearEvidenciaRepository,
  InstantaneaEvidencia,
} from '../repositories/document/evidencia.repository.js';
import type { PerfilRepositoryGrafo } from '../repositories/graph/perfil.repository.js';
import type { createAttemptRepository } from '../repositories/relational/attempt.repository.js';
import type { createEvidenceRepository } from '../repositories/relational/evidence.repository.js';
import { encolarEventos } from '../repositories/relational/outbox.repository.js';
import type { SimulationRepository } from '../repositories/relational/simulation.repository.js';
import { inTransaction } from '../repositories/relational/transaction.js';
import { nuevoEvento } from '../sync/eventos.js';
import { toSynchronization } from '../sync/http-status.js';
import type { ProcesadorSincronizacion } from '../sync/procesador.js';
import { loadJourney, type PublishedContent } from './journey.js';
import { toEvidenceSnapshot } from './evidence-snapshot.js';

const notFound = () => new ErrorApp('NOT_FOUND', 404, 'Evidence not found');
const unavailable = () =>
  new ErrorApp('EVIDENCE_CONTENT_UNAVAILABLE', 503, 'Evidence snapshot is unavailable');

function evidenceEvent(userId: string, evidence: Evidence) {
  return nuevoEvento('EVIDENCIA_GENERADA', {
    id_evidencia: evidence.id,
    id_usuario: userId,
    id_intento: evidence.attempt_id,
    titulo: evidence.title,
  });
}

export function createEvidenceService({
  pool,
  attempts,
  simulations,
  records,
  snapshots,
  content,
  graph,
  synchronization,
  logger,
}: {
  pool: Pool;
  attempts: ReturnType<typeof createAttemptRepository>;
  simulations: SimulationRepository;
  records: ReturnType<typeof createEvidenceRepository>;
  snapshots: ReturnType<typeof crearEvidenciaRepository>;
  content: PublishedContent;
  graph: PerfilRepositoryGrafo;
  synchronization: ProcesadorSincronizacion;
  logger: Logger;
}) {
  async function cleanup(id: string, canDelete: () => Promise<boolean>) {
    try {
      if (await canDelete()) await snapshots.eliminar(id);
    } catch {
      logger.warn({ evidenceId: id }, 'Evidence snapshot cleanup deferred to reconciliation');
    }
  }

  return {
    async create(userId: string, attemptId: string, title?: string) {
      const id = randomUUID();
      let snapshotStarted = false;
      const { evidence, event } = await inTransaction(pool, async (client) => {
        if (!(await records.lockActiveOwner(client, userId))) throw notAuthenticated();
        const row = await attempts.lockOwned(client, userId, attemptId, true);
        if (!row) throw new ErrorApp('NOT_FOUND', 404, 'Attempt not found');
        if (row.attempt.status !== 'COMPLETED' || row.attempt.score === null) {
          throw new ErrorApp(
            'ATTEMPT_NOT_COMPLETED',
            409,
            'Only completed attempts can produce evidence',
          );
        }
        const existing = await records.findByAttempt(client, attemptId);
        if (existing) {
          throw new ErrorApp('EVIDENCE_ALREADY_EXISTS', 409, 'The attempt already has evidence', {
            evidence_id: existing,
          });
        }
        const metadata = await simulations.find(row.attempt.simulation_id, client);
        if (!metadata) throw unavailable();
        const { simulation } = metadata;
        const responses = await attempts.listResponses(client, attemptId);
        const journey = await loadJourney(content, simulation.id, row.revision_id, responses);
        if (!journey.length) throw unavailable();
        const createdAt = new Date();
        const evidence: Evidence = {
          id,
          attempt_id: attemptId,
          title: title ?? simulation.title,
          generated_at: createdAt.toISOString(),
          visibility: 'PRIVATE',
        };
        const snapshot: InstantaneaEvidencia = {
          _id: id,
          descripcion: Array.from(simulation.description.trim() || simulation.title)
            .slice(0, 5000)
            .join(''),
          simulacion: { id_simulacion: simulation.id, titulo: simulation.title },
          puntuacion: row.attempt.score,
          habilidades: simulation.skills.map(({ id, name }) => ({
            id_habilidad: id,
            nombre: name,
          })),
          decisiones: journey.map(({ step, option, sequence }) => ({
            secuencia: sequence,
            paso: { titulo: step.titulo, tipo: step.tipo },
            opcion: option.descripcion,
            consecuencias: option.consecuencias.map(({ descripcion }) => descripcion),
            retroalimentacion_tipo: option.retroalimentacion.tipo,
          })),
          creado_en: createdAt,
        };
        snapshotStarted = true;
        await snapshots.guardar(snapshot);
        const event = evidenceEvent(userId, evidence);
        await records.insert(client, userId, evidence);
        await encolarEventos(client, [event]);
        return { evidence, event };
      }).catch(async (error: unknown) => {
        if (snapshotStarted) {
          // Confirma si el registro existe tras un COMMIT cuyo resultado quedó incierto.
          await cleanup(id, () =>
            inTransaction(pool, async (client) => {
              await attempts.lockOwned(client, userId, attemptId, true);
              return !(await records.findOwned(userId, id, client));
            }),
          );
        }
        throw error;
      });
      return {
        evidence,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },

    async list(userId: string, query: z.output<typeof EvidenceQuery>) {
      const ids = query.skill_id
        ? (await graph.evidenciasDeHabilidad(userId, query.skill_id)).map(
            ({ id_evidencia }) => id_evidencia,
          )
        : null;
      return records.list(userId, query.limit, query.offset, ids);
    },

    async get(userId: string, id: string): Promise<EvidenceDetail> {
      const evidence = await records.findOwned(userId, id);
      if (!evidence) throw notFound();
      const snapshot = await snapshots.obtener(id);
      if (!snapshot) throw unavailable();
      return { evidence, content: toEvidenceSnapshot(snapshot) };
    },

    async update(userId: string, id: string, input: UpdateEvidenceInput) {
      const { evidence, event } = await inTransaction(pool, async (client) => {
        const before = await records.findOwned(userId, id, client);
        if (!before) throw notFound();
        const evidence = await records.update(client, userId, id, input);
        if (!evidence) throw notFound();
        const event = evidence.title !== before.title ? evidenceEvent(userId, evidence) : null;
        if (event) await encolarEventos(client, [event]);
        return { evidence, event };
      });
      return {
        evidence,
        synchronization: event
          ? toSynchronization(await synchronization.aplicarAhora([event]))
          : null,
      };
    },

    async delete(userId: string, id: string) {
      const event = nuevoEvento('EVIDENCIA_ELIMINADA', { id_evidencia: id, id_usuario: userId });
      await inTransaction(pool, async (client) => {
        if (!(await records.delete(client, userId, id))) throw notFound();
        await encolarEventos(client, [event]);
      });
      await cleanup(id, async () => true);
      return {
        deleted: true as const,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },
  };
}
