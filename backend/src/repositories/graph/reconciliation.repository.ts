import neo4j, { type Driver, type Transaction } from 'neo4j-driver';
import type { ProjectionDiff } from '../../reconciliation/diff.js';
import {
  edgeKey,
  graphLabels,
  graphRelationships,
  nodeKey,
  type Edge,
  type Label,
  type Node,
  type Projection,
  type Properties,
  type Relationship,
} from '../../reconciliation/model.js';
import { leerSentencias } from './cypher.js';
import { aPlano } from './perfil.repository.js';

const labels = Object.keys(graphLabels) as Label[];
const relationshipTypes = [...graphRelationships];
const progressId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function identity(variable: string, label: Label, source: string) {
  return `(${variable}:${label} {${graphLabels[label].map((key) => `${key}: ${source}.${key}`).join(', ')}})`;
}

const integers = new Set(['orden', 'secuencia', 'nivel_objetivo', 'nivel_esperado']);
const datetimes = new Set(['fecha_inicio', 'fecha_fin', 'fecha_actualizacion']);
function pack(properties: Properties) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (integers.has(key) && typeof value === 'number') return [key, neo4j.int(value)];
      if (datetimes.has(key) && typeof value === 'string') {
        return [key, neo4j.DateTime.fromStandardDate(new Date(value))];
      }
      return [key, value];
    }),
  );
}

async function inspect(tx: Transaction): Promise<Projection> {
  const data = await tx.run(
    `MATCH (n) WHERE any(label IN labels(n) WHERE label IN $labels)
     RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties`,
    { labels },
  );
  const known = new Set<string>();
  const nodes: Node[] = data.records.map((record) => {
    const managed = (record.get('labels') as string[]).filter((label): label is Label =>
      Object.hasOwn(graphLabels, label),
    );
    const label = managed[0]!;
    const elementId = record.get('elementId') as string;
    const properties = aPlano(record.get('properties')) as Properties;
    const { id_progreso, ...comparable } = properties;
    const id = managed.length === 1 ? nodeKey(label, properties) : null;
    const key = id && !known.has(id) ? id : null;
    if (key) known.add(key);
    // El ID interno de Progreso no forma parte de su identidad derivada.
    const progress =
      label === 'Progreso' && typeof id_progreso === 'string' && progressId.test(id_progreso);
    return {
      label,
      elementId,
      key: key ?? `invalid:${elementId}`,
      properties: progress
        ? comparable
        : { ...properties, ...(label === 'Progreso' ? { invalid_progress_id: true } : {}) },
    };
  });
  const byId = new Map(nodes.map((node) => [node.elementId, node.key]));
  const links = await tx.run(
    `MATCH (a)-[r]->(b) WHERE type(r) IN $types
       AND any(label IN labels(a) WHERE label IN $labels)
       AND any(label IN labels(b) WHERE label IN $labels)
     RETURN elementId(a) AS from, elementId(b) AS to, type(r) AS type,
            elementId(r) AS elementId, properties(r) AS properties`,
    { types: relationshipTypes, labels },
  );
  const edges: Edge[] = links.records.map((record) => {
    const from = byId.get(record.get('from') as string)!;
    const to = byId.get(record.get('to') as string)!;
    const type = record.get('type') as Relationship;
    const elementId = record.get('elementId') as string;
    return {
      key: edgeKey(type, from, to),
      from,
      to,
      type,
      elementId,
      properties: aPlano(record.get('properties')) as Properties,
    };
  });
  return { nodes, edges };
}

