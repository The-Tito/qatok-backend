import { Router } from 'express';
import type { Controladores } from '../contenedor.js';
import { requireAdmin } from '../middlewares/session.middleware.js';

export function createSimulationAdminRoutes({ simulations, requireSession }: Controladores) {
  const router = Router();
  router.use(requireSession, requireAdmin);
  router.get('/', simulations.list);
  router.post('/', simulations.create);
  router.put('/:simulationId', simulations.update);
  router.delete('/:simulationId', simulations.deleteDraft);
  router.get('/:simulationId/content', simulations.getContent);
  router.put('/:simulationId/content', simulations.saveContent);
  router.post('/:simulationId/publish', simulations.publish);
  router.post('/:simulationId/deactivate', simulations.deactivate);
  return router;
}
