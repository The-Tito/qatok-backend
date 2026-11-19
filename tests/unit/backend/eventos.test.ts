/** Catálogo de eventos de sincronización (backend/src/sync/eventos.ts, matriz §5). */
import { TipoEvento } from '@qatok/shared';
import { describe, expect, it } from 'vitest';
import { Evento, nuevoEvento, PAYLOADS } from '../../../backend/src/sync/eventos.js';

const id = (sufijo: string) => `e0000000-0000-4000-8000-00000000${sufijo}`;

describe('catálogo de eventos', () => {
  it('hay un payload por cada TipoEvento de shared (los 11 de la matriz §5)', () => {
    expect(Object.keys(PAYLOADS).sort()).toEqual([...TipoEvento.options].sort());
  });

  it('nuevoEvento genera id_evento y toma id_entidad de la entidad principal', () => {
    const e = nuevoEvento('RESPUESTA_REGISTRADA', {
      id_respuesta: id('0801'),
      id_intento: id('0701'),
      id_paso: id('0401'),
      id_opcion: id('0501'),
      secuencia: 1,
      tipo_retroalimentacion: 'ACIERTO',
    });
    expect(e.id_entidad).toBe(id('0801'));
    expect(e.id_evento).toMatch(/^[0-9a-f-]{36}$/);
    expect(Evento.parse(e)).toEqual(e);
  });

  it('cada evento recibe un id_evento distinto', () => {
    const p = { id_usuario: id('0101') };
    expect(nuevoEvento('USUARIO_CREADO', p).id_evento).not.toBe(
      nuevoEvento('USUARIO_CREADO', p).id_evento,
    );
  });

  it('COMPLETADO exige puntuación y ABANDONADO no la lleva', () => {
    const base = { id_intento: id('0701'), fecha_fin: '2026-10-01T10:14:00.000Z' };
    expect(() =>
      nuevoEvento('INTENTO_FINALIZADO', { ...base, estado: 'COMPLETADO', puntuacion: null }),
    ).toThrow();
    expect(() =>
      nuevoEvento('INTENTO_FINALIZADO', { ...base, estado: 'ABANDONADO', puntuacion: 40 }),
    ).toThrow();
    expect(
      nuevoEvento('INTENTO_FINALIZADO', { ...base, estado: 'COMPLETADO', puntuacion: 92.5 })
        .id_entidad,
    ).toBe(id('0701'));
  });

  it('rechaza payloads fuera de rango o incompletos antes de llegar al outbox', () => {
    const publicada = {
      id_simulacion: id('0301'),
      titulo: 'Cliente molesto por un retraso',
      habilidades: [{ id_habilidad: id('0201'), peso: 0, nivel_esperado: 70 }],
      pasos: [
        {
          id_paso: id('0401'),
          orden: 1,
          opciones: [{ id_opcion: id('0501'), id_paso_siguiente: null }],
        },
      ],
    };
    expect(() => nuevoEvento('SIMULACION_PUBLICADA', publicada)).toThrow(); // peso 0 (RI: 0 < peso ≤ 1)
    expect(() =>
      nuevoEvento('SIMULACION_PUBLICADA', { ...publicada, habilidades: [], pasos: [] }),
    ).toThrow(); // RI-17
    expect(() =>
      nuevoEvento('SIMULACION_ESTADO_CAMBIADO', {
        id_simulacion: id('0301'),
        // @ts-expect-error BORRADOR nunca llega al grafo
        estado: 'BORRADOR',
      }),
    ).toThrow();
  });

  it('Evento rechaza un tipo desconocido o un payload que no es de su tipo', () => {
    const sobre = { id_evento: id('9901'), id_entidad: id('0101') };
    expect(Evento.safeParse({ ...sobre, tipo: 'OTRO', payload: {} }).success).toBe(false);
    expect(
      Evento.safeParse({ ...sobre, tipo: 'USUARIO_CREADO', payload: { id_habilidad: id('0201') } })
        .success,
    ).toBe(false);
  });
});
