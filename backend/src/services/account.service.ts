import { randomUUID } from 'node:crypto';
import type { LoginInput, RegisterInput } from '@qatok/shared';
import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import type { z } from 'zod';
import { ErrorApp } from '../lib/errores.js';
import type { Logger } from '../lib/logger.js';
import type { SessionTokens } from '../lib/session.js';
import type { AccountRepository } from '../repositories/relational/account.repository.js';
import { encolarEventos } from '../repositories/relational/outbox.repository.js';
import { inTransaction, violatesConstraint } from '../repositories/relational/transaction.js';
import { nuevoEvento } from '../sync/eventos.js';
import { toSynchronization } from '../sync/http-status.js';
import type { ProcesadorSincronizacion } from '../sync/procesador.js';

const bcryptCost = 10;
const bcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
let dummyHash: Promise<string> | undefined;
const noCredentials = () => new ErrorApp('INVALID_CREDENTIALS', 401, 'Invalid email or password');
export const notAuthenticated = () =>
  new ErrorApp('UNAUTHENTICATED', 401, 'Authentication is required');

export function createAccountService(deps: {
  pool: Pool;
  accounts: AccountRepository;
  tokens: SessionTokens;
  synchronization: ProcesadorSincronizacion;
  removeEvidence: (ids: string[]) => Promise<unknown>;
  logger: Logger;
}) {
  const { pool, accounts, tokens, synchronization, removeEvidence, logger } = deps;
  return {
    async register(input: z.output<typeof RegisterInput>) {
      const id = randomUUID();
      const passwordHash = await bcrypt.hash(input.password, bcryptCost);
      const event = nuevoEvento('USUARIO_CREADO', { id_usuario: id });
      const user = await inTransaction(pool, async (client) => {
        const created = await accounts.insert(client, id, input.name, input.email, passwordHash);
        await encolarEventos(client, [event]);
        return created;
      }).catch((error: unknown) => {
        if (violatesConstraint(error, '23505', 'uq_usuario_correo')) {
          throw new ErrorApp('EMAIL_ALREADY_REGISTERED', 409, 'Email is already registered');
        }
        throw error;
      });
      const token = await tokens.issue(user);
      return {
        user,
        token,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },
    async login(input: z.output<typeof LoginInput>) {
      const credentials = await accounts.findForLogin(input.email);
      const hash = credentials?.passwordHash;
      const usable = hash && bcryptHash.test(hash);
      const candidate = usable ? hash : await (dummyHash ??= bcrypt.hash(randomUUID(), bcryptCost));
      const matches = await bcrypt.compare(input.password, candidate);
      if (!credentials || !usable || !matches) throw noCredentials();
      if (credentials.user.status !== 'ACTIVE') {
        throw new ErrorApp('ACCOUNT_INACTIVE', 403, 'Account is inactive');
      }
      return { user: credentials.user, token: await tokens.issue(credentials.user) };
    },
    async updateName(id: string, name: string) {
      const user = await accounts.updateName(id, name);
      if (!user) throw notAuthenticated();
      return user;
    },
    async delete(id: string) {
      const event = nuevoEvento('USUARIO_ELIMINADO', { id_usuario: id });
      const evidenceIds = await inTransaction(pool, async (client) => {
        const ids = await accounts.delete(client, id);
        if (!ids) throw notAuthenticated();
        await encolarEventos(client, [event]);
        return ids;
      });
      if (evidenceIds.length) {
        try {
          await removeEvidence(evidenceIds);
        } catch {
          logger.warn(
            { eventId: event.id_evento, evidenceCount: evidenceIds.length },
            'Document cleanup deferred to reconciliation',
          );
        }
      }
      return {
        deleted: true as const,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
