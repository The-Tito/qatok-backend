/**
 * Procesador de sincronización (backend/src/sync/procesador.ts, matriz §5) con un outbox en
 * memoria y un aplicador falso: sin bases de datos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AplicadorGrafo } from '../../../backend/src/repositories/graph/sincronizacion.repository.js';
import { nuevoEvento, type Evento } from '../../../backend/src/sync/eventos.js';
import {
  crearProcesadorSincronizacion,
  type OpcionesProcesador,
} from '../../../backend/src/sync/procesador.js';
import { loggerSilencioso } from '../../apoyo/app-de-prueba.js';
import { OutboxEnMemoria } from '../../apoyo/outbox-memoria.js';

const id = (sufijo: string) => `e0000000-0000-4000-8000-00000000${sufijo}`;
const usuario = (sufijo: string) => nuevoEvento('USUARIO_CREADO', { id_usuario: id(sufijo) });

/** Aplicador falso: registra lo que aplica y falla con los eventos de `caidos`. */
function aplicadorFalso() {
  const aplicados: string[] = [];
  const caidos = new Set<string>();
  const aplicador: AplicadorGrafo = {
    async aplicar(evento: Evento) {
      if (caidos.has(evento.id_evento)) throw new Error('Neo4j no responde');
      aplicados.push(evento.id_evento);
    },
  };
  return { aplicador, aplicados, caidos };
}

