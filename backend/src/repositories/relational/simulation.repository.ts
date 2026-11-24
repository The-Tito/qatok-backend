import type { AdminSimulation, AdminSimulationQuery, SimulationInput } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { storageDifficulty, summary } from './catalog.repository.js';

const storageStatus = { DRAFT: 'BORRADOR', PUBLISHED: 'PUBLICADA', INACTIVE: 'INACTIVA' };
type Metadata = z.output<typeof SimulationInput>;
type SimulationRow = {
  simulation: AdminSimulation;
  revision_id: string | null;
};

export function createSimulationRepository(pool: Pool) {
  return {
    async list(filters: z.output<typeof AdminSimulationQuery>) {
      const { rows } = await pool.query<{ items: AdminSimulation[]; total: number }>(
        `WITH matching AS (
           SELECT * FROM simulacion WHERE $1::text IS NULL OR estado = $1
         ), page AS (
           SELECT * FROM matching ORDER BY lower(titulo), id_simulacion LIMIT $2 OFFSET $3
         )
         SELECT (SELECT count(*)::integer FROM matching) AS total,
           COALESCE(jsonb_agg(${summary} ORDER BY lower(s.titulo), s.id_simulacion), '[]'::jsonb) AS items
         FROM page s`,
        [filters.status ? storageStatus[filters.status] : null, filters.limit, filters.offset],
      );
      return rows[0]!;
    },

    async find(id: string, client?: PoolClient) {
      const sql = `SELECT ${summary} AS simulation, s.id_revision_publicada AS revision_id
        FROM simulacion s WHERE s.id_simulacion = $1`;
      const { rows } = await (client ?? pool).query<SimulationRow>(sql, [id]);
      return rows[0] ?? null;
    },

    async lock(client: PoolClient, id: string) {
      const result = await client.query(
        'SELECT id_simulacion FROM simulacion WHERE id_simulacion = $1 FOR UPDATE',
        [id],
      );
      return result.rowCount === 1;
    },

    async save(client: PoolClient, id: string, input: Metadata, create: boolean) {
      const values = [
        id,
        input.title,
        input.description,
        storageDifficulty[input.difficulty],
        input.estimated_duration ?? null,
      ];
      if (create) {
        await client.query(
          `INSERT INTO simulacion (id_simulacion, titulo, descripcion, dificultad, duracion_estimada, estado)
           VALUES ($1, $2, $3, $4, $5, 'BORRADOR')`,
          values,
        );
      } else {
        await client.query(
          `UPDATE simulacion SET titulo = $2, descripcion = $3, dificultad = $4, duracion_estimada = $5
           WHERE id_simulacion = $1`,
          values,
        );
        await client.query('DELETE FROM simulacion_habilidad WHERE id_simulacion = $1', [id]);
      }
      await client.query(
        `INSERT INTO simulacion_habilidad (id_simulacion, id_habilidad, peso, nivel_esperado)
         SELECT $1, skill_id, weight, expected_level
         FROM jsonb_to_recordset($2::jsonb) AS skills(skill_id uuid, weight numeric, expected_level integer)`,
        [id, JSON.stringify(input.skills)],
      );
    },

    async publish(client: PoolClient, id: string, revisionId: string) {
      await client.query(
        `UPDATE simulacion SET estado = 'PUBLICADA', id_revision_publicada = $2 WHERE id_simulacion = $1`,
        [id, revisionId],
      );
    },

    async deactivate(client: PoolClient, id: string) {
      await client.query("UPDATE simulacion SET estado = 'INACTIVA' WHERE id_simulacion = $1", [
        id,
      ]);
    },

    async delete(client: PoolClient, id: string) {
      await client.query('DELETE FROM simulacion WHERE id_simulacion = $1', [id]);
    },
  };
}

export type SimulationRepository = ReturnType<typeof createSimulationRepository>;
