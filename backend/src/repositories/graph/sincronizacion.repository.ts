/**
 * Aplicador de eventos de sincronización en Neo4j (backend #7, dueño A; matriz-propiedad.md §5).
 *
 * Cada tipo de evento tiene su script en `database/graph/eventos/<TIPO>.cypher`. Todas sus
 * sentencias corren en **una** transacción de escritura con el payload como parámetros:
 * - todo efecto es un MERGE por id, así que aplicar dos veces da lo mismo;
 * - una sentencia que devuelve la columna `ok` en false revierte la transacción y lanza
 *   `EventoNoAplicable` (p. ej., la respuesta llegó antes que su intento): el procesador deja
 *   el evento PENDIENTE y lo reintenta.
 */
import { TipoEvento } from '@qatok/shared';
import type { Driver } from 'neo4j-driver';
import type { Evento } from '../../sync/eventos.js';
import { leerSentencias } from './cypher.js';

export class EventoNoAplicable extends Error {
  constructor(evento: Pick<Evento, 'id_evento' | 'tipo'>) {
    super(`${evento.tipo} ${evento.id_evento}: faltan sus dependencias en el grafo`);
    this.name = 'EventoNoAplicable';
  }
}

export interface AplicadorGrafo {
  aplicar(evento: Evento): Promise<void>;
}

export function crearAplicadorGrafo(driver: Driver): AplicadorGrafo {
  const scripts = new Map(
    TipoEvento.options.map((tipo) => [tipo, leerSentencias(`eventos/${tipo}.cypher`)] as const),
  );

  return {
    async aplicar(evento) {
      const sentencias = scripts.get(evento.tipo);
      if (!sentencias) throw new Error(`Tipo de evento sin script: ${evento.tipo}`);
      const sesion = driver.session();
      try {
        await sesion.executeWrite(async (tx) => {
          for (const cypher of sentencias) {
            const { records } = await tx.run(cypher, evento.payload);
            if (records.some((r) => r.has('ok') && r.get('ok') !== true)) {
              throw new EventoNoAplicable(evento);
            }
          }
        });
      } finally {
        await sesion.close();
      }
    },
  };
}
