import { randomUUID } from 'node:crypto';
import type { Attempt, AttemptResponse, PlayerStep, RecordResponseInput } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';
import type {
  PasoContenido,
  crearContenidoRepository,
} from '../repositories/document/contenido.repository.js';
import { ErrorApp } from '../lib/errores.js';
import type { createAttemptRepository } from '../repositories/relational/attempt.repository.js';
import { encolarEventos } from '../repositories/relational/outbox.repository.js';
import { inTransaction } from '../repositories/relational/transaction.js';
import { nuevoEvento, type Evento } from '../sync/eventos.js';
import { toSynchronization } from '../sync/http-status.js';
import type { ProcesadorSincronizacion } from '../sync/procesador.js';
import { toPublicStep } from './simulation-content.js';

const missingContent = () =>
  new ErrorApp('PUBLISHED_CONTENT_UNAVAILABLE', 503, 'Published simulation content is unavailable');

function playerView(step: PasoContenido): PlayerStep {
  const view = toPublicStep(step);
  return { ...view, options: view.options.map(({ id, description }) => ({ id, description })) };
}

function selectedOption(
  steps: PasoContenido[],
  response: Pick<AttemptResponse, 'step_id' | 'option_id'>,
) {
  return steps
    .find((step) => step.id_paso === response.step_id)
    ?.opciones.find((option) => option.id_opcion === response.option_id);
}

function currentStep(steps: PasoContenido[], last?: AttemptResponse) {
  const step = last
    ? steps.find(({ id_paso }) => id_paso === selectedOption(steps, last)?.id_paso_siguiente)
    : steps.find(({ orden }) => orden === 1);
  if (!step) throw missingContent();
  return step;
}

function operationTime(attempt: Attempt, last?: AttemptResponse): string {
  return new Date(
    Math.max(Date.now(), Date.parse(last?.answered_at ?? attempt.started_at)),
  ).toISOString();
}

function finishAttempt(
  attempt: Attempt,
  status: 'COMPLETED' | 'ABANDONED',
  time: string,
  score: number | null,
) {
  return {
    attempt: { ...attempt, status, finished_at: time, score },
    event: nuevoEvento('INTENTO_FINALIZADO', {
      id_intento: attempt.id,
      estado: status === 'COMPLETED' ? 'COMPLETADO' : 'ABANDONADO',
      fecha_fin: time,
      puntuacion: score,
    }),
  };
}

function calculateScore(steps: PasoContenido[], responses: AttemptResponse[]) {
  const count = responses.length;
  const total = responses.reduce((sum, response) => {
    const option = selectedOption(steps, response);
    if (!option) throw missingContent();
    return sum + Math.round(option.valoracion * 100);
  }, 0);
  const cents = Math.floor(total / count);
  const remainder = 2 * (total % count);
  // Los empates redondean al centésimo par.
  return (cents + Number(remainder > count || (remainder === count && cents % 2 === 1))) / 100;
}