function preparar(opciones: Partial<OpcionesProcesador> = {}) {
  let t = 0;
  const outbox = new OutboxEnMemoria();
  const falso = aplicadorFalso();
  const procesador = crearProcesadorSincronizacion(outbox, falso.aplicador, {
    logger: loggerSilencioso,
    ahora: () => t,
    ...opciones,
  });
  return { outbox, ...falso, procesador, avanzar: (ms: number) => (t += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('aplicación inmediata', () => {
  it('con el grafo disponible responde APLICADO y marca los eventos', async () => {
    const { outbox, procesador } = preparar();
    const eventos = [usuario('0101'), usuario('0102')];
    outbox.insertar(...eventos);
    expect(await procesador.aplicarAhora(eventos)).toEqual({
      grafo: 'APLICADO',
      eventos: eventos.map((e) => e.id_evento),
    });
    expect(outbox.filas.map((f) => f.estado)).toEqual(['APLICADO', 'APLICADO']);
  });

  it('si uno falla responde PENDIENTE y no intenta los que siguen (orden)', async () => {
    const { outbox, procesador, caidos, aplicados } = preparar();
    const [a, b, c] = [usuario('0101'), usuario('0102'), usuario('0103')];
    outbox.insertar(a, b, c);
    caidos.add(b.id_evento);
    const sincronizacion = await procesador.aplicarAhora([a, b, c]);
    expect(sincronizacion.grafo).toBe('PENDIENTE');
    expect(aplicados).toEqual([a.id_evento]);
    expect(outbox.filas.map((f) => [f.estado, f.intentos])).toEqual([
      ['APLICADO', 0],
      ['PENDIENTE', 1],
      ['PENDIENTE', 0],
    ]);
    expect(outbox.fila(b.id_evento).ultimo_error).toBe('Neo4j no responde');
  });

  it('nunca lanza: si el outbox también falla, responde PENDIENTE', async () => {
    const { outbox, procesador, caidos } = preparar();
    const e = usuario('0101');
    outbox.insertar(e);
    caidos.add(e.id_evento);
    outbox.registrarFallo = () => Promise.reject(new Error('PostgreSQL caído'));
    await expect(procesador.aplicarAhora([e])).resolves.toMatchObject({ grafo: 'PENDIENTE' });
  });

  it('si el grafo se actualizó pero no se pudo marcar, conserva la cabeza pendiente', async () => {
    const { outbox, procesador, aplicados } = preparar();
    const [e, siguiente] = [usuario('0101'), usuario('0102')];
    outbox.insertar(e, siguiente);
    outbox.marcarAplicado = () => Promise.reject(new Error('PostgreSQL caído'));
    expect((await procesador.aplicarAhora([e, siguiente])).grafo).toBe('PENDIENTE');
    expect(outbox.fila(e.id_evento).estado).toBe('PENDIENTE');
    expect(aplicados).toEqual([e.id_evento]);
  });

  it('el envío inmediato nunca aplica un evento ajeno a la cola', async () => {
    const { procesador, aplicados } = preparar();
    expect((await procesador.aplicarAhora([usuario('0101')])).grafo).toBe('PENDIENTE');
    expect(aplicados).toEqual([]);
  });
});

describe('reintento de PENDIENTE', () => {
  it('Neo4j caído → PENDIENTE; vuelve → APLICADO tras la espera (criterio del issue)', async () => {
    const { outbox, procesador, caidos, avanzar } = preparar();
    const e = usuario('0101');
    outbox.insertar(e);
    caidos.add(e.id_evento);
    expect((await procesador.aplicarAhora([e])).grafo).toBe('PENDIENTE');

    caidos.clear(); // Neo4j vuelve
    avanzar(1_000); // la primera espera es de 2 s
    expect(await procesador.procesarPendientes()).toMatchObject({ aplicados: 0, enEspera: 1 });
    avanzar(1_000);
    expect(await procesador.procesarPendientes()).toMatchObject({ aplicados: 1, enEspera: 0 });
    expect(outbox.fila(e.id_evento).estado).toBe('APLICADO');
  });

  it('espera 2, 4, 8 y 16 s entre intentos y marca FALLIDO al quinto', async () => {
    const { outbox, procesador, caidos, avanzar } = preparar();
    const e = usuario('0101');
    outbox.insertar(e);
    caidos.add(e.id_evento);
    await procesador.aplicarAhora([e]); // intento 1 en t = 0

    const intentosEn: number[] = [];
    for (let t = 1; t <= 40; t++) {
      avanzar(1_000);
      const antes = outbox.fila(e.id_evento).intentos;
      await procesador.procesarPendientes();
      if (outbox.fila(e.id_evento).intentos > antes) intentosEn.push(t);
    }
    expect(intentosEn).toEqual([2, 6, 14, 30]); // intentos 2..5
    expect(outbox.fila(e.id_evento)).toMatchObject({ estado: 'FALLIDO', intentos: 5 });
  });

  it('respeta el orden: el siguiente espera mientras el anterior siga PENDIENTE', async () => {
    const { outbox, procesador, caidos, aplicados, avanzar } = preparar({ esperaBaseMs: 0 });
    const [a, b] = [usuario('0101'), usuario('0102')];
    outbox.insertar(a, b);
    caidos.add(a.id_evento);
    expect(await procesador.procesarPendientes()).toMatchObject({ pendientes: 1, aplicados: 0 });
    expect(aplicados).toEqual([]);

    caidos.clear();
    avanzar(1);
    expect(await procesador.procesarPendientes()).toMatchObject({ aplicados: 2 });
    expect(aplicados).toEqual([a.id_evento, b.id_evento]);
  });

  it('un FALLIDO bloquea la cola hasta reactivar la cabeza', async () => {
    const { outbox, procesador, caidos, aplicados } = preparar({ maxIntentos: 1 });
    const [a, b] = [usuario('0101'), usuario('0102')];
    outbox.insertar(a, b);
    caidos.add(a.id_evento);
    expect(await procesador.procesarPendientes()).toMatchObject({ fallidos: 1, aplicados: 0 });
    expect((await procesador.aplicarAhora([b])).grafo).toBe('PENDIENTE');
    expect(aplicados).toEqual([]);
    expect(await outbox.reactivarCabeza(b.id_evento)).toBe(false);
    expect(await outbox.reactivarCabeza(a.id_evento)).toBe(true);
    caidos.clear();
    expect(await procesador.procesarPendientes()).toMatchObject({ aplicados: 2 });
    expect(aplicados).toEqual([a.id_evento, b.id_evento]);
  });

  it('iniciar() revisa periódicamente y detener() lo para', async () => {
    vi.useFakeTimers();
    const { outbox, procesador } = preparar({ intervaloMs: 1_000 });
    const e = usuario('0101');
    outbox.insertar(e);
    procesador.iniciar();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(outbox.fila(e.id_evento).estado).toBe('APLICADO');

    await procesador.detener();
    const f = usuario('0102');
    outbox.insertar(f);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(outbox.fila(f.id_evento).estado).toBe('PENDIENTE');
  });
});
