import type { Skill } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';

const skillColumns =
  'id_habilidad AS id, nombre AS name, descripcion AS description, categoria AS category, nivel_objetivo AS target_level';

export function createSkillRepository(pool: Pool) {
  return {
    async list() {
      const { rows } = await pool.query<Skill>(
        `SELECT ${skillColumns} FROM habilidad ORDER BY lower(nombre), id_habilidad`,
      );
      return { items: rows, total: rows.length };
    },
    async insert(client: PoolClient, skill: Skill) {
      await client.query(
        `INSERT INTO habilidad (id_habilidad, nombre, descripcion, categoria, nivel_objetivo)
         VALUES ($1, $2, $3, $4, $5)`,
        [skill.id, skill.name, skill.description, skill.category, skill.target_level],
      );
      return skill;
    },
    async update(client: PoolClient, skill: Skill) {
      const { rows } = await client.query<Skill>(
        `UPDATE habilidad SET nombre = $2, descripcion = $3, categoria = $4, nivel_objetivo = $5
         WHERE id_habilidad = $1 RETURNING ${skillColumns}`,
        [skill.id, skill.name, skill.description, skill.category, skill.target_level],
      );
      return rows[0] ?? null;
    },
    async delete(client: PoolClient, id: string) {
      const result = await client.query('DELETE FROM habilidad WHERE id_habilidad = $1', [id]);
      return result.rowCount === 1;
    },
  };
}

export type SkillRepository = ReturnType<typeof createSkillRepository>;
