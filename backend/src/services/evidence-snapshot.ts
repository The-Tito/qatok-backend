import type { EvidenceDetail, SkillVisualType } from '@qatok/shared';
import type { InstantaneaEvidencia } from '../repositories/document/evidencia.repository.js';
import { publicFeedback, publicStepTypes } from './simulation-content.js';

export function toEvidenceSnapshot(
  snapshot: InstantaneaEvidencia,
  visualTypes: Map<string, SkillVisualType | null> = new Map(),
): EvidenceDetail['content'] {
  return {
    description: snapshot.descripcion,
    simulation: { id: snapshot.simulacion.id_simulacion, title: snapshot.simulacion.titulo },
    score: snapshot.puntuacion,
    created_at: snapshot.creado_en.toISOString(),
    skills: snapshot.habilidades.map(({ id_habilidad, nombre }) => ({
      id: id_habilidad,
      name: nombre,
      visual_type: visualTypes.get(id_habilidad) ?? null,
    })),
    decisions: snapshot.decisiones.map((decision) => ({
      sequence: decision.secuencia,
      step: { title: decision.paso.titulo, type: publicStepTypes[decision.paso.tipo] },
      option: decision.opcion,
      consequences: decision.consecuencias,
      feedback_type: publicFeedback[decision.retroalimentacion_tipo],
    })),
  };
}