export function createAttemptService({
  pool,
  attempts,
  content,
  synchronization,
}: {
  pool: Pool;
  attempts: ReturnType<typeof createAttemptRepository>;
  content: Pick<ReturnType<typeof crearContenidoRepository>, 'obtenerRevision'>;
  synchronization: ProcesadorSincronizacion;
}) {
  async function loadSteps(simulationId: string, revisionId: string | null) {
    const revision = revisionId ? await content.obtenerRevision(simulationId, revisionId) : null;
    if (!revision) throw missingContent();
    return revision.pasos;
  }

  async function lockOwned(client: PoolClient, userId: string, attemptId: string, write: boolean) {
    const row = await attempts.lockOwned(client, userId, attemptId, write);
    if (!row) throw new ErrorApp('NOT_FOUND', 404, 'Attempt not found');
    if (write && row.attempt.status !== 'IN_PROGRESS') {
      throw new ErrorApp('ATTEMPT_NOT_IN_PROGRESS', 409, 'The attempt has ended');
    }
    return row;
  }

  return {
    list: attempts.list,

    async start(userId: string, simulationId: string) {
      const { event, ...result } = await inTransaction(pool, async (client) => {
        const simulation = await attempts.lockSimulation(client, simulationId);
        if (!simulation) throw new ErrorApp('NOT_FOUND', 404, 'Simulation not found');
        if (simulation.status !== 'PUBLICADA') {
          throw new ErrorApp(
            'SIMULATION_NOT_PUBLISHED',
            409,
            'Only published simulations can be started',
          );
        }
        const activeId = await attempts.findActiveId(client, userId, simulationId);
        if (activeId) {
          throw new ErrorApp('ACTIVE_ATTEMPT_EXISTS', 409, 'An active attempt already exists', {
            attempt_id: activeId,
          });
        }
        const steps = await loadSteps(simulationId, simulation.revision_id);
        const view = playerView(currentStep(steps));
        const attempt: Attempt = {
          id: randomUUID(),
          simulation_id: simulationId,
          simulation: { id: simulationId, title: simulation.title },
          status: 'IN_PROGRESS',
          started_at: new Date().toISOString(),
          finished_at: null,
          score: null,
        };
        const event = nuevoEvento('INTENTO_INICIADO', {
          id_intento: attempt.id,
          id_usuario: userId,
          id_simulacion: simulationId,
          fecha_inicio: attempt.started_at,
        });
        await attempts.insert(client, userId, attempt);
        await encolarEventos(client, [event]);
        return { attempt, current_step: view, event };
      });
      return {
        ...result,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },

    async get(userId: string, attemptId: string) {
      const { attempt, revision_id, responses } = await inTransaction(pool, async (client) => {
        const row = await lockOwned(client, userId, attemptId, false);
        return { ...row, responses: await attempts.listResponses(client, attemptId) };
      });
      const view =
        attempt.status === 'IN_PROGRESS'
          ? playerView(
              currentStep(await loadSteps(attempt.simulation_id, revision_id), responses.at(-1)),
            )
          : null;
      return { attempt, current_step: view, responses };
    },

    async respond(userId: string, attemptId: string, input: RecordResponseInput) {
      const { events, ...result } = await inTransaction(pool, async (client) => {
        const row = await lockOwned(client, userId, attemptId, true);
        const responses = await attempts.listResponses(client, attemptId);
        const last = responses.at(-1);
        const steps = await loadSteps(row.attempt.simulation_id, row.revision_id);
        const step = currentStep(steps, last);
        if (step.id_paso !== input.step_id) {
          throw new ErrorApp('STEP_NOT_CURRENT', 409, 'The step is no longer current', {
            step_id: step.id_paso,
          });
        }
        const index = step.opciones.findIndex((option) => option.id_opcion === input.option_id);
        const option = step.opciones[index];
        if (!option)
          throw new ErrorApp('OPTION_NOT_IN_STEP', 400, 'The option does not belong to this step');
        const { consequences, feedback } = toPublicStep(step).options[index]!;
        const response: AttemptResponse = {
          id: randomUUID(),
          ...input,
          sequence: (last?.sequence ?? 0) + 1,
          answered_at: operationTime(row.attempt, last),
        };
        const events: Evento[] = [
          nuevoEvento('RESPUESTA_REGISTRADA', {
            id_respuesta: response.id,
            id_intento: attemptId,
            id_paso: response.step_id,
            id_opcion: response.option_id,
            secuencia: response.sequence,
            tipo_retroalimentacion: option.retroalimentacion.tipo,
          }),
        ];
        const next =
          option.id_paso_siguiente === null ? null : playerView(currentStep(steps, response));
        await attempts.insertResponse(client, attemptId, response);
        let attempt = row.attempt;
        if (!next) {
          const completed = finishAttempt(
            attempt,
            'COMPLETED',
            response.answered_at,
            calculateScore(steps, [...responses, response]),
          );
          attempt = completed.attempt;
          await attempts.finish(client, attempt);
          events.push(completed.event);
        }
        await encolarEventos(client, events);
        return { attempt, response, consequences, feedback, next_step: next, events };
      });
      return {
        ...result,
        synchronization: toSynchronization(await synchronization.aplicarAhora(events)),
      };
    },

    async abandon(userId: string, attemptId: string) {
      const { attempt, event } = await inTransaction(pool, async (client) => {
        const row = await lockOwned(client, userId, attemptId, true);
        const responses = await attempts.listResponses(client, attemptId);
        const abandoned = finishAttempt(
          row.attempt,
          'ABANDONED',
          operationTime(row.attempt, responses.at(-1)),
          null,
        );
        await attempts.finish(client, abandoned.attempt);
        await encolarEventos(client, [abandoned.event]);
        return abandoned;
      });
      return {
        attempt,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },
  };
}
