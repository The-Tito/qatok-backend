import { Router, type RequestHandler } from 'express';
import type { Controladores } from '../contenedor.js';

const noStore: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
};

const noReferrer: RequestHandler = (_request, response, next) => {
  response.set('Referrer-Policy', 'no-referrer');
  next();
};

export function createShareRoutes({ shares, requireSession }: Controladores) {
  const router = Router();
  router.post('/evidence/:evidenceId/shares', noStore, requireSession, shares.create);
  router.get('/evidence/:evidenceId/shares', noStore, requireSession, shares.list);
  router.delete('/shares/:shareId', noStore, requireSession, shares.revoke);
  router.get('/public/evidence/:token', noStore, noReferrer, shares.getPublic);
  return router;
}
