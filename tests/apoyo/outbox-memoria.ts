/**
 * Outbox en memoria con la misma interfaz que tendrá la tabla `evento_sincronizacion`
 * (backend/src/sync/procesador.ts → OutboxRepositorio). Para pruebas sin PostgreSQL y como
 * referencia del comportamiento que debe tener la implementación real.
 */
import type { EstadoEvento } from '@qatok/shared';
import type { Evento } from '../../backend/src/sync/eventos.js';
import type { EventoPendiente, OutboxRepositorio } from '../../backend/src/sync/procesador.js';

export interface FilaOutbox {
  evento: Evento;
  estado: EstadoEvento;
  intentos: number;
  ultimo_error: string | null;
}

export class OutboxEnMemoria implements OutboxRepositorio {
  /** En orden de inserción = orden de `creado_en`. */
  readonly filas: FilaOutbox[] = [];

  /** Lo que hace el servicio en su transacción: INSERT con estado PENDIENTE. */
  insertar(...eventos: Evento[]) {
    for (const evento of eventos) {
      this.filas.push({ evento, estado: 'PENDIENTE', intentos: 0, ultimo_error: null });
    }
  }

  fila(idEvento: string): FilaOutbox {
    const fila = this.filas.find((f) => f.evento.id_evento === idEvento);
    if (!fila) throw new Error(`evento desconocido: ${idEvento}`);
    return fila;
  }

  async tomarPendientes(limite: number): Promise<EventoPendiente[]> {
    return this.filas
      .filter((f) => f.estado === 'PENDIENTE')
      .slice(0, limite)
      .map(({ evento, intentos }) => ({ evento, intentos }));
  }

  async marcarAplicado(idEvento: string) {
    this.fila(idEvento).estado = 'APLICADO';
  }

  async registrarFallo(idEvento: string, error: string, estado: 'PENDIENTE' | 'FALLIDO') {
    const fila = this.fila(idEvento);
    fila.intentos += 1;
    fila.ultimo_error = error;
    fila.estado = estado;
  }
}
