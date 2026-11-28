import { randomUUID } from 'node:crypto';
import type { SimulationInput, SimulationStep } from '@qatok/shared';
import { MongoServerError } from 'mongodb';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { ErrorApp } from '../lib/errores.js';
import type { Logger } from '../lib/logger.js';
import {
  comprobarPublicable,
  ErrorContenido,
  type crearContenidoRepository,
} from '../repositories/document/contenido.repository.js';
import { encolarEventos } from '../repositories/relational/outbox.repository.js';
import type { SimulationRepository } from '../repositories/relational/simulation.repository.js';
import { inTransaction, violatesConstraint } from '../repositories/relational/transaction.js';
import { nuevoEvento } from '../sync/eventos.js';
import { toSynchronization } from '../sync/http-status.js';
import type { ProcesadorSincronizacion } from '../sync/procesador.js';
import { toPublicStep, toStoredStep } from './simulation-content.js';

const missing = () => new ErrorApp('NOT_FOUND', 404, 'Simulation not found');
const notEditable = () =>
  new ErrorApp('SIMULATION_NOT_EDITABLE', 409, 'Only drafts can be changed');
const stale = () => new ErrorApp('STALE_CONTENT_VERSION', 409, 'The draft version has changed');

function contentError(error: unknown): never {
  if (error instanceof ErrorContenido) {
    if (error.codigo === 'CONTENIDO_INCOMPLETO') {
      throw new ErrorApp('INCOMPLETE_CONTENT', 409, 'The draft is incomplete');
    }
    if (error.codigo === 'RAMIFICACION_INVALIDA') {
      throw new ErrorApp('INVALID_BRANCHES', 409, 'The draft has invalid branches');
    }
    throw new ErrorApp(
      'VALIDATION_ERROR',
      400,
      'Step IDs, option IDs and step orders must be unique',
    );
  }
  if (error instanceof MongoServerError && error.code === 11000) {
    throw new ErrorApp(
      'CONTENT_ID_CONFLICT',
      409,
      'A step or option ID is reserved by another revision',
    );
  }
  if (error instanceof MongoServerError && error.code === 121) {
    throw new ErrorApp('VALIDATION_ERROR', 400, 'Content does not match the document schema');
  }
  throw error;
}

export function createSimulationService(deps: {
  pool: Pool;
  simulations: SimulationRepository;
  content: ReturnType<typeof crearContenidoRepository>;
  synchronization: ProcesadorSincronizacion;
  logger: Logger;
}) {
  const { pool, simulations, content, synchronization, logger } = deps;

  async function find(id: string, client?: PoolClient) {
    const row = await simulations.find(id, client);
    if (!row) throw missing();
    return row;
  }

  async function lock(id: string, client: PoolClient) {
    if (!(await simulations.lock(client, id))) throw missing();
    // Read the related skills after acquiring the lock and observing concurrent commits.
    return find(id, client);
  }

  async function lockDraft(id: string, client: PoolClient) {
    const row = await lock(id, client);
    if (row.simulation.status !== 'DRAFT') throw notEditable();
    return row.simulation;
  }

  return {
    list: simulations.list,

    async get(id: string) {
      return (await find(id)).simulation;
    },

    save(id: string | null, input: z.output<typeof SimulationInput>) {
      const simulationId = id ?? randomUUID();
      return inTransaction(pool, async (client) => {
        if (id) await lockDraft(id, client);
        await simulations.save(client, simulationId, input, id === null);
        return (await find(simulationId, client)).simulation;
      }).catch((error: unknown) => {
        if (violatesConstraint(error, '23503', 'fk_simulacion_habilidad_habilidad')) {
          throw new ErrorApp('SKILL_NOT_FOUND', 404, 'An assigned skill does not exist');
        }
        throw error;
      });
    },

    async getContent(id: string) {
      const row = await find(id);
      const document = row.revision_id
        ? await content.obtenerRevision(id, row.revision_id)
        : await content.obtenerBorrador(id);
      if (!document) throw new ErrorApp('MISSING_CONTENT', 404, 'Simulation content not found');
      return { version: document.version, steps: document.pasos.map(toPublicStep) };
    },

    saveContent(id: string, version: number | null, steps: SimulationStep[]) {
      return inTransaction(pool, async (client) => {
        await lockDraft(id, client);
        const saved = await content.guardarBorrador(id, version, steps.map(toStoredStep));
        if (!saved) throw stale();
        return { version: saved.version, steps: saved.pasos.map(toPublicStep) };
      }).catch(contentError);
    },

    async publish(id: string, version: number) {
      const { event, simulation } = await inTransaction(pool, async (client) => {
        const draft = await lockDraft(id, client);
        const document = await content.obtenerBorrador(id);
        if (!document) throw new ErrorApp('MISSING_CONTENT', 409, 'Draft content is required');
        if (document.version !== version) throw stale();
        if (!draft.skills.length)
          throw new ErrorApp('INCOMPLETE_CONTENT', 409, 'A skill is required to publish');
        comprobarPublicable(document.pasos);
        await content.removeUnpublishedRevisions(id, version);
        const revision = await content.guardarRevision(randomUUID(), document);
        const event = nuevoEvento('SIMULACION_PUBLICADA', {
          id_simulacion: id,
          titulo: draft.title,
          habilidades: draft.skills.map((skill) => ({
            id_habilidad: skill.id,
            peso: skill.weight,
            nivel_esperado: skill.expected_level,
          })),
          pasos: revision.pasos.map((step) => ({
            id_paso: step.id_paso,
            orden: step.orden,
            opciones: step.opciones.map(({ id_opcion, id_paso_siguiente }) => ({
              id_opcion,
              id_paso_siguiente,
            })),
          })),
        });
        await simulations.publish(client, id, revision._id);
        const published = await find(id, client);
        await encolarEventos(client, [event]);
        return { event, simulation: published.simulation };
      }).catch(contentError);
      return {
        simulation,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },

    async deactivate(id: string) {
      const event = nuevoEvento('SIMULACION_ESTADO_CAMBIADO', {
        id_simulacion: id,
        estado: 'INACTIVA',
      });
      const simulation = await inTransaction(pool, async (client) => {
        if ((await lock(id, client)).simulation.status !== 'PUBLISHED') {
          throw new ErrorApp(
            'SIMULATION_NOT_PUBLISHED',
            409,
            'Only published simulations can be deactivated',
          );
        }
        await simulations.deactivate(client, id);
        const inactive = await find(id, client);
        await encolarEventos(client, [event]);
        return inactive.simulation;
      });
      return {
        simulation,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },

    async deleteDraft(id: string) {
      await inTransaction(pool, async (client) => {
        await lockDraft(id, client);
        await simulations.delete(client, id);
      });
      const cleanup = await Promise.allSettled([
        content.eliminarBorrador(id),
        content.removeUnpublishedRevisions(id),
      ]);
      if (cleanup.some((result) => result.status === 'rejected')) {
        logger.warn({ simulationId: id }, 'Simulation document cleanup deferred to reconciliation');
      }
    },
  };
}

export type SimulationService = ReturnType<typeof createSimulationService>;
