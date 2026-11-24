import { Uuid } from '@qatok/shared';
import { cargarEntorno } from '../config/entorno.js';
import { cerrarConexiones, crearConexiones } from '../db/conexiones.js';
import { crearOutboxRepository } from '../repositories/relational/outbox.repository.js';

async function reactivar() {
  const id = Uuid.safeParse(process.argv[2]);
  if (!id.success || process.argv.length !== 3) {
    throw new Error('Uso: npm run db:sync:reactivar -- <id_evento>');
  }
  const entorno = cargarEntorno();
  if (
    entorno.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '::1'].includes(entorno.POSTGRES_HOST)
  ) {
    throw new Error('La reactivación por este comando solo admite PostgreSQL local de desarrollo.');
  }
  const conexiones = crearConexiones(entorno);
  try {
    if (!(await crearOutboxRepository(conexiones.postgres).reactivarCabeza(id.data))) {
      throw new Error('El evento no es la cabeza fallida o la cola está ocupada.');
    }
    console.warn('Evento reactivado. Se aplicará cuando el consumidor vuelva a revisar la cola.');
  } finally {
    await cerrarConexiones(conexiones);
  }
}

reactivar().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo reactivar el evento.');
  process.exitCode = 1;
});
