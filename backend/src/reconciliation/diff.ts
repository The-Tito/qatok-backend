import { isDeepStrictEqual } from 'node:util';
import type { Edge, Node, Projection } from './model.js';

type Diff<T> = { missing: T[]; changed: T[]; extra: T[] };

function diff<T extends Node | Edge>(expected: T[], observed: T[]): Diff<T> {
  const wanted = new Map(expected.map((entry) => [entry.key, entry]));
  const found = new Map<string, T>();
  const extra: T[] = [];
  for (const entry of observed) {
    if (found.has(entry.key) || !wanted.has(entry.key)) extra.push(entry);
    else found.set(entry.key, entry);
  }
  const missing: T[] = [];
  const changed: T[] = [];
  for (const entry of expected) {
    const current = found.get(entry.key);
    if (!current) missing.push(entry);
    else if (!isDeepStrictEqual(entry.properties, current.properties)) changed.push(entry);
  }
  return { missing, changed, extra };
}

export function projectionDiff(expected: Projection, observed: Projection) {
  return {
    nodes: diff(expected.nodes, observed.nodes),
    edges: diff(expected.edges, observed.edges),
  };
}

export type ProjectionDiff = ReturnType<typeof projectionDiff>;
