import { isDeepStrictEqual } from 'node:util';
import { PasoVista, Uuid } from '@qatok/shared';
import {
  MongoNetworkError,
  MongoServerError,
  MongoServerSelectionError,
  MongoWriteConcernError,
  type Db,
} from 'mongodb';

interface Opcion {
  id_opcion: string;
  descripcion: string;
  valoracion: number;
  id_paso_siguiente: string | null;
  consecuencias: {
    id_consecuencia?: string;
    descripcion: string;
    impacto: 'POSITIVO' | 'NEUTRO' | 'NEGATIVO';
    tipo: 'RELACIONAL' | 'TIEMPO' | 'CALIDAD' | 'REPUTACION';
  }[];
  retroalimentacion: {
    tipo: 'ACIERTO' | 'PARCIAL' | 'ERROR';
    comentario: string;
    recomendacion: string;
  };
}

type ConOpciones<P> = P extends { opciones: unknown }
  ? Omit<P, 'opciones'> & { opciones: Opcion[] }
  : never;
export type PasoContenido = ConOpciones<PasoVista>;

export interface Borrador {
  _id: string;
  version: number;
  pasos: PasoContenido[];
}

export interface Revision {
  _id: string;
  id_simulacion: string;
  version: number;
  creado_en: Date;
  pasos: PasoContenido[];
}

export type CausaContenido =
  | 'NO_STEPS'
  | 'STEP_WITHOUT_OPTIONS'
  | 'OPTION_WITHOUT_CONSEQUENCES'
  | 'MISSING_START_STEP'
  | 'CYCLE'
  | 'TARGET_OUTSIDE_SIMULATION'
  | 'UNREACHABLE_STEP';

/** Qué falló al publicar y dónde: la API lo expone en `details` del 409. */
export interface DetalleContenido {
  reason: CausaContenido;
  step_id?: string;
  option_id?: string;
}

export class ErrorContenido extends Error {
  constructor(
    readonly codigo: 'CONTENIDO_INCOMPLETO' | 'RAMIFICACION_INVALIDA' | 'VALIDACION',
    mensaje: string,
    readonly detalle?: DetalleContenido,
  ) {
    super(mensaje);
  }
}

function comprobarUnicidad(pasos: PasoContenido[]) {
  const opciones = pasos.flatMap((paso) => paso.opciones.map((opcion) => opcion.id_opcion));
  const idsPasos = pasos.map((paso) => paso.id_paso);
  const ordenes = pasos.map((paso) => paso.orden);
  if (
    [idsPasos, ordenes, opciones].some(
      (valores) => new Set<string | number>(valores).size !== valores.length,
    )
  ) {
    throw new ErrorContenido(
      'VALIDACION',
      'Los IDs y los órdenes deben ser únicos en el escenario.',
    );
  }
}

export function comprobarPublicable(pasos: PasoContenido[]) {
  comprobarUnicidad(pasos);
  const incompleto = (mensaje: string, detalle: DetalleContenido) =>
    new ErrorContenido('CONTENIDO_INCOMPLETO', mensaje, detalle);
  const invalido = (mensaje: string, detalle: DetalleContenido) =>
    new ErrorContenido('RAMIFICACION_INVALIDA', mensaje, detalle);
  if (pasos.length === 0) {
    throw incompleto('El escenario no tiene pasos.', { reason: 'NO_STEPS' });
  }
  for (const paso of pasos) {
    if (paso.opciones.length === 0) {
      throw incompleto('Cada paso requiere opciones.', {
        reason: 'STEP_WITHOUT_OPTIONS',
        step_id: paso.id_paso,
      });
    }
    const sinConsecuencias = paso.opciones.find((opcion) => opcion.consecuencias.length === 0);
    if (sinConsecuencias) {
      throw incompleto('Cada opción requiere consecuencias.', {
        reason: 'OPTION_WITHOUT_CONSEQUENCES',
        step_id: paso.id_paso,
        option_id: sinConsecuencias.id_opcion,
      });
    }
  }
  const inicial = pasos.find((paso) => paso.orden === 1);
  if (!inicial) {
    throw invalido('Falta el paso inicial.', { reason: 'MISSING_START_STEP' });
  }
  const porId = new Map(pasos.map((paso) => [paso.id_paso, paso]));
  const visitando = new Set<string>();
  const visitados = new Set<string>();

  function visitar(id: string, origen: { step_id: string; option_id: string } | null) {
    if (visitando.has(id)) {
      throw invalido('La ruta contiene un ciclo.', { reason: 'CYCLE', ...origen! });
    }
    if (visitados.has(id)) return;
    const paso = porId.get(id);
    if (!paso) {
      throw invalido('La ruta apunta fuera del escenario.', {
        reason: 'TARGET_OUTSIDE_SIMULATION',
        ...origen!,
      });
    }
    visitando.add(id);
    for (const opcion of paso.opciones) {
      if (opcion.id_paso_siguiente !== null) {
        visitar(opcion.id_paso_siguiente, { step_id: id, option_id: opcion.id_opcion });
      }
    }
    visitando.delete(id);
    visitados.add(id);
  }

  visitar(inicial.id_paso, null);
  const inalcanzable = pasos.find((paso) => !visitados.has(paso.id_paso));
  if (inalcanzable) {
    throw invalido('Hay pasos a los que no se llega desde el inicio.', {
      reason: 'UNREACHABLE_STEP',
      step_id: inalcanzable.id_paso,
    });
  }
}

