import type { Account } from '@qatok/shared';
import type { RequestHandler, Response } from 'express';
import { ErrorApp } from '../lib/errores.js';
import type { SessionTokens } from '../lib/session.js';
import type { AccountRepository } from '../repositories/relational/account.repository.js';
import { notAuthenticated } from '../services/account.service.js';

export function currentUser(response: Response): Account {
  const user = response.locals.currentUser as Account | undefined;
  if (!user) throw notAuthenticated();
  return user;
}

export function createSessionMiddleware(
  tokens: SessionTokens,
  accounts: AccountRepository,
): RequestHandler {
  return async (request, response, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(request.get('Authorization') ?? '')?.[1];
    if (!token) throw notAuthenticated();
    let id: string;
    try {
      id = await tokens.verify(token);
    } catch {
      throw notAuthenticated();
    }
    const user = await accounts.findById(id);
    if (user?.status !== 'ACTIVE') throw notAuthenticated();
    response.locals.currentUser = user;
    next();
  };
}

export const requireAdmin: RequestHandler = (_request, response, next) => {
  if (currentUser(response).role !== 'ADMIN') {
    throw new ErrorApp('FORBIDDEN', 403, 'Administrator access is required');
  }
  next();
};
