import { CreateShareInput, EvidenceParams, ShareParams } from '@qatok/shared';
import type { Request, Response } from 'express';
import { currentUser } from '../middlewares/session.middleware.js';
import type { createShareService } from '../services/share.service.js';

export function createShareController(shares: ReturnType<typeof createShareService>) {
  return {
    async create(request: Request, response: Response) {
      const { evidenceId } = EvidenceParams.parse(request.params);
      const input = CreateShareInput.parse(request.body ?? {});
      response.status(201).json(await shares.create(currentUser(response).id, evidenceId, input));
    },
    async list(request: Request, response: Response) {
      const { evidenceId } = EvidenceParams.parse(request.params);
      response.json(await shares.list(currentUser(response).id, evidenceId));
    },
    async revoke(request: Request, response: Response) {
      const { shareId } = ShareParams.parse(request.params);
      await shares.revoke(currentUser(response).id, shareId);
      response.sendStatus(204);
    },
    async getPublic(request: Request, response: Response) {
      response.json(await shares.getPublic(request.params.token));
    },
  };
}
