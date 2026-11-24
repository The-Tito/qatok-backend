import {
  comprobarPublicable,
  ErrorContenido,
  type Revision,
} from '../repositories/document/contenido.repository.js';

export const graphLabels = {
  Usuario: ['id_usuario'],
  Habilidad: ['id_habilidad'],
  Simulacion: ['id_simulacion'],
  Paso: ['id_paso'],
  Opcion: ['id_opcion'],
  Intento: ['id_intento'],
  Respuesta: ['id_respuesta'],
  Evidencia: ['id_evidencia'],
  Progreso: ['id_usuario', 'id_habilidad'],
} as const;

export const graphRelationships = [
  'DESARROLLA',
  'CONTIENE',
  'OFRECE',
  'CONDUCE_A',
  'REALIZA',
  'TIENE',
  'REGISTRA',
  'CORRESPONDE_A',
  'SELECCIONA',
  'GENERA',
  'PRODUCE',
  'DEMUESTRA',
  'TIENE_PROGRESO',
] as const;

export type Label = keyof typeof graphLabels;
export type Relationship = (typeof graphRelationships)[number];
export type Properties = Record<string, string | number | boolean>;
export type Node = { key: string; label: Label; properties: Properties; elementId?: string };
export type Edge = {
  key: string;
  type: Relationship;
  from: string;
  to: string;
  properties: Properties;
  elementId?: string;
};
export interface Projection {
  nodes: Node[];
  edges: Edge[];
}
export interface Sources {
  users: { id_usuario: string }[];
  skills: { id_habilidad: string; nombre: string; nivel_objetivo: number | null }[];
  simulations: {
    id_simulacion: string;
    titulo: string;
    estado: 'BORRADOR' | 'PUBLICADA' | 'INACTIVA';
    id_revision_publicada: string | null;
  }[];
  weights: { id_simulacion: string; id_habilidad: string; peso: number; nivel_esperado: number }[];
  attempts: {
    id_intento: string;
    id_usuario: string;
    id_simulacion: string;
    estado: 'EN_CURSO' | 'COMPLETADO' | 'ABANDONADO';
    fecha_inicio: string;
    fecha_fin: string | null;
    puntuacion: number | null;
  }[];
  responses: {
    id_respuesta: string;
    id_intento: string;
    id_paso: string;
    id_opcion: string;
    secuencia: number;
  }[];
  evidence: { id_evidencia: string; id_intento: string; id_usuario: string; titulo: string }[];
}

export function nodeKey(label: Label, properties: Properties) {
  const ids = graphLabels[label].map((property) => properties[property]);
  return ids.every((value) => typeof value === 'string' && value.length > 0)
    ? JSON.stringify([label, ...ids])
    : null;
}

export const edgeKey = (type: Relationship, from: string, to: string) =>
  JSON.stringify([type, from, to]);

