import type { Attempt, AttemptQuery, AttemptResponse } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';

const storageStatus = {
  IN_PROGRESS: 'EN_CURSO',
  COMPLETED: 'COMPLETADO',
  ABANDONED: 'ABANDONADO',
};

const attemptJson = `jsonb_build_object(
  'id', i.id_intento, 'simulation_id', i.id_simulacion,
  'status', CASE i.estado WHEN 'EN_CURSO' THEN 'IN_PROGRESS'
                WHEN 'COMPLETADO' THEN 'COMPLETED' ELSE 'ABANDONED' END,
  'started_at', to_char(i.fecha_inicio AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'finished_at', to_char(i.fecha_fin AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'score', i.puntuacion
)`;

export function createAttemptRepository(pool: Pool) {
  return {
    async lockSimulation(client: PoolClient, simulationId: string) {
      const { rows } = await client.query<{ status: string; revision_id: string | null }>(
        `SELECT estado AS status, id_revision_publicada AS revision_id
         FROM simulacion WHERE id_simulacion = $1 FOR UPDATE`,
        [simulationId],
      );
      return rows[0] ?? null;
    },

    async findActiveId(client: PoolClient, userId: string, simulationId: string) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id_intento AS id FROM intento
         WHERE id_usuario = $1 AND id_simulacion = $2 AND estado = 'EN_CURSO'`,
        [userId, simulationId],
      );
      return rows[0]?.id ?? null;
    },

    async insert(client: PoolClient, userId: string, attempt: Attempt) {
      await client.query(
        `INSERT INTO intento (id_intento, id_usuario, id_simulacion, fecha_inicio, estado)
         VALUES ($1, $2, $3, $4, 'EN_CURSO')`,
        [attempt.id, userId, attempt.simulation_id, attempt.started_at],
      );
    },

    async list(userId: string, query: z.output<typeof AttemptQuery>) {
      const { rows } = await pool.query<{ items: Attempt[]; total: number }>(
        `WITH matching AS (
           SELECT * FROM intento WHERE id_usuario = $1 AND ($2::text IS NULL OR estado = $2)
         ), page AS (
           SELECT * FROM matching ORDER BY fecha_inicio DESC, id_intento LIMIT $3 OFFSET $4
         )
         SELECT (SELECT count(*)::integer FROM matching) AS total,
           COALESCE(jsonb_agg(${attemptJson} ORDER BY i.fecha_inicio DESC, i.id_intento), '[]'::jsonb) AS items
         FROM page i`,
        [userId, query.status ? storageStatus[query.status] : null, query.limit, query.offset],
      );
      return rows[0]!;
    },

    async lockOwned(client: PoolClient, userId: string, attemptId: string, write: boolean) {
      const { rows } = await client.query<{ attempt: Attempt; revision_id: string | null }>(
        `SELECT ${attemptJson} AS attempt, s.id_revision_publicada AS revision_id
         FROM intento i JOIN simulacion s USING (id_simulacion)
         WHERE i.id_usuario = $1 AND i.id_intento = $2 FOR ${write ? 'UPDATE' : 'SHARE'} OF i`,
        [userId, attemptId],
      );
      return rows[0] ?? null;
    },

    async listResponses(client: PoolClient, attemptId: string) {
      const { rows } = await client.query<
        Omit<AttemptResponse, 'answered_at'> & { answered_at: Date }
      >(
        `SELECT id_respuesta AS id, id_paso AS step_id, id_opcion AS option_id,
                secuencia AS sequence, fecha_respuesta AS answered_at
         FROM respuesta WHERE id_intento = $1 ORDER BY secuencia`,
        [attemptId],
      );
      return rows.map((row) => ({ ...row, answered_at: row.answered_at.toISOString() }));
    },

    async insertResponse(client: PoolClient, attemptId: string, response: AttemptResponse) {
      await client.query(
        `INSERT INTO respuesta (id_respuesta, id_intento, id_paso, id_opcion, secuencia, fecha_respuesta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          response.id,
          attemptId,
          response.step_id,
          response.option_id,
          response.sequence,
          response.answered_at,
        ],
      );
    },

    async finish(client: PoolClient, attempt: Attempt) {
      await client.query(
        'UPDATE intento SET estado = $2, fecha_fin = $3, puntuacion = $4 WHERE id_intento = $1',
        [attempt.id, storageStatus[attempt.status], attempt.finished_at, attempt.score],
      );
    },
  };
}
