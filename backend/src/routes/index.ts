/**
 * Registro de todas las rutas bajo /api. Cada dueño agrega UNA línea para su archivo de rutas
 * (contrato §4): auth, habilidades, simulaciones, intentos, perfil, evidencias, comparticiones.
 */
import { Router } from 'express';
import type { Controladores } from '../contenedor.js';
import { createAttemptRoutes } from './attempt.routes.js';
import { createEvidenceRoutes } from './evidence.routes.js';
import { createProfileRoutes } from './profile.routes.js';
import { createF1Routes } from './f1.routes.js';
import { healthRoutes } from './health.routes.js';
import { createShareRoutes } from './share.routes.js';
import { createSimulationAdminRoutes } from './simulation-admin.routes.js';

export function crearRutas(c: Controladores): Router {
  const api = Router();
  api.use(healthRoutes(c.health));
  api.use(createF1Routes(c));
  api.use('/admin/simulations', createSimulationAdminRoutes(c));
  api.use('/attempts', createAttemptRoutes(c));
  api.use('/profile', createProfileRoutes(c));
  api.use(createShareRoutes(c));
  api.use('/evidence', createEvidenceRoutes(c));
  return api;
}