async function mergeNodes(tx: Transaction, nodes: Node[]) {
  const changedSkills = nodes.filter((node) => node.label === 'Habilidad');
  if (changedSkills.length) {
    // Libera los nombres en conjunto para admitir intercambios de nombres sin romper el índice.
    await tx.run('MATCH (n:Habilidad) WHERE n.id_habilidad IN $ids REMOVE n.nombre', {
      ids: changedSkills.map(({ properties }) => properties.id_habilidad),
    });
  }
  for (const label of labels) {
    const rows = nodes
      .filter((node) => node.label === label)
      .map(({ properties }) => pack(properties));
    if (!rows.length) continue;
    const replacement =
      label === 'Progreso'
        ? `WITH n, row, CASE WHEN toString(n.id_progreso) =~ $progressId
           THEN n.id_progreso ELSE randomUUID() END AS id
         SET n = row SET n.id_progreso = id`
        : 'SET n = row';
    await tx.run(`UNWIND $rows AS row MERGE ${identity('n', label, 'row')} ${replacement}`, {
      rows,
      progressId: progressId.source,
    });
  }
}

async function mergeEdges(tx: Transaction, edges: Edge[], expected: Projection) {
  const nodes = new Map(expected.nodes.map((node) => [node.key, node]));
  const groups = new Map<
    string,
    {
      type: Relationship;
      from: Label;
      to: Label;
      rows: Record<string, unknown>[];
    }
  >();
  for (const edge of edges) {
    const from = nodes.get(edge.from)!;
    const to = nodes.get(edge.to)!;
    const key = JSON.stringify([edge.type, from.label, to.label]);
    const group = groups.get(key) ?? { type: edge.type, from: from.label, to: to.label, rows: [] };
    group.rows.push({
      from: from.properties,
      to: to.properties,
      properties: pack(edge.properties),
    });
    groups.set(key, group);
  }
  for (const { type, from, to, rows } of groups.values()) {
    await tx.run(
      `UNWIND $rows AS row
       MATCH ${identity('a', from, 'row.from')}, ${identity('b', to, 'row.to')}
       MERGE (a)-[r:${type}]->(b) SET r = row.properties`,
      { rows },
    );
  }
}

async function apply(
  tx: Transaction,
  expected: Projection,
  diff: ProjectionDiff,
  rebuild: boolean,
) {
  if (rebuild) {
    await tx.run('MATCH (n) WHERE any(label IN labels(n) WHERE label IN $labels) DETACH DELETE n', {
      labels,
    });
    await mergeNodes(tx, expected.nodes);
    await mergeEdges(tx, expected.edges, expected);
    return;
  }
  if (diff.edges.extra.length) {
    await tx.run('MATCH ()-[r]->() WHERE elementId(r) IN $ids DELETE r', {
      ids: diff.edges.extra.map((edge) => edge.elementId),
    });
  }
  if (diff.nodes.extra.length) {
    await tx.run('MATCH (n) WHERE elementId(n) IN $ids DETACH DELETE n', {
      ids: diff.nodes.extra.map((node) => node.elementId),
    });
  }
  await mergeNodes(tx, [...diff.nodes.missing, ...diff.nodes.changed]);
  await mergeEdges(tx, [...diff.edges.missing, ...diff.edges.changed], expected);
}

export function createGraphReconciliation(driver: Driver) {
  return {
    async ensureSchema() {
      const session = driver.session();
      try {
        for (const file of ['schema/01-restricciones.cypher', 'schema/02-indices.cypher']) {
          for (const statement of leerSentencias(file))
            await (
              await session.run(statement)
            ).summary;
        }
        await session.run('CALL db.awaitIndexes(30)');
      } finally {
        await session.close();
      }
    },
    async run<T>(
      write: boolean,
      work: (graph: {
        inspect(): Promise<Projection>;
        apply(expected: Projection, diff: ProjectionDiff, rebuild: boolean): Promise<void>;
      }) => Promise<T>,
    ) {
      const session = driver.session({
        defaultAccessMode: write ? neo4j.session.WRITE : neo4j.session.READ,
      });
      try {
        const tx = session.beginTransaction({ timeout: 30_000 });
        try {
          const result = await work({
            inspect: () => inspect(tx),
            apply: (expected, diff, rebuild) => apply(tx, expected, diff, rebuild),
          });
          await tx.commit();
          return result;
        } finally {
          await tx.close();
        }
      } finally {
        await session.close();
      }
    },
  };
}
