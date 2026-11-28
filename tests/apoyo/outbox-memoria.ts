/**
 * Outbox en memoria con la misma interfaz que tendrá la tabla `evento_sincronizacion`
 * (backend/src/sync/procesador.ts → OutboxRepositorio). Para pruebas sin PostgreSQL y como
 * referencia del comportamiento que debe tener la implementación real.
 */
import type { EstadoEvento } from '@qatok/shared';
import type { Evento } from '../../backend/src/sync/eventos.js';
import type {
  DecisionCabeza,
  EventoPendiente,
  OutboxRepositorio,
  ResultadoCabeza,
} from '../../backend/src/sync/procesador.js';

export interface FilaOutbox {
  evento: Evento;
  estado: EstadoEvento;
  intentos: number;
  ultimo_error: string | null;
  proximoIntento: Date | null;
}

export class OutboxEnMemoria implements OutboxRepositorio {
  /** Conserva el orden de la cola, con FALLIDO incluido. */
  readonly filas: FilaOutbox[] = [];
  private ocupada = false;

  /** Lo que hace el servicio en su transacción: INSERT con estado PENDIENTE. */
  insertar(...eventos: Evento[]) {
    for (const evento of eventos) {
      this.filas.push({
        evento,
        estado: 'PENDIENTE',
        intentos: 0,
        ultimo_error: null,
        proximoIntento: null,
      });
    }
  }

  fila(idEvento: string): FilaOutbox {
    const fila = this.filas.find((f) => f.evento.id_evento === idEvento);
    if (!fila) throw new Error(`evento desconocido: ${idEvento}`);
    return fila;
  }

  async procesarCabeza(
    decidir: (cabeza: EventoPendiente) => Promise<DecisionCabeza | null>,
  ): Promise<ResultadoCabeza> {
    if (this.ocupada) return 'OCUPADA';
    const cabeza = this.filas.find((f) => f.estado !== 'APLICADO');
    if (!cabeza) return 'VACIA';
    if (cabeza.estado === 'FALLIDO') return 'BLOQUEADA';
    this.ocupada = true;
    try {
      const decision = await decidir(cabeza);
      if (!decision) return 'EN_ESPERA';
      if (decision.estado === 'APLICADO') await this.marcarAplicado(cabeza.evento.id_evento);
      else {
        await this.registrarFallo(
          cabeza.evento.id_evento,
          decision.error,
          decision.estado,
          decision.proximoIntento,
        );
      }
      return decision.estado;
    } finally {
      this.ocupada = false;
    }
  }

  async estanAplicados(ids: string[]) {
    return ids.every((id) =>
      this.filas.some((f) => f.evento.id_evento === id && f.estado === 'APLICADO'),
    );
  }

  async reactivarCabeza(idEvento: string) {
    if (this.ocupada) return false;
    const cabeza = this.filas.find((f) => f.estado !== 'APLICADO');
    if (cabeza?.estado !== 'FALLIDO' || cabeza.evento.id_evento !== idEvento) return false;
    Object.assign(cabeza, {
      estado: 'PENDIENTE',
      intentos: 0,
      ultimo_error: null,
      proximoIntento: null,
    });
    return true;
  }

  async marcarAplicado(idEvento: string) {
    Object.assign(this.fila(idEvento), {
      estado: 'APLICADO',
      ultimo_error: null,
      proximoIntento: null,
    });
  }

  async registrarFallo(
    idEvento: string,
    error: string,
    estado: 'PENDIENTE' | 'FALLIDO',
    proximoIntento: Date | null,
  ) {
    const fila = this.fila(idEvento);
    fila.intentos += 1;
    fila.ultimo_error = error;
    fila.estado = estado;
    fila.proximoIntento = proximoIntento;
  }
}
