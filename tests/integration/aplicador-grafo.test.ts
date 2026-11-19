/**
 * PRUEBAS DEL APLICADOR DE EVENTOS (backend #7): database/graph/eventos/*.cypher a través de
 * backend/src/repositories/graph/sincronizacion.repository.ts. Requiere las bases de Docker
 * (npm run db:up). Deja el grafo reconstruido desde el dataset.
 *
 * La prueba central: el dataset aplicado como eventos sobre un grafo vacío da **exactamente**
 * el mismo grafo que `npm run db:graph:reset` (03-carga + 04-derivados), y aplicarlo otra vez
 * no cambia nada (idempotencia, matriz §5 paso 4).
 */
import type { Driver } from 'neo4j-driver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import { crearConexiones } from '../../backend/src/db/conexiones.js';
import {
  crearAplicadorGrafo,
  EventoNoAplicable,
  type AplicadorGrafo,
} from '../../backend/src/repositories/graph/sincronizacion.repository.js';
import { nuevoEvento, type Evento } from '../../backend/src/sync/eventos.js';
import {
  ejecutarArchivo,
  normalizar,
  reset,
  sentencias,
  vaciar,
} from '../../database/graph/ejecutar.mjs';
import { eventosDelDataset } from '../apoyo/eventos-dataset.js';

const id = (sufijo: string) => `e0000000-0000-4000-8000-00000000${sufijo}`;
const ANA = id('0101');

let driver: Driver;
let aplicador: AplicadorGrafo;
let eventos: Evento[];

/** Todo el grafo como lista ordenada de textos (sin id_progreso, que es aleatorio). */
async function foto(): Promise<string[]> {
  const sinId = (p: Record<string, unknown>) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(normalizar(p) as Record<string, unknown>)
          .filter(([k]) => k !== 'id_progreso')
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  const nodos = await driver.executeQuery(
    'MATCH (n) RETURN labels(n)[0] AS etiqueta, properties(n) AS p',
  );
  const relaciones = await driver.executeQuery(
    'MATCH (a)-[r]->(b) RETURN properties(a) AS a, type(r) AS tipo, properties(r) AS p, properties(b) AS b',
  );
  return [
    ...nodos.records.map((r) => `${r.get('etiqueta')} ${sinId(r.get('p'))}`),
    ...relaciones.records.map(
      (r) => `${sinId(r.get('a'))} -[${r.get('tipo')} ${sinId(r.get('p'))}]-> ${sinId(r.get('b'))}`,
    ),
  ].sort();
}

async function aplicarTodos(lista: Evento[]) {
  for (const e of lista) await aplicador.aplicar(e);
}

/** Grafo vacío con su esquema, construido solo con eventos. */
async function construirConEventos() {
  await vaciar(driver);
  await ejecutarArchivo(driver, 'schema/01-restricciones.cypher');
  await ejecutarArchivo(driver, 'schema/02-indices.cypher');
  await aplicarTodos(eventos);
}

/** Filas con ok = false de un archivo de pruebas de database/graph/tests. */
async function fallosDe(archivo: string) {
  const fallos: string[] = [];
  for (const { cypher } of sentencias(archivo)) {
    const { records } = await driver.executeQuery(cypher);
    for (const r of records) if (r.get('ok') !== true) fallos.push(String(r.get('prueba')));
  }
  return fallos;
}

async function contar(cypher: string, parametros: Record<string, unknown> = {}) {
  const { records } = await driver.executeQuery(`${cypher} RETURN count(*) AS n`, parametros);
  return Number(records[0]?.get('n'));
}

beforeAll(async () => {
  driver = crearConexiones(cargarEntorno()).neo4j;
  aplicador = crearAplicadorGrafo(driver);
  eventos = eventosDelDataset();
}, 60_000);

afterAll(async () => {
  await reset(driver);
  await driver?.close();
}, 60_000);

describe('el dataset como eventos', () => {
  let esperado: string[];

  beforeAll(async () => {
    await reset(driver);
    esperado = await foto();
    await construirConEventos();
  }, 60_000);

  it('construye exactamente el grafo de db:graph:reset (34 nodos, 53 relaciones)', async () => {
    const obtenido = await foto();
    expect(esperado).toHaveLength(34 + 53);
    expect(obtenido).toEqual(esperado);
  });

  it('pasa las pruebas de datos e integridad de database/graph/tests', async () => {
    expect(await fallosDe('tests/02-datos.cypher')).toEqual([]);
    expect(await fallosDe('tests/03-integridad.cypher')).toEqual([]);
  });

  it('aplicar todos los eventos otra vez no cambia nada (idempotencia)', async () => {
    const antes = await foto();
    await aplicarTodos(eventos);
    expect(await foto()).toEqual(antes);
  });

  it('reaplicar INTENTO_INICIADO no devuelve a EN_CURSO un intento finalizado', async () => {
    const iniciado = eventos.find(
      (e) => e.tipo === 'INTENTO_INICIADO' && e.payload.id_intento === id('0701'),
    );
    if (!iniciado) throw new Error('falta el evento');
    await aplicador.aplicar(iniciado);
    expect(
      await contar("MATCH (:Intento {id_intento: $i, estado: 'COMPLETADO'})", { i: id('0701') }),
    ).toBe(1);
  });
});

