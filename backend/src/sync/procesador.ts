import type { Sincronizacion } from '@qatok/shared';
import type { Logger } from '../lib/logger.js';
import type { AplicadorGrafo } from '../repositories/graph/sincronizacion.repository.js';
import type { Evento } from './eventos.js';

export interface EventoPendiente {
  evento: Evento;
  intentos: number;
  proximoIntento: Date | null;
}

export type DecisionCabeza =
  | { estado: 'APLICADO' }
  | { estado: 'PENDIENTE' | 'FALLIDO'; error: string; proximoIntento: Date | null };

export type ResultadoCabeza =
  DecisionCabeza['estado'] | 'VACIA' | 'BLOQUEADA' | 'EN_ESPERA' | 'OCUPADA';

export interface OutboxRepositorio {
  /** Mantiene el bloqueo de consumidor hasta confirmar la decisión en PostgreSQL. */
  procesarCabeza(
    decidir: (cabeza: EventoPendiente) => Promise<DecisionCabeza | null>,
  ): Promise<ResultadoCabeza>;
  estanAplicados(ids: string[]): Promise<boolean>;
  reactivarCabeza(idEvento: string): Promise<boolean>;
}

export interface OpcionesProcesador {
  logger: Logger;
  maxIntentos?: number;
  esperaBaseMs?: number;
  intervaloMs?: number;
  lote?: number;
  ahora?: () => number;
}

export interface ResumenProceso {
  aplicados: number;
  pendientes: number;
  fallidos: number;
  enEspera: number;
}

export interface ProcesadorSincronizacion {
  aplicarAhora(eventos: Evento[]): Promise<Sincronizacion>;
  procesarPendientes(): Promise<ResumenProceso>;
  iniciar(): void;
  detener(): Promise<void>;
}

export function crearProcesadorSincronizacion(
  outbox: OutboxRepositorio,
  aplicador: AplicadorGrafo,
  opciones: OpcionesProcesador,
): ProcesadorSincronizacion {
  const {
    logger,
    maxIntentos = 5,
    esperaBaseMs = 2_000,
    intervaloMs = 3_000,
    lote = 50,
    ahora = Date.now,
  } = opciones;
  let temporizador: NodeJS.Timeout | undefined;
  let enCurso: Promise<void> | undefined;

  async function decidir({
    evento,
    intentos,
    proximoIntento,
  }: EventoPendiente): Promise<DecisionCabeza | null> {
    if (proximoIntento && proximoIntento.getTime() > ahora()) return null;
    try {
      await aplicador.aplicar(evento);
      return { estado: 'APLICADO' };
    } catch (error) {
      const siguiente = intentos + 1;
      const estado = siguiente >= maxIntentos ? 'FALLIDO' : 'PENDIENTE';
      const detalle = (error instanceof Error ? error.message : 'Error de sincronización').slice(
        0,
        500,
      );
      logger.warn(
        { id_evento: evento.id_evento, tipo: evento.tipo, intentos: siguiente, estado },
        'evento de sincronización sin aplicar',
      );
      return {
        estado,
        error: detalle,
        proximoIntento:
          estado === 'PENDIENTE' ? new Date(ahora() + esperaBaseMs * 2 ** intentos) : null,
      };
    }
  }

  async function procesar(limite: number): Promise<ResumenProceso> {
    const resumen: ResumenProceso = { aplicados: 0, pendientes: 0, fallidos: 0, enEspera: 0 };
    for (let i = 0; i < limite; i += 1) {
      const resultado = await outbox.procesarCabeza(decidir);
      if (resultado === 'APLICADO') {
        resumen.aplicados += 1;
        continue;
      }
      if (resultado === 'PENDIENTE') resumen.pendientes += 1;
      if (resultado === 'FALLIDO') resumen.fallidos += 1;
      if (resultado === 'EN_ESPERA' || resultado === 'BLOQUEADA' || resultado === 'OCUPADA') {
        resumen.enEspera += 1;
      }
      break;
    }
    return resumen;
  }

  async function aplicarAhora(eventos: Evento[]): Promise<Sincronizacion> {
    const ids = eventos.map((evento) => evento.id_evento);
    try {
      if (!(await outbox.estanAplicados(ids))) await procesar(Math.min(lote, ids.length));
      if (await outbox.estanAplicados(ids)) return { grafo: 'APLICADO', eventos: ids };
    } catch {
      logger.error('No se pudo confirmar la sincronización en PostgreSQL.');
    }
    return { grafo: 'PENDIENTE', eventos: ids };
  }

  function revisar() {
    if (enCurso) return;
    enCurso = procesar(lote)
      .then((r) => {
        if (r.aplicados || r.pendientes || r.fallidos)
          logger.info(r, 'sincronización: eventos procesados');
      })
      .catch((error: unknown) => {
        logger.error(
          { error: error instanceof Error ? error.message : 'error inesperado' },
          'sincronización',
        );
      })
      .finally(() => {
        enCurso = undefined;
      });
  }

  return {
    aplicarAhora,
    procesarPendientes: () => procesar(lote),
    iniciar() {
      if (!temporizador) {
        temporizador = setInterval(revisar, intervaloMs);
        revisar();
      }
    },
    async detener() {
      clearInterval(temporizador);
      temporizador = undefined;
      await enCurso;
    },
  };
}
