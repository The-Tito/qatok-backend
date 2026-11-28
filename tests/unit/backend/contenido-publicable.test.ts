/**
 * Reglas de publicación de un borrador (comprobarPublicable): la causa y el lugar exactos
 * que la API expone en `details` del 409. Sin bases de datos.
 */
import { describe, expect, it } from 'vitest';
import {
  comprobarPublicable,
  ErrorContenido,
  type PasoContenido,
} from '../../../backend/src/repositories/document/contenido.repository.js';

const opcion = (id: string, siguiente: string | null, consecuencias = 1) => ({
  id_opcion: id,
  descripcion: id,
  valoracion: 1,
  id_paso_siguiente: siguiente,
  consecuencias: Array.from({ length: consecuencias }, () => ({
    descripcion: 'x',
    impacto: 'NEUTRO' as const,
    tipo: 'TIEMPO' as const,
  })),
  retroalimentacion: { tipo: 'ACIERTO' as const, comentario: 'x', recomendacion: 'x' },
});
const paso = (id: string, orden: number, opciones: ReturnType<typeof opcion>[]) =>
  ({ id_paso: id, orden, opciones }) as unknown as PasoContenido;

function fallo(pasos: PasoContenido[]) {
  try {
    comprobarPublicable(pasos);
  } catch (error) {
    if (error instanceof ErrorContenido) return { codigo: error.codigo, detalle: error.detalle };
    throw error;
  }
  throw new Error('Se esperaba un error de contenido.');
}

describe('comprobarPublicable', () => {
  it('acepta un camino lineal que termina', () => {
    expect(() =>
      comprobarPublicable([paso('a', 1, [opcion('a1', 'b')]), paso('b', 2, [opcion('b1', null)])]),
    ).not.toThrow();
  });

  it('indica cada causa con su paso y opción', () => {
    expect(fallo([])).toEqual({
      codigo: 'CONTENIDO_INCOMPLETO',
      detalle: { reason: 'NO_STEPS' },
    });
    expect(fallo([paso('a', 1, [])])).toEqual({
      codigo: 'CONTENIDO_INCOMPLETO',
      detalle: { reason: 'STEP_WITHOUT_OPTIONS', step_id: 'a' },
    });
    expect(fallo([paso('a', 1, [opcion('a1', null, 0)])])).toEqual({
      codigo: 'CONTENIDO_INCOMPLETO',
      detalle: { reason: 'OPTION_WITHOUT_CONSEQUENCES', step_id: 'a', option_id: 'a1' },
    });
    expect(fallo([paso('a', 2, [opcion('a1', null)])])).toEqual({
      codigo: 'RAMIFICACION_INVALIDA',
      detalle: { reason: 'MISSING_START_STEP' },
    });
    expect(fallo([paso('a', 1, [opcion('a1', 'zzz')])])).toEqual({
      codigo: 'RAMIFICACION_INVALIDA',
      detalle: { reason: 'TARGET_OUTSIDE_SIMULATION', step_id: 'a', option_id: 'a1' },
    });
    expect(fallo([paso('a', 1, [opcion('a1', 'b')]), paso('b', 2, [opcion('b1', 'a')])])).toEqual({
      codigo: 'RAMIFICACION_INVALIDA',
      detalle: { reason: 'CYCLE', step_id: 'b', option_id: 'b1' },
    });
    expect(fallo([paso('a', 1, [opcion('a1', null)]), paso('b', 2, [opcion('b1', null)])])).toEqual(
      { codigo: 'RAMIFICACION_INVALIDA', detalle: { reason: 'UNREACHABLE_STEP', step_id: 'b' } },
    );
  });
});