describe('eventos sobre el grafo cargado', () => {
  beforeAll(async () => {
    await reset(driver);
  }, 60_000);

  it('un evento antes que sus dependencias lanza EventoNoAplicable y no deja nada', async () => {
    const huerfana = nuevoEvento('RESPUESTA_REGISTRADA', {
      id_respuesta: id('0899'),
      id_intento: id('0799'), // intento que el grafo aún no tiene
      id_paso: id('0401'),
      id_opcion: id('0501'),
      secuencia: 1,
      tipo_retroalimentacion: 'ACIERTO',
    });
    await expect(aplicador.aplicar(huerfana)).rejects.toBeInstanceOf(EventoNoAplicable);
    expect(await contar('MATCH (:Respuesta {id_respuesta: $r})', { r: id('0899') })).toBe(0);
  });

  it('INTENTO_FINALIZADO recalcula el Progreso del usuario (DEC-25)', async () => {
    await aplicador.aplicar(
      nuevoEvento('INTENTO_FINALIZADO', {
        id_intento: id('0704'),
        estado: 'COMPLETADO',
        fecha_fin: '2026-11-11T09:20:00.000Z',
        puntuacion: 80,
      }),
    );
    const { records } = await driver.executeQuery(
      `MATCH (:Usuario {id_usuario: $u})-[:TIENE_PROGRESO]->(p:Progreso)-[:CORRESPONDE_A]->(h:Habilidad)
       RETURN h.nombre AS h, p.nivel_actual AS nivel ORDER BY h`,
      { u: ANA },
    );
    // 0704 es ahora el último intento completado de «Tres entregas»: Gestión del tiempo = 80 y
    // Comunicación efectiva = (0.6·92.5 + 0.3·80) / 0.9 = 88.33. Resolución no cambia.
    expect(Object.fromEntries(records.map((r) => [r.get('h'), r.get('nivel')]))).toEqual({
      'Comunicación efectiva': 88.33,
      'Gestión del tiempo': 80,
      'Resolución de conflictos': 92.5,
    });
  });

  it('SIMULACION_ESTADO_CAMBIADO cambia el estado; sin la simulación no es aplicable', async () => {
    await aplicador.aplicar(
      nuevoEvento('SIMULACION_ESTADO_CAMBIADO', { id_simulacion: id('0302'), estado: 'INACTIVA' }),
    );
    expect(
      await contar("MATCH (:Simulacion {id_simulacion: $s, estado: 'INACTIVA'})", {
        s: id('0302'),
      }),
    ).toBe(1);
    await expect(
      aplicador.aplicar(
        nuevoEvento('SIMULACION_ESTADO_CAMBIADO', {
          id_simulacion: id('0303'),
          estado: 'INACTIVA',
        }),
      ),
    ).rejects.toBeInstanceOf(EventoNoAplicable);
  });

  it('EVIDENCIA_GENERADA con un intento de otro usuario no es aplicable (RI-14)', async () => {
    const ajena = nuevoEvento('EVIDENCIA_GENERADA', {
      id_evidencia: id('1199'),
      id_usuario: id('0102'), // Bruno
      id_intento: id('0702'), // intento de Ana
      titulo: 'No es suya',
    });
    await expect(aplicador.aplicar(ajena)).rejects.toBeInstanceOf(EventoNoAplicable);
    expect(await contar('MATCH (:Evidencia {id_evidencia: $e})', { e: id('1199') })).toBe(0);
  });

  it('EVIDENCIA_ELIMINADA borra la evidencia y sus DEMUESTRA; repetirla no falla', async () => {
    const evento = nuevoEvento('EVIDENCIA_ELIMINADA', { id_evidencia: id('1101') });
    await aplicador.aplicar(evento);
    await aplicador.aplicar(evento);
    expect(await contar('MATCH (:Evidencia)')).toBe(0);
    expect(await contar('MATCH ()-[:DEMUESTRA]->()')).toBe(0);
  });

  it('USUARIO_ELIMINADO borra al usuario con sus intentos, respuestas y progresos', async () => {
    await aplicador.aplicar(nuevoEvento('USUARIO_ELIMINADO', { id_usuario: ANA }));
    expect(await contar('MATCH (:Usuario {id_usuario: $u})', { u: ANA })).toBe(0);
    // En el dataset todos los intentos son de Ana.
    expect(await contar('MATCH (n) WHERE n:Intento OR n:Respuesta OR n:Progreso')).toBe(0);
    expect(await contar('MATCH (:Usuario)')).toBe(2);
    expect(await contar('MATCH (:Paso)')).toBe(4); // el contenido publicado no se toca
  });
});
