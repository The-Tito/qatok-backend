import { readFileSync } from 'node:fs';
import type { CreateShareInput, EvidenceShare } from '@qatok/shared';
import type { Pool } from 'pg';

const publicLookup = readFileSync(
  new URL('../../../../database/relational/queries/03-enlace.sql', import.meta.url),
  'utf8',
);

interface ShareRow {
  id: string;
  token: string;
  recipient: string | null;
  created_at: Date;
  expires_at: Date | null;
  status: EvidenceShare['status'];
  is_valid: boolean;
}
type ShareData = Omit<EvidenceShare, 'public_url'>;

const validity = `estado = 'ACTIVA' AND (fecha_expiracion IS NULL OR fecha_expiracion > statement_timestamp())`;
const projection = `id_comparticion AS id, token, destinatario AS recipient,
  fecha_creacion AS created_at, fecha_expiracion AS expires_at,
  CASE estado WHEN 'ACTIVA' THEN 'ACTIVE' ELSE 'REVOKED' END AS status,
  ${validity} AS is_valid`;
function toShare(row: ShareRow): ShareData {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
  };
}

export function createShareRepository(pool: Pool) {
  return {
    async create(
      userId: string,
      evidenceId: string,
      id: string,
      token: string,
      input: CreateShareInput,
    ) {
      const { rows } = await pool.query<ShareRow>(
        `WITH owned AS (
           SELECT id_evidencia FROM evidencia WHERE id_usuario = $1 AND id_evidencia = $2
           FOR KEY SHARE
         )
         INSERT INTO comparticion (
           id_comparticion, id_evidencia, token, fecha_creacion, fecha_expiracion, estado, destinatario
         )
         SELECT $3, id_evidencia, $4, statement_timestamp(),
                statement_timestamp() + make_interval(secs => $5::integer * 86400),
                'ACTIVA', $6
         FROM owned RETURNING ${projection}`,
        [userId, evidenceId, id, token, input.expires_in_days, input.recipient ?? null],
      );
      return rows[0] ? toShare(rows[0]) : null;
    },

    async list(userId: string, evidenceId: string) {
      // The outer join distinguishes an owned evidence with no links from an absent evidence.
      const { rows } = await pool.query<ShareRow | { id: null }>(
        `SELECT c.* FROM evidencia e
         LEFT JOIN LATERAL (
           SELECT ${projection} FROM comparticion WHERE id_evidencia = e.id_evidencia
         ) c ON true
         WHERE e.id_usuario = $1 AND e.id_evidencia = $2
         ORDER BY c.created_at DESC, c.id`,
        [userId, evidenceId],
      );
      if (!rows.length) return null;
      return rows.flatMap((row) => (row.id === null ? [] : [toShare(row)]));
    },

    async revoke(userId: string, shareId: string) {
      const { rowCount } = await pool.query(
        `UPDATE comparticion c SET estado = 'REVOCADA' FROM evidencia e
         WHERE c.id_evidencia = e.id_evidencia AND e.id_usuario = $1 AND c.id_comparticion = $2`,
        [userId, shareId],
      );
      return rowCount === 1;
    },

    async findActive(token: string) {
      const { rows } = await pool.query<{
        id_evidencia: string;
        titulo: string;
        fecha_generacion: Date;
        titular: string;
        vencido: boolean;
      }>(publicLookup, [token]);
      return rows[0] ?? null;
    },
  };
}
