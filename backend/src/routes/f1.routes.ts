import { Router } from 'express';
import type { Controladores } from '../contenedor.js';
import { requireAdmin } from '../middlewares/session.middleware.js';

export function createF1Routes({ account, catalog, skills, requireSession }: Controladores) {
  const router = Router();
  router.post('/auth/register', account.register);
  router.post('/auth/login', account.login);
  router.get('/me', requireSession, account.getMe);
  router.patch('/me', requireSession, account.updateMe);
  router.delete('/me', requireSession, account.deleteMe);

  router.get('/skills', requireSession, skills.list);
  router.post('/admin/skills', requireSession, requireAdmin, skills.create);
  router.put('/admin/skills/:skillId', requireSession, requireAdmin, skills.update);
  router.delete('/admin/skills/:skillId', requireSession, requireAdmin, skills.delete);

  router.get('/simulations', requireSession, catalog.list);
  router.get('/simulations/:simulationId', requireSession, catalog.get);
  return router;
}
