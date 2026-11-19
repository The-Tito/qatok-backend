/**
 * Procesador de sincronización hacia Neo4j (backend #7, dueño A; matriz-propiedad.md §5).
 *
 * 1. **Aplicación inmediata:** tras el commit en PostgreSQL, el servicio llama a
 *    `aplicarAhora(eventos)` con los eventos que escribió. Si todos se aplican, responde
 *    `grafo: APLICADO`; si alguno falla, queda PENDIENTE y responde `grafo: PENDIENTE`.
 *    Nunca lanza: el cambio ya está confirmado en la base dueña (convenciones: un grafo
 *    pendiente no es un error).
 * 2. **Reintento:** `procesarPendientes()` (cada `intervaloMs` con `iniciar()`) toma los
 *    PENDIENTE en orden estricto de `creado_en`, con espera creciente entre intentos, y los
 *    marca FALLIDO al llegar a `maxIntentos`. Los FALLIDO los retoma la reconciliación.
 *
 * Depende de interfaces: `OutboxRepositorio` (tabla `evento_sincronizacion` de PostgreSQL, B)
 * y `AplicadorGrafo` (Neo4j, A). Aplicar dos veces da lo mismo (MERGE por id), así que un
 * evento aplicado que no se alcanzó a marcar solo se reaplica.
 */
import type { Sincronizacion } from '@qatok/shared';
import type { Logger } from '../lib/logger.js';
import type { AplicadorGrafo } from '../repositories/graph/sincronizacion.repository.js';
import type { Evento } from './eventos.js';

/** Un evento PENDIENTE del outbox con los intentos que lleva. */
export interface EventoPendiente {
  evento: Evento;
  intentos: number;
}

/** Lo que el procesador necesita de la tabla `evento_sincronizacion` (implementación en PG). */
export interface OutboxRepositorio {
  /** Hasta `limite` eventos PENDIENTE en orden de `creado_en` (en PG: FOR UPDATE SKIP LOCKED). */
  tomarPendientes(limite: number): Promise<EventoPendiente[]>;
  /** estado = APLICADO, aplicado_en = ahora. */
  marcarAplicado(idEvento: string): Promise<void>;
  /** intentos + 1, ultimo_error = error y el estado indicado (PENDIENTE o FALLIDO). */
  registrarFallo(idEvento: string, error: string, estado: 'PENDIENTE' | 'FALLIDO'): Promise<void>;
}

export interface OpcionesProcesador {
  logger: Logger;
  /** Intentos totales (incluido el inmediato) antes de marcar FALLIDO. Matriz §5: 5. */
  maxIntentos?: number;
  /** Espera tras el primer fallo; se duplica en cada intento (2 s, 4 s, 8 s, 16 s). */
  esperaBaseMs?: number;
  /** Cada cuánto revisa los PENDIENTE con `iniciar()`. */
  intervaloMs?: number;
  /** Eventos por revisión. */
  lote?: number;
  /** Reloj inyectable para las pruebas. */
  ahora?: () => number;
}

export interface ResumenProceso {
  aplicados: number;
  pendientes: number;
  fallidos: number;
  /** PENDIENTE del lote que no se intentaron en esta revisión (espera creciente u orden). */
  enEspera: number;
}

export interface ProcesadorSincronizacion {
  aplicarAhora(eventos: Evento[]): Promise<Sincronizacion>;
  procesarPendientes(): Promise<ResumenProceso>;
  iniciar(): void;
  detener(): Promise<void>;
}

const mensaje = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

  /** Momento a partir del cual se puede reintentar cada evento (en memoria: si el proceso
   *  se reinicia, los PENDIENTE se reintentan de inmediato, lo que es seguro). */
  const siguienteIntento = new Map<string, number>();
  let temporizador: NodeJS.Timeout | undefined;
  let enCurso: Promise<unknown> | undefined;

  /** Registra un fallo y decide si el evento sigue PENDIENTE o pasa a FALLIDO. */
  async function fallo(evento: Evento, intentosPrevios: number, error: unknown) {
    const intentos = intentosPrevios + 1;
    const estado = intentos >= maxIntentos ? 'FALLIDO' : 'PENDIENTE';
    await outbox.registrarFallo(evento.id_evento, mensaje(error), estado);
    if (estado === 'PENDIENTE') {
      siguienteIntento.set(evento.id_evento, ahora() + esperaBaseMs * 2 ** (intentos - 1));
    } else {
      siguienteIntento.delete(evento.id_evento);
    }
    logger.warn(
      { id_evento: evento.id_evento, tipo: evento.tipo, intentos, estado, error: mensaje(error) },
      'evento de sincronización sin aplicar en el grafo',
    );
    return estado;
  }

  async function aplicarAhora(eventos: Evento[]): Promise<Sincronizacion> {
    const ids = eventos.map((e) => e.id_evento);
    for (const evento of eventos) {
      try {
        await aplicador.aplicar(evento);
      } catch (error) {
        // Se detiene en el primero que falla: los siguientes pueden depender de él y se
        // quedan PENDIENTE (sin contar intento) para respetar el orden.
        try {
          await fallo(evento, 0, error);
        } catch (errorOutbox) {
          logger.error({ error: mensaje(errorOutbox) }, 'no se pudo registrar el fallo');
        }
        return { grafo: 'PENDIENTE', eventos: ids };
      }
      try {
        await outbox.marcarAplicado(evento.id_evento);
      } catch (errorOutbox) {
        // El grafo sí está al día; el reintento lo reaplicará (idempotente) y lo marcará.
        logger.error({ error: mensaje(errorOutbox) }, 'no se pudo marcar el evento APLICADO');
      }
    }
    return { grafo: 'APLICADO', eventos: ids };
  }

  async function procesarPendientes(): Promise<ResumenProceso> {
    const resumen: ResumenProceso = { aplicados: 0, pendientes: 0, fallidos: 0, enEspera: 0 };
    const lista = await outbox.tomarPendientes(lote);
    // Orden estricto de creado_en: si un evento falla o aún espera su turno, los siguientes
    // esperan también (pueden depender de él). El bloqueo es acotado: tras `maxIntentos` el
    // evento pasa a FALLIDO y la cola sigue.
    for (const [posicion, { evento, intentos }] of lista.entries()) {
      if ((siguienteIntento.get(evento.id_evento) ?? 0) > ahora()) {
        resumen.enEspera = lista.length - posicion;
        break;
      }
      try {
        await aplicador.aplicar(evento);
      } catch (error) {
        const estado = await fallo(evento, intentos, error);
        if (estado === 'FALLIDO') {
          resumen.fallidos += 1;
          continue;
        }
        resumen.pendientes += 1;
        resumen.enEspera = lista.length - posicion - 1;
        break;
      }
      await outbox.marcarAplicado(evento.id_evento);
      siguienteIntento.delete(evento.id_evento);
      resumen.aplicados += 1;
    }
    return resumen;
  }

  function revisar() {
    if (enCurso) return; // una revisión a la vez
    enCurso = procesarPendientes()
      .then((r) => {
        if (r.aplicados || r.fallidos) logger.info(r, 'sincronización: eventos procesados');
      })
      .catch((error: unknown) => logger.error({ error: mensaje(error) }, 'sincronización'))
      .finally(() => {
        enCurso = undefined;
      });
  }

  return {
    aplicarAhora,
    procesarPendientes,
    iniciar() {
      if (!temporizador) temporizador = setInterval(revisar, intervaloMs);
    },
    async detener() {
      clearInterval(temporizador);
      temporizador = undefined;
      await enCurso;
    },
  };
}
