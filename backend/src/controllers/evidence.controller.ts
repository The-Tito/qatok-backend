import {
  CreateEvidenceInput,
  EvidenceParams,
  EvidenceQuery,
  UpdateEvidenceInput,
} from '@qatok/shared';
import type { Request, Response } from 'express';
import { currentUser } from '../middlewares/session.middleware.js';
import type { createEvidenceService } from '../services/evidence.service.js';

const evidenceId = (request: Request) => EvidenceParams.parse(request.params).evidenceId;

export function createEvidenceController(evidence: ReturnType<typeof createEvidenceService>) {
  return {
    async create(request: Request, response: Response) {
      const { attempt_id, title } = CreateEvidenceInput.parse(request.body);
      response.status(201).json(await evidence.create(currentUser(response).id, attempt_id, title));
    },
    async list(request: Request, response: Response) {
      response.json(
        await evidence.list(currentUser(response).id, EvidenceQuery.parse(request.query)),
      );
    },
    async get(request: Request, response: Response) {
      response.json(await evidence.get(currentUser(response).id, evidenceId(request)));
    },
    async update(request: Request, response: Response) {
      const input = UpdateEvidenceInput.parse(request.body);
      response.json(await evidence.update(currentUser(response).id, evidenceId(request), input));
    },
    async delete(request: Request, response: Response) {
      response.json(await evidence.delete(currentUser(response).id, evidenceId(request)));
    },
  };
}
