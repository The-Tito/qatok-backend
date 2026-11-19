/**
 * Catálogo de eventos de sincronización hacia Neo4j (matriz-propiedad.md §5; backend #7, dueño A).
 *
 * Contrato entre quien escribe en PostgreSQL y el aplicador del grafo: cada servicio (F1 de B,
 * F2 de C, F3a de A) inserta en `evento_sincronizacion`, en la misma transacción que su cambio,
 * un evento creado con `nuevoEvento(tipo, payload)`. El payload lleva **solo** lo que el grafo
 * guarda (matriz §3): ids y las propiedades que filtran C-01..C-05; nunca textos largos ni correos.
 *
 * Los tipos de evento son el catálogo `TipoEvento` de @qatok/shared.
 */
import { randomUUID } from 'node:crypto';
import { FechaIso, Nivel, TipoRetroalimentacion, Uuid, type TipoEvento } from '@qatok/shared';
import { z } from 'zod';

const Entero1 = z.number().int().min(1);

const Opcion = z.object({
  id_opcion: Uuid,
  /** `null` = opción terminal (RI-23): no hay CONDUCE_A. */
  id_paso_siguiente: Uuid.nullable(),
});

const Paso = z.object({ id_paso: Uuid, orden: Entero1, opciones: z.array(Opcion).min(1) });

const Desarrolla = z.object({
  id_habilidad: Uuid,
  peso: z.number().gt(0).max(1),
  nivel_esperado: z.number().int().min(0).max(100),
});

/** Payload de cada tipo. Su clave de entidad (`id_entidad`) la da `ID_ENTIDAD`. */
export const PAYLOADS = {
  USUARIO_CREADO: z.object({ id_usuario: Uuid }),
  USUARIO_ELIMINADO: z.object({ id_usuario: Uuid }),
  HABILIDAD_GUARDADA: z.object({
    id_habilidad: Uuid,
    nombre: z.string().min(1),
    nivel_objetivo: z.number().int().min(0).max(100).nullable(),
  }),
  HABILIDAD_ELIMINADA: z.object({ id_habilidad: Uuid }),
  /** La estructura publicada (RI-17 ya validada al publicar): pasos, opciones y DESARROLLA. */
  SIMULACION_PUBLICADA: z.object({
    id_simulacion: Uuid,
    titulo: z.string().min(1),
    habilidades: z.array(Desarrolla).min(1),
    pasos: z.array(Paso).min(1),
  }),
  SIMULACION_ESTADO_CAMBIADO: z.object({
    id_simulacion: Uuid,
    estado: z.enum(['PUBLICADA', 'INACTIVA']),
  }),
  INTENTO_INICIADO: z.object({
    id_intento: Uuid,
    id_usuario: Uuid,
    id_simulacion: Uuid,
    fecha_inicio: FechaIso,
  }),
  /** `tipo_retroalimentacion` = el de la opción elegida (lo lee el servicio del contenido). */
  RESPUESTA_REGISTRADA: z.object({
    id_respuesta: Uuid,
    id_intento: Uuid,
    id_paso: Uuid,
    id_opcion: Uuid,
    secuencia: Entero1,
    tipo_retroalimentacion: TipoRetroalimentacion,
  }),
  /** COMPLETADO lleva puntuación (C11); ABANDONADO no. */
  INTENTO_FINALIZADO: z
    .object({
      id_intento: Uuid,
      estado: z.enum(['COMPLETADO', 'ABANDONADO']),
      fecha_fin: FechaIso,
      puntuacion: Nivel.nullable(),
    })
    .refine((p) => (p.estado === 'COMPLETADO') === (p.puntuacion !== null), {
      message: 'COMPLETADO requiere puntuacion y ABANDONADO no la lleva',
      path: ['puntuacion'],
    }),
  EVIDENCIA_GENERADA: z.object({
    id_evidencia: Uuid,
    id_usuario: Uuid,
    id_intento: Uuid,
    titulo: z.string().min(1),
  }),
  EVIDENCIA_ELIMINADA: z.object({ id_evidencia: Uuid }),
} satisfies Record<TipoEvento, z.ZodType>;

export type PayloadDe<T extends TipoEvento> = z.infer<(typeof PAYLOADS)[T]>;

/** Id de la entidad principal de cada evento (columna `id_entidad`, para reconciliar y auditar). */
const ID_ENTIDAD: { [T in TipoEvento]: (p: PayloadDe<T>) => string } = {
  USUARIO_CREADO: (p) => p.id_usuario,
  USUARIO_ELIMINADO: (p) => p.id_usuario,
  HABILIDAD_GUARDADA: (p) => p.id_habilidad,
  HABILIDAD_ELIMINADA: (p) => p.id_habilidad,
  SIMULACION_PUBLICADA: (p) => p.id_simulacion,
  SIMULACION_ESTADO_CAMBIADO: (p) => p.id_simulacion,
  INTENTO_INICIADO: (p) => p.id_intento,
  RESPUESTA_REGISTRADA: (p) => p.id_respuesta,
  INTENTO_FINALIZADO: (p) => p.id_intento,
  EVIDENCIA_GENERADA: (p) => p.id_evidencia,
  EVIDENCIA_ELIMINADA: (p) => p.id_evidencia,
};

const sobre = <T extends TipoEvento>(tipo: T) =>
  z.object({
    id_evento: Uuid,
    tipo: z.literal(tipo),
    id_entidad: Uuid,
    payload: PAYLOADS[tipo],
  });

/** Un evento del outbox (columnas id_evento, tipo, id_entidad, payload). */
export const Evento = z.discriminatedUnion('tipo', [
  sobre('USUARIO_CREADO'),
  sobre('USUARIO_ELIMINADO'),
  sobre('HABILIDAD_GUARDADA'),
  sobre('HABILIDAD_ELIMINADA'),
  sobre('SIMULACION_PUBLICADA'),
  sobre('SIMULACION_ESTADO_CAMBIADO'),
  sobre('INTENTO_INICIADO'),
  sobre('RESPUESTA_REGISTRADA'),
  sobre('INTENTO_FINALIZADO'),
  sobre('EVIDENCIA_GENERADA'),
  sobre('EVIDENCIA_ELIMINADA'),
]);
export type Evento = z.infer<typeof Evento>;
export type EventoDe<T extends TipoEvento> = Extract<Evento, { tipo: T }>;

/**
 * Crea un evento listo para insertar en `evento_sincronizacion`. Valida el payload: un payload
 * mal formado es un error de programación y debe fallar antes del commit, no en el grafo.
 */
export function nuevoEvento<T extends TipoEvento>(tipo: T, payload: PayloadDe<T>): EventoDe<T> {
  const valido = PAYLOADS[tipo].parse(payload) as PayloadDe<T>;
  return {
    id_evento: randomUUID(),
    tipo,
    id_entidad: ID_ENTIDAD[tipo](valido),
    payload: valido,
  } as EventoDe<T>;
}
