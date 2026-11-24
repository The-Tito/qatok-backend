import type { SimulationStep } from '@qatok/shared';
import type { PasoContenido } from '../repositories/document/contenido.repository.js';

const impacts = { POSITIVE: 'POSITIVO', NEUTRAL: 'NEUTRO', NEGATIVE: 'NEGATIVO' } as const;
const consequences = {
  RELATIONSHIP: 'RELACIONAL',
  TIME: 'TIEMPO',
  QUALITY: 'CALIDAD',
  REPUTATION: 'REPUTACION',
} as const;
const feedback = { CORRECT: 'ACIERTO', PARTIAL: 'PARCIAL', INCORRECT: 'ERROR' } as const;
const severities = { LOW: 'BAJA', MEDIUM: 'MEDIA', HIGH: 'ALTA' } as const;

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries((Object.keys(map) as K[]).map((key) => [map[key], key])) as Record<
    V,
    K
  >;
}
const publicImpacts = invert(impacts);
const publicConsequences = invert(consequences);
const publicFeedback = invert(feedback);
const publicSeverities = invert(severities);

export function toStoredStep(step: SimulationStep): PasoContenido {
  const base = {
    id_paso: step.id,
    orden: step.order,
    titulo: step.title,
    descripcion: step.description,
    opciones: step.options.map((option) => ({
      id_opcion: option.id,
      descripcion: option.description,
      valoracion: option.score,
      id_paso_siguiente: option.next_step_id,
      consecuencias: option.consequences.map((c) => ({
        ...(c.id === undefined ? {} : { id_consecuencia: c.id }),
        descripcion: c.description,
        impacto: impacts[c.impact],
        tipo: consequences[c.type],
      })),
      retroalimentacion: {
        tipo: feedback[option.feedback.type],
        comentario: option.feedback.comment,
        recomendacion: option.feedback.recommendation,
      },
    })),
  };
  switch (step.type) {
    case 'EMAIL':
      return {
        ...base,
        tipo: 'CORREO',
        contexto: {
          remitente: step.context.sender,
          asunto: step.context.subject,
          cuerpo: step.context.body,
        },
      };
    case 'MEETING':
      return {
        ...base,
        tipo: 'REUNION',
        contexto: { participantes: step.context.participants, agenda: step.context.agenda },
      };
    case 'CONVERSATION':
      return {
        ...base,
        tipo: 'CONVERSACION',
        contexto: {
          interlocutor: step.context.interlocutor,
          lineas: step.context.lines.map(({ speaker, text }) => ({ quien: speaker, texto: text })),
        },
      };
    case 'TASK':
      return {
        ...base,
        tipo: 'TAREA',
        contexto: {
          entregables: step.context.deliverables,
          plazo_horas: step.context.deadline_hours,
        },
      };
    case 'INCIDENT':
      return {
        ...base,
        tipo: 'INCIDENTE',
        contexto: {
          cronologia: step.context.timeline.map(({ time, event }) => ({
            momento: time,
            hecho: event,
          })),
          severidad: severities[step.context.severity],
        },
      };
  }
}

export function toPublicStep(step: PasoContenido): SimulationStep {
  const base = {
    id: step.id_paso,
    order: step.orden,
    title: step.titulo,
    description: step.descripcion,
    options: step.opciones.map((option) => ({
      id: option.id_opcion,
      description: option.descripcion,
      score: option.valoracion,
      next_step_id: option.id_paso_siguiente,
      consequences: option.consecuencias.map((c) => ({
        ...(c.id_consecuencia === undefined ? {} : { id: c.id_consecuencia }),
        description: c.descripcion,
        impact: publicImpacts[c.impacto],
        type: publicConsequences[c.tipo],
      })),
      feedback: {
        type: publicFeedback[option.retroalimentacion.tipo],
        comment: option.retroalimentacion.comentario,
        recommendation: option.retroalimentacion.recomendacion,
      },
    })),
  };
  switch (step.tipo) {
    case 'CORREO':
      return {
        ...base,
        type: 'EMAIL',
        context: {
          sender: step.contexto.remitente,
          subject: step.contexto.asunto,
          body: step.contexto.cuerpo,
        },
      };
    case 'REUNION':
      return {
        ...base,
        type: 'MEETING',
        context: { participants: step.contexto.participantes, agenda: step.contexto.agenda },
      };
    case 'CONVERSACION':
      return {
        ...base,
        type: 'CONVERSATION',
        context: {
          interlocutor: step.contexto.interlocutor,
          lines: step.contexto.lineas.map(({ quien, texto }) => ({ speaker: quien, text: texto })),
        },
      };
    case 'TAREA':
      return {
        ...base,
        type: 'TASK',
        context: {
          deliverables: step.contexto.entregables,
          deadline_hours: step.contexto.plazo_horas,
        },
      };
    case 'INCIDENTE':
      return {
        ...base,
        type: 'INCIDENT',
        context: {
          timeline: step.contexto.cronologia.map(({ momento, hecho }) => ({
            time: momento,
            event: hecho,
          })),
          severity: publicSeverities[step.contexto.severidad],
        },
      };
  }
}
