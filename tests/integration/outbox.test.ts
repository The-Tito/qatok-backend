import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Pool, type Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import { cerrarConexiones, crearConexiones } from '../../backend/src/db/conexiones.js';
import { crearAplicadorGrafo } from '../../backend/src/repositories/graph/sincronizacion.repository.js';
import {
  crearOutboxRepository,
  encolarEventos,
} from '../../backend/src/repositories/relational/outbox.repository.js';
import { nuevoEvento, type Evento } from '../../backend/src/sync/eventos.js';
import { crearProcesadorSincronizacion } from '../../backend/src/sync/procesador.js';
import {
  conectar,
  eliminarEsquemaDePrueba,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { loggerSilencioso } from '../apoyo/app-de-prueba.js';

let admin: Client;
let esquema: string | undefined;
let pool: Pool;

beforeEach(async () => {
  admin = conectar();
  await admin.connect();
  esquema = await prepararEsquemaDePrueba(admin);
  await admin.query('COMMIT');
  const e = cargarEntorno();
  pool = new Pool({
    host: e.POSTGRES_HOST,
    port: e.POSTGRES_PORT,
    database: e.POSTGRES_DB,
    user: e.POSTGRES_USER,
    password: e.POSTGRES_PASSWORD,
    options: `-c search_path=${esquema}`,
    connectionTimeoutMillis: e.DB_TIMEOUT_MS,
  });
});

afterEach(async () => {
  try {
    await pool?.end();
    if (esquema) await eliminarEsquemaDePrueba(admin, esquema);
  } finally {
    esquema = undefined;
    await admin.end();
  }
});

const usuario = () => nuevoEvento('USUARIO_CREADO', { id_usuario: randomUUID() });

function señal() {
  let avisar!: () => void;
  const promise = new Promise<void>((resolve) => {
    avisar = resolve;
  });
  return { promise, avisar };
}

async function encolar(eventos: Evento[], confirmar = true) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await encolarEventos(cliente, eventos);
    await cliente.query(confirmar ? 'COMMIT' : 'ROLLBACK');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

describe('cola ordenada en PostgreSQL', () => {
  it('un evento revertido no se consume y los huecos no impiden avanzar', async () => {
    const revertido = usuario();
    const confirmado = usuario();
    await encolar([revertido], false);
    await encolar([confirmado]);
    const outbox = crearOutboxRepository(pool);
    const leidos: string[] = [];
    const r = await outbox.procesarCabeza(async ({ evento }) => {
      leidos.push(evento.id_evento);
      return { estado: 'APLICADO' };
    });
    expect(r).toBe('APLICADO');
    expect(leidos).toEqual([confirmado.id_evento]);
    expect(await outbox.estanAplicados([revertido.id_evento])).toBe(false);
  });

  it('el segundo productor espera el commit del primero y el consumo mantiene ese orden', async () => {
    const primero = usuario();
    const segundo = usuario();
    const cliente = await pool.connect();
    let escritura: Promise<void> | undefined;
    const outbox = crearOutboxRepository(pool);
    try {
      await cliente.query('BEGIN');
      await encolarEventos(cliente, [primero]);
      escritura = encolar([segundo]);
      expect(
        await Promise.race([escritura.then(() => 'confirmada'), setTimeout(30, 'en espera')]),
      ).toBe('en espera');
      expect(await outbox.procesarCabeza(async () => ({ estado: 'APLICADO' }))).toBe('VACIA');
      await cliente.query('COMMIT');
      await escritura;
    } finally {
      // Libera al otro productor incluso si falla una aserción.
      await cliente.query('ROLLBACK');
      cliente.release();
      await escritura;
    }
    const leidos: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await outbox.procesarCabeza(async ({ evento }) => {
        leidos.push(evento.id_evento);
        return { estado: 'APLICADO' };
      });
    }
    expect(leidos).toEqual([primero.id_evento, segundo.id_evento]);
  });

  it('dos consumidores no aplican ni saltan la misma cabeza', async () => {
    const a = usuario();
    const b = usuario();
    await encolar([a, b]);
    const primero = crearOutboxRepository(pool);
    const segundo = crearOutboxRepository(pool);
    const entrando = señal();
    const liberar = señal();
    const aplicacion = primero.procesarCabeza(async ({ evento }) => {
      entrando.avisar();
      await liberar.promise;
      expect(evento.id_evento).toBe(a.id_evento);
      return { estado: 'APLICADO' };
    });
    await Promise.race([entrando.promise, aplicacion]);
    try {
      expect(await segundo.procesarCabeza(async () => ({ estado: 'APLICADO' }))).toBe('OCUPADA');
      expect(await segundo.estanAplicados([a.id_evento, b.id_evento])).toBe(false);
    } finally {
      liberar.avisar();
      await aplicacion;
    }
    expect(
      await segundo.procesarCabeza(async ({ evento }) => {
        expect(evento.id_evento).toBe(b.id_evento);
        return { estado: 'APLICADO' };
      }),
    ).toBe('APLICADO');
    expect(await segundo.estanAplicados([a.id_evento, b.id_evento])).toBe(true);
  });

  it('persiste el reintento de la respuesta y una cabeza fallida bloquea el cierre', async () => {
    const id_intento = randomUUID();
    const respuesta = nuevoEvento('RESPUESTA_REGISTRADA', {
      id_respuesta: randomUUID(),
      id_intento,
      id_paso: randomUUID(),
      id_opcion: randomUUID(),
      secuencia: 1,
      tipo_retroalimentacion: 'ACIERTO',
    });
    const cierre = nuevoEvento('INTENTO_FINALIZADO', {
      id_intento,
      estado: 'COMPLETADO',
      fecha_fin: new Date().toISOString(),
      puntuacion: 80,
    });
    await encolar([respuesta, cierre]);
    let ahora = Date.now();
    let caer = true;
    const vistos: string[] = [];
    const opciones = { logger: loggerSilencioso, ahora: () => ahora, maxIntentos: 2 };
    const aplicador = {
      async aplicar(evento: Evento) {
        vistos.push(evento.id_evento);
        if (caer) throw new Error('Grafo no disponible');
      },
    };
    const a = crearProcesadorSincronizacion(crearOutboxRepository(pool), aplicador, opciones);
    expect(await a.aplicarAhora([respuesta, cierre])).toMatchObject({ grafo: 'PENDIENTE' });
    const outbox = crearOutboxRepository(pool);
    const b = crearProcesadorSincronizacion(outbox, aplicador, opciones);
    expect(await b.procesarPendientes()).toMatchObject({ enEspera: 1 });
    expect(vistos).toEqual([respuesta.id_evento]);
    ahora += 2_000;
    expect(await b.procesarPendientes()).toMatchObject({ fallidos: 1 });
    expect(await b.aplicarAhora([cierre])).toMatchObject({ grafo: 'PENDIENTE' });
    expect(vistos).toEqual([respuesta.id_evento, respuesta.id_evento]);
    expect(await outbox.reactivarCabeza(cierre.id_evento)).toBe(false);
    expect(await outbox.reactivarCabeza(respuesta.id_evento)).toBe(true);
    caer = false;
    expect(await b.procesarPendientes()).toMatchObject({ aplicados: 2 });
    expect(vistos.slice(-2)).toEqual([respuesta.id_evento, cierre.id_evento]);
  });

  it('reintenta en Neo4j real después de un fallo de conexión', async () => {
    const entorno = cargarEntorno();
    const fallidas = crearConexiones({ ...entorno, NEO4J_BOLT_PORT: 6 });
    const sanas = crearConexiones(entorno);
    const outbox = crearOutboxRepository(pool);
    const evento = usuario();
    await encolar([evento]);
    try {
      const caido = crearProcesadorSincronizacion(outbox, crearAplicadorGrafo(fallidas.neo4j), {
        logger: loggerSilencioso,
        esperaBaseMs: 0,
      });
      expect(await caido.aplicarAhora([evento])).toMatchObject({ grafo: 'PENDIENTE' });
      const recuperado = crearProcesadorSincronizacion(outbox, crearAplicadorGrafo(sanas.neo4j), {
        logger: loggerSilencioso,
      });
      expect(await recuperado.aplicarAhora([evento])).toMatchObject({ grafo: 'APLICADO' });
      const { records } = await sanas.neo4j.executeQuery(
        'MATCH (u:Usuario {id_usuario: $id_usuario}) RETURN count(u) AS total',
        evento.payload,
      );
      expect(records[0]?.get('total')).toBe(1);
    } finally {
      try {
        await crearAplicadorGrafo(sanas.neo4j).aplicar(
          nuevoEvento('USUARIO_ELIMINADO', evento.payload),
        );
      } finally {
        await Promise.all([cerrarConexiones(fallidas), cerrarConexiones(sanas)]);
      }
    }
  });
});
