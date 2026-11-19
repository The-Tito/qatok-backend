/**
 * PRUEBAS DEL REPOSITORIO DE GRAFO (backend #6): C-01..C-05 a través de
 * backend/src/repositories/graph/perfil.repository.ts, con los mismos casos que
 * `npm run db:graph:probar` (database/graph/tests/esperados.mjs). Requiere las bases de Docker
 * (npm run db:up). Reconstruye el grafo desde el dataset antes de empezar.
 */
import type { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import { crearConexiones } from '../../backend/src/db/conexiones.js';
import {
  cargarConsulta,
  crearPerfilRepositoryGrafo,
  type PerfilRepositoryGrafo,
} from '../../backend/src/repositories/graph/perfil.repository.js';
import { iguales, reset } from '../../database/graph/ejecutar.mjs';
import { CASOS, type CasoConsulta } from '../../database/graph/tests/esperados.mjs';

let driver: Driver;
let repo: PerfilRepositoryGrafo;

beforeAll(async () => {
  driver = crearConexiones(cargarEntorno()).neo4j;
  await reset(driver);
  repo = crearPerfilRepositoryGrafo(driver);
}, 60_000);

afterAll(async () => {
  await driver?.close();
});

const texto = (p: Record<string, unknown>, clave: string) => String(p[clave]);

/** Llama al método del repositorio que corresponde a la consulta y devuelve sus filas. */
async function ejecutar({ consulta, parametros: p }: CasoConsulta): Promise<unknown[]> {
  const usuario = texto(p, 'idUsuario');
  const sinFila = <T>(x: T | null) => (x === null ? [] : [x]);
  switch (consulta) {
    case 'C-01-recomendaciones.cypher':
      return repo.recomendaciones(usuario, Number(p.limite));
    case 'C-02-fortalezas.cypher':
      return repo.habilidades(usuario);
    case 'C-03-recorrido.cypher':
      return sinFila(await repo.recorrido(usuario, texto(p, 'idIntento')));
    case 'C-04-evidencias.cypher':
      return repo.evidenciasDeHabilidad(usuario, texto(p, 'idHabilidad'));
    case 'C-05-evolucion.cypher':
      return sinFila(await repo.evolucion(usuario, texto(p, 'idHabilidad')));
    default:
      throw new Error(`consulta sin método en el repositorio: ${consulta}`);
  }
}

/** Las fechas esperadas ('…T10:00:00Z') en el formato de la API ('…T10:00:00.000Z'). */
function fechasIso(valor: unknown): unknown {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
    return new Date(valor).toISOString();
  }
  if (Array.isArray(valor)) return valor.map(fechasIso);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, fechasIso(v)]));
  }
  return valor;
}

describe('repositorio de grafo: C-01..C-05 con el dataset común', () => {
  it.each(CASOS.map((c) => [c.caso, c] as const))('%s', async (_caso, c) => {
    const obtenido = await ejecutar(c);
    const esperado = fechasIso(c.esperado);
    // iguales(): números con tolerancia y listas de texto sin importar el orden (collect()).
    expect(iguales(obtenido, esperado), JSON.stringify(obtenido)).toBe(true);
  });

  it('las fechas salen en ISO-8601 UTC con milisegundos (convenciones §3)', async () => {
    const recorrido = await repo.recorrido(
      'e0000000-0000-4000-8000-000000000101',
      'e0000000-0000-4000-8000-000000000701',
    );
    expect(recorrido?.intento.fecha_inicio).toBe('2026-10-01T10:00:00.000Z');
  });

  it('cada consulta es una sola sentencia y está parametrizada', () => {
    for (const archivo of new Set(CASOS.map((c) => c.consulta))) {
      const cypher = cargarConsulta(archivo);
      expect(cypher).toContain('$idUsuario');
      expect(cypher).not.toContain(';');
    }
  });
});
