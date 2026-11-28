import { AttemptParams, RecommendationQuery, SkillParams } from '@qatok/shared';
import type { Request, Response } from 'express';
import { currentUser } from '../middlewares/session.middleware.js';
import type { createProfileService } from '../services/profile.service.js';

export function createProfileController(profile: ReturnType<typeof createProfileService>) {
  return {
    async get(_request: Request, response: Response) {
      response.json(await profile.get(currentUser(response)));
    },
    async skills(_request: Request, response: Response) {
      response.json(await profile.skills(currentUser(response).id));
    },
    async recommendations(request: Request, response: Response) {
      const { limit } = RecommendationQuery.parse(request.query);
      response.json(await profile.recommendations(currentUser(response).id, limit));
    },
    async evolution(request: Request, response: Response) {
      const { skillId } = SkillParams.parse(request.params);
      response.json(await profile.evolution(currentUser(response).id, skillId));
    },
    async path(request: Request, response: Response) {
      const { attemptId } = AttemptParams.parse(request.params);
      response.json(await profile.path(currentUser(response).id, attemptId));
    },
  };
}
