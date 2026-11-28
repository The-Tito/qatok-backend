import { Router } from 'express';
import type { Controladores } from '../contenedor.js';

export function createEvidenceRoutes({ evidence, requireSession }: Controladores) {
  const router = Router();
  router.use(requireSession);
  router.post('/', evidence.create);
  router.get('/', evidence.list);
  router.get('/:evidenceId', evidence.get);
  router.patch('/:evidenceId', evidence.update);
  router.delete('/:evidenceId', evidence.delete);
  return router;
}
