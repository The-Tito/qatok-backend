import { AccountRole, Uuid, type Account } from '@qatok/shared';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const policy = { issuer: 'qatok-backend', audience: 'qatok-api' } as const;
const claims = z.object({ sub: Uuid, role: AccountRole, exp: z.number() });

export function createSessionTokens(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    issue(user: Account) {
      return new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(policy.issuer)
        .setAudience(policy.audience)
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime('8h')
        .sign(key);
    },
    async verify(token: string) {
      const { payload } = await jwtVerify(token, key, {
        ...policy,
        typ: 'JWT',
        algorithms: ['HS256'],
      });
      return claims.parse(payload).sub;
    },
  };
}

export type SessionTokens = ReturnType<typeof createSessionTokens>;
