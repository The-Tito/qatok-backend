import { Router } from 'express';
import type { Controladores } from '../contenedor.js';

export function createProfileRoutes({ profile, requireSession }: Controladores) {
  const router = Router();
  router.use(requireSession);
  router.get('/', profile.get);
  router.get('/skills', profile.skills);
  router.get('/recommendations', profile.recommendations);
  router.get('/skills/:skillId/evolution', profile.evolution);
  router.get('/attempts/:attemptId/path', profile.path);
  return router;
}
