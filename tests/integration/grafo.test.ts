/**
 * PRUEBAS DEL GRAFO (backend #4): reconstruye Neo4j desde el dataset con el mismo ejecutor de
 * `npm run db:graph:probar` y exige que pasen esquema, datos, integridad y C-01..C-05.
 * Requiere las bases de Docker (npm run db:up). Deja el grafo reconstruido desde el dataset.
 * El informe fechado de docs/pruebas/ lo escribe solo `npm run db:graph:probar`.
 */
import type { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conectar, iguales, probar, type ResultadoProbar } from '../../database/graph/ejecutar.mjs';

let driver: Driver;
let resultado: ResultadoProbar;

beforeAll(async () => {
  driver = conectar();
  resultado = await probar(driver);
}, 60_000);

afterAll(async () => {
  await driver?.close();
});

const delGrupo = (grupo: string) => resultado.resultados.filter((r) => r.grupo === grupo);

describe('grafo Neo4j (matriz v2) cargado desde el dataset', () => {
  it('db:graph:reset construye 34 nodos y 53 relaciones', () => {
    expect(resultado.grafo).toEqual({ nodos: 34, relaciones: 53 });
  });

  it.each(['esquema', 'datos', 'integridad', 'consultas'])('pruebas de %s en verde', (grupo) => {
    const filas = delGrupo(grupo);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.filter((r) => !r.ok)).toEqual([]);
  });
});

describe('comparación de resultados de consultas', () => {
  it('tolera el error de coma flotante y el orden de collect(), no otras diferencias', () => {
    expect(iguales([{ prioridad: 14.000000000000002 }], [{ prioridad: 14 }])).toBe(true);
    expect(iguales({ h: ['b', 'a'] }, { h: ['a', 'b'] })).toBe(true);
    expect(iguales([{ puntuacion: 40 }], [{ puntuacion: 45 }])).toBe(false);
    expect(iguales([{ n: 1 }, { n: 2 }], [{ n: 2 }, { n: 1 }])).toBe(false);
    expect(iguales({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