/** La vista del jugador excluye valoraciones, consecuencias, feedback y destinos. */
export function aPasoVista(paso: PasoContenido): PasoVista {
  return PasoVista.parse({
    id_paso: paso.id_paso,
    orden: paso.orden,
    titulo: paso.titulo,
    descripcion: paso.descripcion,
    tipo: paso.tipo,
    contexto: paso.contexto,
    opciones: paso.opciones.map(({ id_opcion, descripcion }) => ({ id_opcion, descripcion })),
  });
}

function esDuplicado(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

export function crearContenidoRepository(db: Db) {
  const borradores = db.collection<Borrador>('contenidos_simulacion');
  const revisiones = db.collection<Revision>('revisiones_simulacion');

  return {
    obtenerBorrador(idSimulacion: string) {
      return borradores.findOne({ _id: Uuid.parse(idSimulacion) });
    },

    // null expresa creación. Una edición siempre usa la versión que vio el editor.
    async guardarBorrador(idSimulacion: string, version: number | null, pasos: PasoContenido[]) {
      const _id = Uuid.parse(idSimulacion);
      comprobarUnicidad(pasos);
      const borrador: Borrador = { _id, version: (version ?? 0) + 1, pasos };
      if (version === null) {
        try {
          await borradores.insertOne(borrador);
          return borrador;
        } catch (error) {
          if (!esDuplicado(error)) throw error;
          return null;
        }
      }
      const resultado = await borradores.replaceOne({ _id, version }, borrador);
      return resultado.matchedCount === 1 ? borrador : null;
    },

    eliminarBorrador(idSimulacion: string) {
      return borradores.deleteOne({ _id: Uuid.parse(idSimulacion) });
    },

    // Solo se llama con la simulación bloqueada como borrador, o después de borrarla.
    removeUnpublishedRevisions(idSimulation: string, keepVersion?: number) {
      const filter = { id_simulacion: Uuid.parse(idSimulation) };
      return revisiones.deleteMany(
        keepVersion === undefined ? filter : { ...filter, version: { $ne: keepVersion } },
      );
    },

    // La API decidirá si publica la revisión al confirmar PostgreSQL.
    async guardarRevision(idRevision: string, borrador: Borrador, creadoEn = new Date()) {
      const _id = Uuid.parse(idRevision);
      const id_simulacion = Uuid.parse(borrador._id);
      const { version, pasos } = borrador;
      comprobarPublicable(pasos);
      const revision: Revision = { _id, id_simulacion, version, creado_en: creadoEn, pasos };
      try {
        await revisiones.insertOne(revision);
        return revision;
      } catch (error) {
        if (
          !esDuplicado(error) &&
          !(error instanceof MongoNetworkError) &&
          !(error instanceof MongoServerSelectionError) &&
          !(error instanceof MongoWriteConcernError)
        )
          throw error;
        const anterior = await revisiones.findOne({ id_simulacion, version }).catch(() => null);
        if (anterior && isDeepStrictEqual(anterior.pasos, pasos)) return anterior;
        throw error;
      }
    },

    obtenerRevision(idSimulacion: string, idRevision: string) {
      return revisiones.findOne({
        _id: Uuid.parse(idRevision),
        id_simulacion: Uuid.parse(idSimulacion),
      });
    },

    async obtenerPaso(idSimulacion: string, idRevision: string, idPaso?: string) {
      const filtro =
        idPaso === undefined ? { 'pasos.orden': 1 } : { 'pasos.id_paso': Uuid.parse(idPaso) };
      const resultado = await revisiones.findOne(
        { _id: Uuid.parse(idRevision), id_simulacion: Uuid.parse(idSimulacion), ...filtro },
        { projection: { 'pasos.$': 1 } },
      );
      return resultado?.pasos[0] ?? null;
    },
  };
}
