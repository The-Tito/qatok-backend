import type { Account, AttemptPath, ProfileSkill } from '@qatok/shared';
import type { Pool } from 'pg';
import { baseNoDisponible, ErrorApp } from '../lib/errores.js';
import type { crearEvidenciaRepository } from '../repositories/document/evidencia.repository.js';
import type {
  HabilidadPerfil,
  PerfilRepositoryGrafo,
  Recomendacion,
} from '../repositories/graph/perfil.repository.js';
import type { createAttemptRepository } from '../repositories/relational/attempt.repository.js';
import type { CatalogRepository } from '../repositories/relational/catalog.repository.js';
import type {
  createEvidenceRepository,
  createProfileRepository,
} from '../repositories/relational/evidence.repository.js';
import { inTransaction } from '../repositories/relational/transaction.js';
import { loadJourney, type PublishedContent } from './journey.js';
import { toPublicStep } from './simulation-content.js';

const attemptStatuses = {
  IN_PROGRESS: 'EN_CURSO',
  COMPLETED: 'COMPLETADO',
  ABANDONED: 'ABANDONADO',
};
const classifications = {
  FORTALEZA: 'STRENGTH',
  AREA_DE_MEJORA: 'AREA_FOR_IMPROVEMENT',
  SIN_REFERENCIA: 'NO_REFERENCE',
} as const;
const asSkill = (row: HabilidadPerfil): ProfileSkill => ({
  id: row.id_habilidad,
  name: row.nombre,
  current_level: row.nivel_actual,
  target: row.objetivo,
  classification: classifications[row.clasificacion],
  correct: row.aciertos,
  partial: row.parciales,
  incorrect: row.errores,
});

async function available<T>(
  database: 'grafo' | 'documental',
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (baseNoDisponible(error) === database) return null;
    throw error;
  }
}

export function createProfileService({
  pool,
  attempts,
  catalog,
  profile,
  records,
  snapshots,
  graph,
  content,
}: {
  pool: Pool;
  attempts: ReturnType<typeof createAttemptRepository>;
  catalog: CatalogRepository;
  profile: ReturnType<typeof createProfileRepository>;
  records: ReturnType<typeof createEvidenceRepository>;
  snapshots: ReturnType<typeof crearEvidenciaRepository>;
  graph: PerfilRepositoryGrafo;
  content: PublishedContent;
}) {
  async function hydrateRecommendations(rows: Recomendacion[]) {
    const simulations = await catalog.findPublishedByIds(
      rows.map((row) => row.simulacion.id_simulacion),
    );
    const byId = new Map(simulations.map((simulation) => [simulation.id, simulation]));
    return rows.flatMap((row) => {
      const simulation = byId.get(row.simulacion.id_simulacion);
      return simulation
        ? [{ simulation, skills_to_improve: row.habilidades_a_reforzar, priority: row.prioridad }]
        : [];
    });
  }

  return {
    async get(user: Account) {
      const graphs = available('grafo', () =>
        Promise.all([graph.habilidades(user.id), graph.recomendaciones(user.id, 5)]),
      );
      const recent = records.list(user.id, 5, 0, null).then(async ({ items }) => {
        const documents = await available('documental', () =>
          snapshots.obtenerVarias(items.map(({ id }) => id)),
        );
        if (documents === null) return null;
        const byId = new Map(documents.map((document) => [document._id, document.descripcion]));
        return {
          incomplete: items.some(({ id }) => !byId.has(id)),
          items: items.flatMap(({ id, attempt_id, title, generated_at, visibility }) => {
            const description = byId.get(id);
            return description === undefined
              ? []
              : [{ id, attempt_id, title, generated_at, visibility, description }];
          }),
        };
      });
      const [{ pending_sync_count, ...summary }, graphData, evidenceData] = await Promise.all([
        profile.summary(user.id),
        graphs,
        recent,
      ]);
      const incomplete_data: ('graph' | 'document')[] = [];
      if (!graphData) incomplete_data.push('graph');
      if (!evidenceData || evidenceData.incomplete) incomplete_data.push('document');
      return {
        user: { id: user.id, name: user.name },
        summary,
        skills: graphData?.[0].map(asSkill) ?? [],
        recommendations: graphData ? await hydrateRecommendations(graphData[1]) : [],
        recent_evidence: evidenceData?.items ?? [],
        incomplete_data,
        pending_sync_count,
      };
    },

    async skills(userId: string) {
      return { items: (await graph.habilidades(userId)).map(asSkill) };
    },

    async recommendations(userId: string, limit: number) {
      return { items: await hydrateRecommendations(await graph.recomendaciones(userId, limit)) };
    },

    async evolution(userId: string, skillId: string) {
      const row = await graph.evolucion(userId, skillId);
      if (!row) throw new ErrorApp('NOT_FOUND', 404, 'Skill evolution not found');
      return {
        current_level: row.nivel_actual,
        points: row.puntos.map((point) => ({
          finished_at: point.fecha,
          simulation: { id: point.id_simulacion, title: point.titulo },
          score: point.puntuacion,
          weight: point.peso,
        })),
      };
    },

    async path(userId: string, attemptId: string): Promise<AttemptPath> {
      const { attempt, revision_id, responses } = await inTransaction(pool, async (client) => {
        const row = await attempts.lockOwned(client, userId, attemptId, false);
        if (!row) throw new ErrorApp('NOT_FOUND', 404, 'Attempt not found');
        return { ...row, responses: await attempts.listResponses(client, attemptId) };
      });
      const [projected, journey] = await Promise.all([
        graph.recorrido(userId, attemptId),
        loadJourney(content, attempt.simulation_id, revision_id, responses),
      ]);
      const projectedDecisions = projected?.decisiones ?? [];
      const graph_pending =
        !projected ||
        projected.intento.estado !== attemptStatuses[attempt.status] ||
        projected.intento.puntuacion !== attempt.score ||
        projected.intento.fecha_fin !== attempt.finished_at ||
        projectedDecisions.length !== journey.length ||
        journey.some(({ step, option, sequence }, index) => {
          const decision = projectedDecisions[index];
          return (
            decision?.secuencia !== sequence ||
            decision.id_paso !== step.id_paso ||
            decision.id_opcion !== option.id_opcion ||
            decision.tipo_retroalimentacion !== option.retroalimentacion.tipo
          );
        });
      return {
        attempt,
        graph_pending,
        decisions: journey.map(({ step, optionIndex, sequence }) => {
          const publicStep = toPublicStep(step);
          const { id, description, consequences, feedback } = publicStep.options[optionIndex]!;
          return {
            sequence,
            step: { id: publicStep.id, title: publicStep.title, type: publicStep.type },
            option: { id, description },
            consequences,
            feedback,
          };
        }),
      };
    },
  };
}
