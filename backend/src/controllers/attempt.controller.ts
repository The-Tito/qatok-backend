import { AttemptParams, AttemptQuery, RecordResponseInput, StartAttemptInput } from '@qatok/shared';
import type { Request, Response } from 'express';
import { currentUser } from '../middlewares/session.middleware.js';
import type { createAttemptService } from '../services/attempt.service.js';

const attemptId = (request: Request) => AttemptParams.parse(request.params).attemptId;

export function createAttemptController(attempts: ReturnType<typeof createAttemptService>) {
  return {
    async list(request: Request, response: Response) {
      response.json(
        await attempts.list(currentUser(response).id, AttemptQuery.parse(request.query)),
      );
    },
    async start(request: Request, response: Response) {
      const { simulation_id } = StartAttemptInput.parse(request.body);
      response.status(201).json(await attempts.start(currentUser(response).id, simulation_id));
    },
    async get(request: Request, response: Response) {
      response.json(await attempts.get(currentUser(response).id, attemptId(request)));
    },
    async respond(request: Request, response: Response) {
      const input = RecordResponseInput.parse(request.body);
      response
        .status(201)
        .json(await attempts.respond(currentUser(response).id, attemptId(request), input));
    },
    async abandon(request: Request, response: Response) {
      response.json(await attempts.abandon(currentUser(response).id, attemptId(request)));
    },
  };
}
