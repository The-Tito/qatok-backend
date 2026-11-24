/**
 * Raíz de composición: aquí, y solo aquí, se crean repositorios, servicios y controladores
 * y se conectan entre sí. Cada dueño agrega las líneas de su flujo en su bloque.
 */
import type { Entorno } from './config/entorno.js';
import { createAttemptController } from './controllers/attempt.controller.js';
import {
  createAccountController,
  createCatalogController,
  createSkillController,
} from './controllers/f1.controller.js';
import { createEvidenceController } from './controllers/evidence.controller.js';
import { createProfileController } from './controllers/profile.controller.js';
import { crearHealthController } from './controllers/health.controller.js';
import { createShareController } from './controllers/share.controller.js';
import { createSimulationController } from './controllers/simulation.controller.js';
import type { Conexiones } from './db/conexiones.js';
import type { Logger } from './lib/logger.js';
import { createSessionTokens } from './lib/session.js';
import { createSessionMiddleware } from './middlewares/session.middleware.js';
import { crearContenidoRepository } from './repositories/document/contenido.repository.js';
import { crearEvidenciaRepository } from './repositories/document/evidencia.repository.js';
import { crearHealthRepositoryDocumental } from './repositories/document/health.repository.js';
import { crearHealthRepositoryGrafo } from './repositories/graph/health.repository.js';
import { crearPerfilRepositoryGrafo } from './repositories/graph/perfil.repository.js';
import { crearAplicadorGrafo } from './repositories/graph/sincronizacion.repository.js';
import { crearHealthRepositoryRelacional } from './repositories/relational/health.repository.js';
import { createAccountRepository } from './repositories/relational/account.repository.js';
import { createAttemptRepository } from './repositories/relational/attempt.repository.js';
import { createCatalogRepository } from './repositories/relational/catalog.repository.js';
import {
  createEvidenceRepository,
  createProfileRepository,
} from './repositories/relational/evidence.repository.js';
import { crearOutboxRepository } from './repositories/relational/outbox.repository.js';
import { createShareRepository } from './repositories/relational/share.repository.js';
import { createSkillRepository } from './repositories/relational/skill.repository.js';
import { createSimulationRepository } from './repositories/relational/simulation.repository.js';
import { createAccountService } from './services/account.service.js';
import { createAttemptService } from './services/attempt.service.js';
import { createEvidenceService } from './services/evidence.service.js';
import { createProfileService } from './services/profile.service.js';
import { crearHealthService } from './services/health.service.js';
import { createShareService } from './services/share.service.js';
import { createSkillService } from './services/skill.service.js';
import { createSimulationService } from './services/simulation.service.js';
import { crearProcesadorSincronizacion } from './sync/procesador.js';
import paquete from '../package.json' with { type: 'json' };

export function crearControladores(
  conexiones: Conexiones,
  entorno: Entorno,
  logger: Logger,
  synchronization = crearSincronizacion(conexiones, logger),
) {
  // ---- Salud (A) ----
  const health = crearHealthController(
    crearHealthService(
      [
        crearHealthRepositoryRelacional(conexiones.postgres),
        crearHealthRepositoryDocumental(conexiones.mongo.db),
        crearHealthRepositoryGrafo(conexiones.neo4j),
      ],
      { timeoutMs: entorno.DB_TIMEOUT_MS, version: paquete.version, logger },
    ),
  );

  const pool = conexiones.postgres;
  const accounts = createAccountRepository(pool);
  const tokens = createSessionTokens(entorno.JWT_SECRET);
  const snapshots = crearEvidenciaRepository(conexiones.mongo.db);
  const account = createAccountController(
    createAccountService({
      pool,
      accounts,
      tokens,
      synchronization,
      removeEvidence: snapshots.removeByIds,
      logger,
    }),
  );
  const skills = createSkillController(
    createSkillService(pool, createSkillRepository(pool), synchronization),
  );
  const catalogRepository = createCatalogRepository(pool);
  const catalog = createCatalogController(catalogRepository);
  const content = crearContenidoRepository(conexiones.mongo.db);
  const simulationRepository = createSimulationRepository(pool);
  const simulations = createSimulationController(
    createSimulationService({
      pool,
      simulations: simulationRepository,
      content,
      synchronization,
      logger,
    }),
  );
  const attemptRepository = createAttemptRepository(pool);
  const attempts = createAttemptController(
    createAttemptService({
      pool,
      attempts: attemptRepository,
      content,
      synchronization,
    }),
  );
  const evidenceRepository = createEvidenceRepository(pool);
  const graph = crearPerfilRepositoryGrafo(conexiones.neo4j, entorno.DB_TIMEOUT_MS);
  const profile = createProfileController(
    createProfileService({
      pool,
      attempts: attemptRepository,
      catalog: catalogRepository,
      profile: createProfileRepository(pool),
      records: evidenceRepository,
      snapshots,
      graph,
      content,
    }),
  );
  const evidence = createEvidenceController(
    createEvidenceService({
      pool,
      attempts: attemptRepository,
      simulations: simulationRepository,
      records: evidenceRepository,
      snapshots,
      content,
      graph,
      synchronization,
      logger,
    }),
  );
  const shares = createShareController(createShareService(createShareRepository(pool), snapshots));
  const requireSession = createSessionMiddleware(tokens, accounts);
  return {
    health,
    account,
    skills,
    catalog,
    simulations,
    attempts,
    profile,
    evidence,
    shares,
    requireSession,
  };
}

export type Controladores = ReturnType<typeof crearControladores>;

export function crearSincronizacion(conexiones: Conexiones, logger: Logger) {
  return crearProcesadorSincronizacion(
    crearOutboxRepository(conexiones.postgres),
    crearAplicadorGrafo(conexiones.neo4j),
    { logger },
  );
}
