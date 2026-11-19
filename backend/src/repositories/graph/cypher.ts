/**
 * Lectura de los scripts Cypher de `database/graph/` (fuente única del Cypher del grafo).
 * Misma convención que `database/graph/ejecutar.mjs`: se quitan las líneas de comentario y
 * cada sentencia termina en ';' al final de una línea.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GRAFO = fileURLToPath(new URL('../../../../database/graph/', import.meta.url));

/** Sentencias de un script, relativo a `database/graph/` (p. ej. `queries/C-01-….cypher`). */
export function leerSentencias(relativo: string): string[] {
  const sentencias: string[] = [];
  let actual: string[] = [];
  for (const linea of readFileSync(`${GRAFO}${relativo}`, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('//')) continue;
    actual.push(linea);
    if (limpia.endsWith(';')) {
      sentencias.push(actual.join('\n').replace(/;\s*$/, ''));
      actual = [];
    }
  }
  if (actual.length) throw new Error(`${relativo}: la última sentencia no termina en ';'`);
  if (sentencias.length === 0) throw new Error(`${relativo}: no tiene sentencias`);
  return sentencias;
}
