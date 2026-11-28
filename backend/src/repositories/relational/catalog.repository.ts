import type { CatalogQuery, SimulationSummary } from '@qatok/shared';
import type { Pool } from 'pg';
import type { z } from 'zod';

export const storageDifficulty = {
  BASIC: 'BASICA',
  INTERMEDIATE: 'INTERMEDIA',
  ADVANCED: 'AVANZADA',
};
export const summary = `jsonb_build_object(
  'id', s.id_simulacion, 'title', s.titulo, 'description', s.descripcion,
  'difficulty', CASE s.dificultad WHEN 'BASICA' THEN 'BASIC'
                   WHEN 'INTERMEDIA' THEN 'INTERMEDIATE' ELSE 'ADVANCED' END,
  'estimated_duration', s.duracion_estimada,
  'status', CASE s.estado WHEN 'BORRADOR' THEN 'DRAFT'
             WHEN 'PUBLICADA' THEN 'PUBLISHED' ELSE 'INACTIVE' END,
  'skills', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', h.id_habilidad, 'name', h.nombre,
      'visual_type', h.tipo_visual, 'weight', sh.peso, 'expected_level', sh.nivel_esperado)
      ORDER BY lower(h.nombre), h.id_habilidad)
    FROM simulacion_habilidad sh JOIN habilidad h USING (id_habilidad)
    WHERE sh.id_simulacion = s.id_simulacion
  ), '[]'::jsonb)
)`;

export function createCatalogRepository(pool: Pool) {
  return {
    async list(filters: z.output<typeof CatalogQuery>) {
      const { rows } = await pool.query<{ items: SimulationSummary[]; total: number }>(
        `WITH matching AS (
           SELECT s.* FROM simulacion s WHERE s.estado = 'PUBLICADA'
             AND ($1::text IS NULL OR position(lower($1) IN lower(s.titulo || ' ' || s.descripcion)) > 0)
             AND ($2::uuid IS NULL OR EXISTS (
               SELECT 1 FROM simulacion_habilidad sh WHERE sh.id_simulacion = s.id_simulacion AND sh.id_habilidad = $2
             ))
             AND ($3::text IS NULL OR s.dificultad = $3)
         ), page AS (
           SELECT * FROM matching ORDER BY lower(titulo), id_simulacion LIMIT $4 OFFSET $5
         )
         SELECT (SELECT count(*)::integer FROM matching) AS total,
           COALESCE(jsonb_agg(${summary} ORDER BY lower(s.titulo), s.id_simulacion), '[]'::jsonb) AS items
         FROM page s`,
        [
          filters.search ?? null,
          filters.skill_id ?? null,
          filters.difficulty ? storageDifficulty[filters.difficulty] : null,
          filters.limit,
          filters.offset,
        ],
      );
      return rows[0]!;
    },
    async findPublishedByIds(ids: string[]) {
      if (ids.length === 0) return [];
      const { rows } = await pool.query<{ simulation: SimulationSummary }>(
        `SELECT ${summary} AS simulation FROM simulacion s
         WHERE s.id_simulacion = ANY($1::uuid[]) AND s.estado = 'PUBLICADA'`,
        [ids],
      );
      return rows.map(({ simulation }) => simulation);
    },
    async findPublished(id: string) {
      const { rows } = await pool.query<{ simulation: SimulationSummary }>(
        `SELECT ${summary} AS simulation FROM simulacion s WHERE s.id_simulacion = $1 AND s.estado = 'PUBLICADA'`,
        [id],
      );
      return rows[0]?.simulation ?? null;
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
