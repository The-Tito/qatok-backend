import { cargarEntorno } from '../config/entorno.js';
import { cerrarConexiones, crearConexiones } from '../db/conexiones.js';

// Ana López (dataset). El evento es de ella para que su perfil muestre «Actualizando tu progreso…».
const ID_USUARIO = 'e0000000-0000-4000-8000-000000000101';
const ID_EVENTO = 'e0000000-0000-4000-8000-000000009001';

async function ejecutar() {
  const accion = process.argv[2];
  if ((accion !== 'crear' && accion !== 'quitar') || process.argv.length !== 3) {
    throw new Error('Uso: npm run db:sync:pendiente -- crear|quitar');
  }
  const entorno = cargarEntorno();
  if (
    entorno.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '::1'].includes(entorno.POSTGRES_HOST)
  ) {
    throw new Error('Este comando solo admite PostgreSQL local de desarrollo.');
  }
  const conexiones = crearConexiones(entorno);
  try {
    if (accion === 'crear') {
      // Con el siguiente intento a un día, el consumidor no lo aplica y el aviso se mantiene.
      await conexiones.postgres.query(
        `INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload, proximo_intento)
         VALUES ($1, 'USUARIO_CREADO', $2, $3::jsonb, now() + interval '1 day')
         ON CONFLICT (id_evento) DO NOTHING`,
        [ID_EVENTO, ID_USUARIO, JSON.stringify({ id_usuario: ID_USUARIO })],
      );
      console.warn(
        'Evento pendiente creado: el perfil de Ana mostrará la sincronización pendiente.',
      );
    } else {
      await conexiones.postgres.query(
        "DELETE FROM evento_sincronizacion WHERE id_evento = $1 AND estado = 'PENDIENTE'",
        [ID_EVENTO],
      );
      console.warn('Evento pendiente de desarrollo eliminado.');
    }
  } finally {
    await cerrarConexiones(conexiones);
  }
}

ejecutar().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo ejecutar el comando.');
  process.exitCode = 1;
});
