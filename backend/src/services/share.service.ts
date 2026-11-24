import { randomBytes, randomUUID } from 'node:crypto';
import {
  ShareToken,
  type CreateShareInput,
  type EvidenceShare,
  type SharedEvidence,
} from '@qatok/shared';
import { ErrorApp } from '../lib/errores.js';
import type { crearEvidenciaRepository } from '../repositories/document/evidencia.repository.js';
import type { createShareRepository } from '../repositories/relational/share.repository.js';
import { violatesConstraint } from '../repositories/relational/transaction.js';
import { toEvidenceSnapshot } from './evidence-snapshot.js';

const missingEvidence = () => new ErrorApp('NOT_FOUND', 404, 'Evidence not found');
const invalidLink = () =>
  new ErrorApp('INVALID_SHARE_LINK', 404, 'Share link is invalid or revoked');

function withPublicUrl(share: Omit<EvidenceShare, 'public_url'>): EvidenceShare {
  return { ...share, public_url: '/api/public/evidence/' + encodeURIComponent(share.token) };
}

export function createShareService(
  shares: ReturnType<typeof createShareRepository>,
  snapshots: Pick<ReturnType<typeof crearEvidenciaRepository>, 'obtener'>,
) {
  return {
    async create(userId: string, evidenceId: string, input: CreateShareInput) {
      const id = randomUUID();
      for (let attempt = 1; ; attempt += 1) {
        try {
          const token = randomBytes(32).toString('base64url');
          const share = await shares.create(userId, evidenceId, id, token, input);
          if (!share) throw missingEvidence();
          return withPublicUrl(share);
        } catch (error) {
          if (attempt === 3 || !violatesConstraint(error, '23505', 'uq_comparticion_token'))
            throw error;
        }
      }
    },

    async list(userId: string, evidenceId: string) {
      const entries = await shares.list(userId, evidenceId);
      if (!entries) throw missingEvidence();
      return { items: entries.map(withPublicUrl), total: entries.length };
    },

    async revoke(userId: string, shareId: string) {
      if (!(await shares.revoke(userId, shareId)))
        throw new ErrorApp('NOT_FOUND', 404, 'Share link not found');
    },

    async getPublic(rawToken: unknown): Promise<SharedEvidence> {
      const token = ShareToken.safeParse(rawToken);
      if (!token.success) throw invalidLink();
      const link = await shares.findActive(token.data);
      if (!link) throw invalidLink();
      if (link.vencido) throw new ErrorApp('SHARE_LINK_EXPIRED', 410, 'Share link has expired');
      const snapshot = await snapshots.obtener(link.id_evidencia);
      if (!snapshot) {
        throw new ErrorApp('EVIDENCE_CONTENT_UNAVAILABLE', 503, 'Evidence snapshot is unavailable');
      }
      const content = toEvidenceSnapshot(snapshot);
      return {
        title: link.titulo,
        generated_at: link.fecha_generacion.toISOString(),
        owner: { name: link.titular },
        content: {
          description: content.description,
          simulation: { title: content.simulation.title },
          score: content.score,
          skills: content.skills.map(({ name }) => ({ name })),
          decisions: content.decisions,
        },
      };
    },
  };
}
