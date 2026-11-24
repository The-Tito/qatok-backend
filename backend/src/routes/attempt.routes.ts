import { Router } from 'express';
import type { Controladores } from '../contenedor.js';

export function createAttemptRoutes({ attempts, requireSession }: Controladores) {
  const router = Router();
  router.use(requireSession);
  router.get('/', attempts.list);
  router.post('/', attempts.start);
  router.get('/:attemptId', attempts.get);
  router.post('/:attemptId/responses', attempts.respond);
  router.post('/:attemptId/abandon', attempts.abandon);
  return router;
}
