import type { AttemptResponse } from '@qatok/shared';
import { ErrorApp } from '../lib/errores.js';
import type { crearContenidoRepository } from '../repositories/document/contenido.repository.js';

export type PublishedContent = Pick<ReturnType<typeof crearContenidoRepository>, 'obtenerRevision'>;

export async function loadJourney(
  content: PublishedContent,
  simulationId: string,
  revisionId: string | null,
  responses: AttemptResponse[],
) {
  if (!responses.length) return [];
  const unavailable = () =>
    new ErrorApp(
      'PUBLISHED_CONTENT_UNAVAILABLE',
      503,
      'Published simulation content is unavailable',
    );
  const revision = revisionId ? await content.obtenerRevision(simulationId, revisionId) : null;
  if (!revision) throw unavailable();
  const byId = new Map(revision.pasos.map((step) => [step.id_paso, step]));
  return responses.map((response) => {
    const step = byId.get(response.step_id);
    const optionIndex =
      step?.opciones.findIndex(({ id_opcion }) => id_opcion === response.option_id) ?? -1;
    const option = step?.opciones[optionIndex];
    if (!step || !option) throw unavailable();
    return { step, option, optionIndex, sequence: response.sequence };
  });
}
