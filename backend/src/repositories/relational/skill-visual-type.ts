import type { SkillVisualType } from '@qatok/shared';
import type { Pool } from 'pg';

/**
 * El grafo y las instantáneas de evidencia no guardan el tipo visual: PostgreSQL es su dueño.
 * Devuelve `visual_type` por habilidad; una habilidad que ya no existe queda sin tipo.
 */
export async function readVisualTypes(pool: Pool, ids: string[]) {
  const types = new Map<string, SkillVisualType | null>();
  if (ids.length === 0) return types;
  const { rows } = await pool.query<{ id: string; visual_type: SkillVisualType | null }>(
    'SELECT id_habilidad AS id, tipo_visual AS visual_type FROM habilidad WHERE id_habilidad = ANY($1::uuid[])',
    [ids],
  );
  for (const row of rows) types.set(row.id, row.visual_type);
  return types;
}
