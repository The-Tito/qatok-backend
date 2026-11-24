import type { Pool, PoolClient } from 'pg';
import { Evento } from '../../sync/eventos.js';
import type { DecisionCabeza, OutboxRepositorio, ResultadoCabeza } from '../../sync/procesador.js';

const ESPACIO_COLA = 1363235919;
const PRODUCTOR = 1;
const CONSUMIDOR = 2;

/** Llamar al final de la transacción de negocio y esperar antes de hacer COMMIT. */
export async function encolarEventos(cliente: PoolClient, eventos: Evento[]): Promise<void> {
  if (eventos.length === 0) return;
  const validos = eventos.map((evento) => Evento.parse(evento));
  await cliente.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
    ESPACIO_COLA,
    PRODUCTOR,
  ]);
  for (const e of validos) {
    await cliente.query(
      `INSERT INTO evento_sincronizacion (id_evento, tipo, id_entidad, payload)
       VALUES ($1, $2, $3, $4)`,
      [e.id_evento, e.tipo, e.id_entidad, e.payload],
    );
  }
}

type FilaCabeza = {
  id_evento: string;
  tipo: string;
  id_entidad: string;
  payload: unknown;
  estado: 'PENDIENTE' | 'FALLIDO';
  intentos: number;
  proximo_intento: Date | null;
};

export function crearOutboxRepository(pool: Pool): OutboxRepositorio {
  async function conBloqueo<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T | null> {
    const cliente = await pool.connect();
    let descartar = false;
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query<{ disponible: boolean }>(
        'SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS disponible',
        [ESPACIO_COLA, CONSUMIDOR],
      );
      const resultado = rows[0]?.disponible ? await trabajo(cliente) : null;
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => {
        descartar = true;
      });
      throw error;
    } finally {
      cliente.release(descartar);
    }
  }

  async function obtenerCabeza(cliente: PoolClient) {
    const { rows } = await cliente.query<FilaCabeza>(
      `SELECT id_evento, tipo, id_entidad, payload, estado, intentos, proximo_intento
       FROM evento_sincronizacion WHERE estado <> 'APLICADO' ORDER BY orden_cola LIMIT 1`,
    );
    return rows[0];
  }

  async function registrar(cliente: PoolClient, idEvento: string, decision: DecisionCabeza) {
    if (decision.estado === 'APLICADO') {
      await cliente.query(
        `UPDATE evento_sincronizacion SET estado = 'APLICADO', aplicado_en = clock_timestamp(),
           proximo_intento = NULL, ultimo_error = NULL WHERE id_evento = $1`,
        [idEvento],
      );
    } else {
      await cliente.query(
        `UPDATE evento_sincronizacion SET estado = $2, intentos = intentos + 1,
           ultimo_error = $3, proximo_intento = $4 WHERE id_evento = $1`,
        [idEvento, decision.estado, decision.error, decision.proximoIntento],
      );
    }
  }

  return {
    async procesarCabeza(decidir) {
      const resultado = await conBloqueo<ResultadoCabeza>(async (cliente) => {
        const fila = await obtenerCabeza(cliente);
        if (!fila) return 'VACIA';
        if (fila.estado === 'FALLIDO') return 'BLOQUEADA';
        const decision = await decidir({
          evento: Evento.parse(fila),
          intentos: fila.intentos,
          proximoIntento: fila.proximo_intento,
        });
        if (!decision) return 'EN_ESPERA';
        await registrar(cliente, fila.id_evento, decision);
        return decision.estado;
      });
      return resultado ?? 'OCUPADA';
    },

    async estanAplicados(ids) {
      if (ids.length === 0) return true;
      const { rows } = await pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total FROM evento_sincronizacion
         WHERE id_evento = ANY($1::uuid[]) AND estado = 'APLICADO'`,
        [ids],
      );
      return rows[0]?.total === new Set(ids).size;
    },

    async reactivarCabeza(idEvento) {
      const resultado = await conBloqueo(async (cliente) => {
        const fila = await obtenerCabeza(cliente);
        if (fila?.id_evento !== idEvento || fila.estado !== 'FALLIDO') return false;
        await cliente.query(
          `UPDATE evento_sincronizacion SET estado = 'PENDIENTE', intentos = 0,
             ultimo_error = NULL, proximo_intento = NULL WHERE id_evento = $1`,
          [idEvento],
        );
        return true;
      });
      return resultado === true;
    },
  };
}
