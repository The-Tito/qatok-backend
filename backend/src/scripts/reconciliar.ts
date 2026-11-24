import { parseArgs } from 'node:util';
import { cargarEntorno } from '../config/entorno.js';
import { cerrarConexiones, crearConexiones } from '../db/conexiones.js';
import { crearLogger } from '../lib/logger.js';
import { reconcile } from '../reconciliation/service.js';

async function main() {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean' }, 'rebuild-graph': { type: 'boolean' } },
  });
  const entorno = cargarEntorno();
  const local = new Set(['localhost', '127.0.0.1', '::1']);
  if (
    values.apply &&
    (entorno.NODE_ENV === 'production' ||
      ![entorno.POSTGRES_HOST, entorno.MONGO_HOST, entorno.NEO4J_HOST].every((host) =>
        local.has(host),
      ))
  ) {
    throw new Error('La reparación por este comando solo admite bases locales de desarrollo.');
  }
  const connections = crearConexiones(entorno);
  try {
    // Los logs del consumidor van aparte; stdout contiene solo el informe.
    const report = await reconcile(connections, crearLogger({ NODE_ENV: 'test' }), {
      apply: values.apply ?? false,
      rebuild: values['rebuild-graph'],
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.consistent) process.exitCode = 2;
  } finally {
    await cerrarConexiones(connections);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo reconciliar.');
  process.exitCode = 1;
});