export function expectedProjection(sources: Sources, revisions: Revision[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const problems: {
    kind: 'missing_revision' | 'invalid_revision' | 'invalid_response';
    id: string;
  }[] = [];
  function node(label: Label, properties: Properties) {
    const key = nodeKey(label, properties)!;
    nodes.push({ key, label, properties });
    return key;
  }
  function ref(label: Exclude<Label, 'Progreso'>, id: string) {
    return nodeKey(label, { [graphLabels[label][0]]: id })!;
  }
  function edge(type: Relationship, from: string, to: string, properties: Properties = {}) {
    edges.push({ key: edgeKey(type, from, to), type, from, to, properties });
  }

  const revisionsById = new Map(revisions.map((revision) => [revision._id, revision]));
  const responseOptions = new Map<string, Map<string, string>>();
  const weightsBySimulation = new Map<string, Sources['weights']>();
  for (const weight of sources.weights) {
    const list = weightsBySimulation.get(weight.id_simulacion) ?? [];
    list.push(weight);
    weightsBySimulation.set(weight.id_simulacion, list);
  }
  const publishedSimulations = new Set<string>();
  for (const user of sources.users) node('Usuario', user);
  for (const { nivel_objetivo, ...skill } of sources.skills) {
    node('Habilidad', { ...skill, ...(nivel_objetivo === null ? {} : { nivel_objetivo }) });
  }
  for (const { id_revision_publicada, ...simulation } of sources.simulations) {
    if (simulation.estado === 'BORRADOR') continue;
    publishedSimulations.add(simulation.id_simulacion);
    const from = node('Simulacion', simulation);
    for (const { id_habilidad, peso, nivel_esperado } of weightsBySimulation.get(
      simulation.id_simulacion,
    ) ?? []) {
      edge('DESARROLLA', from, ref('Habilidad', id_habilidad), { peso, nivel_esperado });
    }
    const revision = id_revision_publicada ? revisionsById.get(id_revision_publicada) : undefined;
    if (revision?.id_simulacion !== simulation.id_simulacion) {
      problems.push({ kind: 'missing_revision', id: simulation.id_simulacion });
      continue;
    }
    try {
      comprobarPublicable(revision.pasos);
    } catch (error) {
      if (!(error instanceof ErrorContenido)) throw error;
      problems.push({ kind: 'invalid_revision', id: revision._id });
      continue;
    }
    const options = new Map<string, string>();
    responseOptions.set(simulation.id_simulacion, options);
    for (const { id_paso, orden, opciones } of revision.pasos) {
      const step = node('Paso', { id_paso, orden });
      edge('CONTIENE', from, step);
      for (const { id_opcion, id_paso_siguiente, retroalimentacion } of opciones) {
        const option = node('Opcion', { id_opcion });
        options.set(JSON.stringify([id_paso, id_opcion]), retroalimentacion.tipo);
        edge('OFRECE', step, option);
        if (id_paso_siguiente) edge('CONDUCE_A', option, ref('Paso', id_paso_siguiente));
      }
    }
  }

  const attemptSimulations = new Map<string, string>();
  const latest = new Map<string, Sources['attempts'][number]>();
  for (const { id_usuario, id_simulacion, fecha_fin, puntuacion, ...attempt } of sources.attempts) {
    // Keep references verifiable even if inconsistent relational data exists.
    if (!publishedSimulations.has(id_simulacion)) {
      problems.push({ kind: 'missing_revision', id: id_simulacion });
      continue;
    }
    const to = node('Intento', {
      ...attempt,
      ...(fecha_fin === null ? {} : { fecha_fin }),
      ...(puntuacion === null ? {} : { puntuacion }),
    });
    attemptSimulations.set(attempt.id_intento, id_simulacion);
    edge('REALIZA', ref('Usuario', id_usuario), to);
    edge('TIENE', ref('Simulacion', id_simulacion), to);
    if (attempt.estado !== 'COMPLETADO' || !fecha_fin || puntuacion === null) continue;
    const group = JSON.stringify([id_usuario, id_simulacion]);
    const old = latest.get(group);
    if (
      !old ||
      fecha_fin > old.fecha_fin! ||
      (fecha_fin === old.fecha_fin && attempt.id_intento > old.id_intento)
    ) {
      latest.set(group, { ...attempt, id_usuario, id_simulacion, fecha_fin, puntuacion });
    }
  }

  for (const { id_intento, id_paso, id_opcion, ...response } of sources.responses) {
    const simulationId = attemptSimulations.get(id_intento);
    const feedback = simulationId
      ? responseOptions.get(simulationId)?.get(JSON.stringify([id_paso, id_opcion]))
      : undefined;
    if (!feedback) {
      problems.push({ kind: 'invalid_response', id: response.id_respuesta });
      continue;
    }
    const to = node('Respuesta', { ...response, tipo_retroalimentacion: feedback });
    edge('REGISTRA', ref('Intento', id_intento), to);
    edge('CORRESPONDE_A', to, ref('Paso', id_paso));
    edge('SELECCIONA', to, ref('Opcion', id_opcion));
  }
  for (const { id_usuario, id_intento, ...evidence } of sources.evidence) {
    const simulationId = attemptSimulations.get(id_intento);
    if (!simulationId) continue;
    const evidenceKey = node('Evidencia', evidence);
    edge('GENERA', ref('Usuario', id_usuario), evidenceKey);
    edge('PRODUCE', ref('Intento', id_intento), evidenceKey);
    for (const { id_habilidad } of weightsBySimulation.get(simulationId) ?? []) {
      edge('DEMUESTRA', evidenceKey, ref('Habilidad', id_habilidad));
    }
  }

  const progress = new Map<
    string,
    {
      id_usuario: string;
      id_habilidad: string;
      date: string;
      weightedCents: number;
      weights: number;
    }
  >();
  for (const attempt of latest.values()) {
    const { id_usuario, id_simulacion, fecha_fin, puntuacion } = attempt;
    for (const { id_habilidad, peso } of weightsBySimulation.get(id_simulacion) ?? []) {
      const key = JSON.stringify([id_usuario, id_habilidad]);
      const entry = progress.get(key) ?? {
        id_usuario,
        id_habilidad,
        date: fecha_fin!,
        weightedCents: 0,
        weights: 0,
      };
      const weight = Math.round(peso * 100);
      entry.weightedCents += Math.round(puntuacion! * 100) * weight;
      entry.weights += weight;
      if (fecha_fin! > entry.date) entry.date = fecha_fin!;
      progress.set(key, entry);
    }
  }
  for (const { id_usuario, id_habilidad, date, weightedCents, weights } of progress.values()) {
    const from = node('Progreso', {
      id_usuario,
      id_habilidad,
      nivel_actual: Math.round(weightedCents / weights) / 100,
      fecha_actualizacion: date,
    });
    edge('TIENE_PROGRESO', ref('Usuario', id_usuario), from);
    edge('CORRESPONDE_A', from, ref('Habilidad', id_habilidad));
  }

  return { projection: { nodes, edges }, problems };
}
