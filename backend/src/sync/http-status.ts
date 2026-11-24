import type { Sincronizacion, Synchronization } from '@qatok/shared';
import type { z } from 'zod';

export function toSynchronization(status: Sincronizacion): z.output<typeof Synchronization> {
  return {
    graph: status.grafo === 'APLICADO' ? 'APPLIED' : 'PENDING',
    event_ids: status.eventos,
  };
}
