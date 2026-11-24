import {
  CatalogQuery,
  LoginInput,
  RegisterInput,
  SkillInput,
  UpdateAccountInput,
  Uuid,
} from '@qatok/shared';
import type { Request, Response } from 'express';
import { ErrorApp } from '../lib/errores.js';
import { currentUser } from '../middlewares/session.middleware.js';
import type { CatalogRepository } from '../repositories/relational/catalog.repository.js';
import type { AccountService } from '../services/account.service.js';
import type { SkillService } from '../services/skill.service.js';

export function createAccountController(accounts: AccountService) {
  return {
    async register(request: Request, response: Response) {
      response
        .set('Cache-Control', 'no-store')
        .status(201)
        .json(await accounts.register(RegisterInput.parse(request.body)));
    },
    async login(request: Request, response: Response) {
      response
        .set('Cache-Control', 'no-store')
        .json(await accounts.login(LoginInput.parse(request.body)));
    },
    getMe(_request: Request, response: Response) {
      response.json(currentUser(response));
    },
    async updateMe(request: Request, response: Response) {
      const user = currentUser(response);
      const { name } = UpdateAccountInput.parse(request.body);
      response.json(name === undefined ? user : await accounts.updateName(user.id, name));
    },
    async deleteMe(_request: Request, response: Response) {
      response.json(await accounts.delete(currentUser(response).id));
    },
  };
}

export function createSkillController(skills: SkillService) {
  return {
    async list(_request: Request, response: Response) {
      response.json(await skills.list());
    },
    async create(request: Request, response: Response) {
      response.status(201).json(await skills.save(null, SkillInput.parse(request.body)));
    },
    async update(request: Request, response: Response) {
      response.json(
        await skills.save(Uuid.parse(request.params.skillId), SkillInput.parse(request.body)),
      );
    },
    async delete(request: Request, response: Response) {
      response.json(await skills.delete(Uuid.parse(request.params.skillId)));
    },
  };
}

export function createCatalogController(catalog: CatalogRepository) {
  return {
    async list(request: Request, response: Response) {
      response.json(await catalog.list(CatalogQuery.parse(request.query)));
    },
    async get(request: Request, response: Response) {
      const simulation = await catalog.findPublished(Uuid.parse(request.params.simulationId));
      if (!simulation) throw new ErrorApp('NOT_FOUND', 404, 'Simulation not found');
      response.json(simulation);
    },
  };
}
