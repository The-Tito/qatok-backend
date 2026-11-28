import type { Evidence, EvidenceSummary, UpdateEvidenceInput } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';

const visibility = { PRIVATE: 'PRIVADA', PUBLIC: 'PUBLICA' };
type EvidenceRow = Omit<Evidence, 'generated_at'> & { generated_at: Date };
const fields = `id_evidencia AS id, id_intento AS attempt_id, titulo AS title,
  CASE visibilidad WHEN 'PRIVADA' THEN 'PRIVATE' ELSE 'PUBLIC' END AS visibility,
  fecha_generacion AS generated_at`;
function toEvidence(row: EvidenceRow): Evidence {
  return { ...row, generated_at: row.generated_at.toISOString() };
}

export function createEvidenceRepository(pool: Pool) {
  return {
    async lockActiveOwner(client: PoolClient, userId: string) {
      const { rowCount } = await client.query(
        "SELECT id_usuario FROM usuario WHERE id_usuario = $1 AND estado = 'ACTIVO' FOR KEY SHARE",
        [userId],
      );
      return rowCount === 1;
    },

    async findOwned(userId: string, id: string, client?: PoolClient) {
      const { rows } = await (client ?? pool).query<EvidenceRow>(
        `SELECT ${fields} FROM evidencia WHERE id_usuario = $1 AND id_evidencia = $2
         ${client ? 'FOR UPDATE' : ''}`,
        [userId, id],
      );
      return rows[0] ? toEvidence(rows[0]) : null;
    },

    async findByAttempt(client: PoolClient, attemptId: string) {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id_evidencia AS id FROM evidencia WHERE id_intento = $1',
        [attemptId],
      );
      return rows[0]?.id ?? null;
    },

    async insert(client: PoolClient, userId: string, evidence: Evidence) {
      await client.query(
        `INSERT INTO evidencia (id_evidencia, id_usuario, id_intento, titulo, fecha_generacion, visibilidad)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          evidence.id,
          userId,
          evidence.attempt_id,
          evidence.title,
          evidence.generated_at,
          visibility[evidence.visibility],
        ],
      );
    },

    async update(client: PoolClient, userId: string, id: string, input: UpdateEvidenceInput) {
      const { rows } = await client.query<EvidenceRow>(
        `UPDATE evidencia SET titulo = COALESCE($3, titulo), visibilidad = COALESCE($4, visibilidad)
         WHERE id_usuario = $1 AND id_evidencia = $2 RETURNING ${fields}`,
        [userId, id, input.title ?? null, input.visibility ? visibility[input.visibility] : null],
      );
      return rows[0] ? toEvidence(rows[0]) : null;
    },

    async delete(client: PoolClient, userId: string, id: string) {
      const { rowCount } = await client.query(
        'DELETE FROM evidencia WHERE id_usuario = $1 AND id_evidencia = $2',
        [userId, id],
      );
      return rowCount === 1;
    },

    async list(userId: string, limit: number, offset: number, ids: string[] | null) {
      const { rows } = await pool.query<{ items: EvidenceSummary[]; total: number }>(
        `WITH matching AS (
           SELECT e.* FROM evidencia e
           WHERE e.id_usuario = $1 AND ($2::uuid[] IS NULL OR e.id_evidencia = ANY($2))
         ), page AS (
           SELECT * FROM matching ORDER BY fecha_generacion DESC, id_evidencia LIMIT $3 OFFSET $4
         )
         SELECT (SELECT count(*)::integer FROM matching) AS total,
           COALESCE(jsonb_agg(jsonb_build_object(
             'id', e.id_evidencia, 'attempt_id', e.id_intento, 'title', e.titulo,
             'generated_at', to_char(e.fecha_generacion AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'visibility', CASE e.visibilidad WHEN 'PRIVADA' THEN 'PRIVATE' ELSE 'PUBLIC' END,
             'simulation', jsonb_build_object('id', s.id_simulacion, 'title', s.titulo),
             'skills', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', h.id_habilidad, 'name', h.nombre, 'visual_type', h.tipo_visual) ORDER BY h.nombre, h.id_habilidad)
               FROM simulacion_habilidad sh JOIN habilidad h USING (id_habilidad)
               WHERE sh.id_simulacion = s.id_simulacion
             ), '[]'::jsonb),
             'active_shares', (
               SELECT count(*) FROM comparticion c WHERE c.id_evidencia = e.id_evidencia
                 AND c.estado = 'ACTIVA' AND (c.fecha_expiracion IS NULL OR c.fecha_expiracion > NOW())
             )
           ) ORDER BY e.fecha_generacion DESC, e.id_evidencia), '[]'::jsonb) AS items
         FROM page e JOIN intento i USING (id_intento) JOIN simulacion s USING (id_simulacion)`,
        [userId, ids, limit, offset],
      );
      return rows[0]!;
    },
  };
}

export function createProfileRepository(pool: Pool) {
  return {
    async summary(userId: string) {
      const { rows } = await pool.query<{
        completed_attempts: number;
        evidence_count: number;
        pending_sync_count: number;
      }>(
        `WITH owned_attempts AS (
           SELECT id_intento, estado FROM intento WHERE id_usuario = $1::uuid
         )
         SELECT
           (SELECT count(*)::integer FROM owned_attempts WHERE estado = 'COMPLETADO') AS completed_attempts,
           (SELECT count(*)::integer FROM evidencia WHERE id_usuario = $1) AS evidence_count,
           (SELECT count(*)::integer FROM evento_sincronizacion e
             WHERE e.estado <> 'APLICADO' AND (
               e.payload->>'id_usuario' = $1::text OR
               EXISTS (SELECT 1 FROM owned_attempts i
                       WHERE i.id_intento::text = e.payload->>'id_intento')
             )
           ) AS pending_sync_count`,
        [userId],
      );
      return rows[0]!;
    },
  };
}
