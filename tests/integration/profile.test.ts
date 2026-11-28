import { randomUUID } from 'node:crypto';
import {
  AttemptPath,
  AttemptStarted,
  EvidenceDetail,
  EvidenceList,
  EvidenceMutation,
  EvidenceUpdate,
  Profile,
  ProfileSkills,
  Recommendations,
  ResponseRecorded,
  SkillEvolution,
} from '@qatok/shared';
import { Pool, type Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import { crearControladores } from '../../backend/src/contenedor.js';
import {
  cerrarConexiones,
  crearConexiones,
  type Conexiones,
} from '../../backend/src/db/conexiones.js';
import { createSessionTokens } from '../../backend/src/lib/session.js';
import { crearAplicadorGrafo } from '../../backend/src/repositories/graph/sincronizacion.repository.js';
import { createAccountRepository } from '../../backend/src/repositories/relational/account.repository.js';
import { crearOutboxRepository } from '../../backend/src/repositories/relational/outbox.repository.js';
import { crearRutas } from '../../backend/src/routes/index.js';
import { crearProcesadorSincronizacion } from '../../backend/src/sync/procesador.js';
import { cargarDataset, crearColecciones } from '../../database/document/ejecutar.mjs';
import { reset } from '../../database/graph/ejecutar.mjs';
import {
  conectar,
  eliminarEsquemaDePrueba,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { appConRutas, loggerSilencioso } from '../apoyo/app-de-prueba.js';

const environment = cargarEntorno();
const basePath = '/api/attempts';
const fixture = (suffix: string) => 'e0000000-0000-4000-8000-00000000' + suffix;
const deliveries = fixture('0302');
const delivery = { step_id: fixture('0404'), option_id: fixture('0508') };
const originalEvidence = fixture('1101');
const communication = fixture('0201');
const timeManagement = fixture('0203');
let admin: Client;
let schema: string;
let connections: Conexiones;
let app: ReturnType<typeof appConRutas>;
let synchronization: ReturnType<typeof crearProcesadorSincronizacion>;
let ana: string;
let bruno: string;
let failGraph = false;

function makeApp(overrides: Partial<Conexiones> = {}) {
  return appConRutas(
    crearRutas(
      crearControladores(
        { ...connections, ...overrides },
        environment,
        loggerSilencioso,
        synchronization,
      ),
    ),
  );
}

beforeAll(async () => {
  admin = conectar();
  await admin.connect();
  schema = await prepararEsquemaDePrueba(admin);
  await admin.query('COMMIT');
  const base = crearConexiones(environment);
  await base.postgres.end();
  const postgres = new Pool({
    host: environment.POSTGRES_HOST,
    port: environment.POSTGRES_PORT,
    database: environment.POSTGRES_DB,
    user: environment.POSTGRES_USER,
    password: environment.POSTGRES_PASSWORD,
    options: '-c search_path=' + schema,
  });
  const db = base.mongo.cliente.db('attempt_test_' + randomUUID().replaceAll('-', ''));
  connections = { ...base, postgres, mongo: { ...base.mongo, db } };
  await crearColecciones(db);
  await cargarDataset(db);
  await reset(connections.neo4j);
  const graph = crearAplicadorGrafo(connections.neo4j);
  synchronization = crearProcesadorSincronizacion(
    crearOutboxRepository(postgres),
    {
      aplicar(event) {
        return failGraph
          ? Promise.reject(new Error('Simulated graph outage'))
          : graph.aplicar(event);
      },
    },
    { logger: loggerSilencioso, esperaBaseMs: 0 },
  );
  const accounts = createAccountRepository(postgres);
  const tokens = createSessionTokens(environment.JWT_SECRET);
  async function auth(id: string) {
    const account = await accounts.findById(fixture(id));
    if (!account) throw new Error('Missing account fixture ' + id);
    return 'Bearer ' + (await tokens.issue(account));
  }
  [ana, bruno] = await Promise.all([auth('0101'), auth('0102')]);
  app = makeApp();
}, 60_000);

afterAll(async () => {
  try {
    if (connections) {
      try {
        await reset(connections.neo4j);
      } finally {
        await connections.mongo.db.dropDatabase();
      }
    }
  } finally {
    if (connections) await cerrarConexiones(connections);
    if (schema) await eliminarEsquemaDePrueba(admin, schema);
    await admin?.end();
  }
}, 60_000);

const profile = (token: string, server = app) =>
  request(server).get('/api/profile').set('Authorization', token);
const path = (token: string, attemptId: string) =>
  request(app)
    .get('/api/profile/attempts/' + attemptId + '/path')
    .set('Authorization', token);
const list = (token: string, query: Record<string, string | number> = {}) =>
  request(app).get('/api/evidence').set('Authorization', token).query(query);
const get = (token: string, id: string, server = app) =>
  request(server)
    .get('/api/evidence/' + id)
    .set('Authorization', token);
const create = (token: string, attempt_id: string, server = app) =>
  request(server).post('/api/evidence').set('Authorization', token).send({ attempt_id });
const patch = (token: string, id: string, body: Record<string, unknown>) =>
  request(app)
    .patch('/api/evidence/' + id)
    .set('Authorization', token)
    .send(body);
const remove = (token: string, id: string) =>
  request(app)
    .delete('/api/evidence/' + id)
    .set('Authorization', token);

describe('F3a profile and evidence', () => {
  it('integrates account, progress, catalog and snapshot; filters C-04 results by owner', async () => {
    expect((await request(app).get('/api/profile')).status).toBe(401);
    const result = await profile(ana);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const view = Profile.parse(result.body);
    expect(view.summary).toEqual({ completed_attempts: 3, evidence_count: 1 });
    expect(view.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: communication,
          visual_type: 'VOICE',
          current_level: 75,
          classification: 'STRENGTH',
        }),
      ]),
    );
    expect(view.recommendations.map(({ simulation }) => simulation.id)).toContain(deliveries);
    expect(view.recent_evidence[0]).toMatchObject({
      id: originalEvidence,
      description: expect.any(String),
    });
    expect(view.incomplete_data).toEqual([]);
    expect(view.pending_sync_count).toBe(0);
    const skills = await request(app).get('/api/profile/skills').set('Authorization', ana);
    expect(ProfileSkills.parse(skills.body).items).toEqual(view.skills);
    const recommendations = await request(app)
      .get('/api/profile/recommendations')
      .set('Authorization', ana)
      .query({ limit: 1 });
    expect(Recommendations.parse(recommendations.body).items).toHaveLength(1);
    const evolution = await request(app)
      .get('/api/profile/skills/' + communication + '/evolution')
      .set('Authorization', ana);
    const progress = SkillEvolution.parse(evolution.body);
    expect(progress.current_level).toBe(75);
    expect(progress.skill).toEqual({
      id: communication,
      name: 'Comunicación efectiva',
      target: 75,
    });
    expect(progress.points.length).toBeGreaterThan(0);
    const filtered = EvidenceList.parse((await list(ana, { skill_id: communication })).body);
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({ id: originalEvidence, active_shares: 1 });
    expect(
      EvidenceList.parse((await list(ana, { skill_id: communication, offset: 10 })).body),
    ).toEqual({ items: [], total: 1 });
    expect(EvidenceList.parse((await list(bruno, { skill_id: communication })).body)).toEqual({
      items: [],
      total: 0,
    });
  });

  it('updates a recommendation after an actual F2 response and returns the complete path while projection is pending', async () => {
    const before = Profile.parse((await profile(bruno)).body);
    expect(before.recommendations.map(({ simulation }) => simulation.id)).toContain(deliveries);
    const started = await request(app)
      .post(basePath)
      .set('Authorization', bruno)
      .send({ simulation_id: deliveries });
    const { attempt } = AttemptStarted.parse(started.body);
    failGraph = true;
    try {
      const answered = await request(app)
        .post(basePath + '/' + attempt.id + '/responses')
        .set('Authorization', bruno)
        .send(delivery);
      expect(answered.status).toBe(201);
      expect(ResponseRecorded.parse(answered.body).synchronization.graph).toBe('PENDING');
      const pending = Profile.parse((await profile(bruno)).body);
      expect(pending.pending_sync_count).toBe(2);
      expect(pending.recommendations.map(({ simulation }) => simulation.id)).toContain(deliveries);
      const journey = AttemptPath.parse((await path(bruno, attempt.id)).body);
      expect(journey.attempt).toMatchObject({ status: 'COMPLETED', score: 90 });
      expect(journey.graph_pending).toBe(true);
      expect(journey.decisions).toHaveLength(1);
      expect(journey.decisions[0]).toMatchObject({
        step: { id: delivery.step_id, title: expect.any(String) },
        option: { id: delivery.option_id, description: expect.any(String) },
        feedback: { comment: expect.any(String) },
      });
      expect((await path(ana, attempt.id)).status).toBe(404);
    } finally {
      failGraph = false;
    }
    await synchronization.procesarPendientes();
    const after = Profile.parse((await profile(bruno)).body);
    expect(after.pending_sync_count).toBe(0);
    expect(after.recommendations.map(({ simulation }) => simulation.id)).not.toContain(deliveries);
    expect(after.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: timeManagement, current_level: 90 })]),
    );
    expect(AttemptPath.parse((await path(bruno, attempt.id)).body).graph_pending).toBe(false);
  });

  it('creates one immutable snapshot, updates owned metadata and removes document and projection', async () => {
    expect((await create(bruno, fixture('0702'))).status).toBe(404);
    expect((await create(ana, fixture('0704'))).body.error.code).toBe('ATTEMPT_NOT_COMPLETED');
    expect((await create(ana, fixture('0701'))).body.error.code).toBe('EVIDENCE_ALREADY_EXISTS');
    const results = await Promise.all([create(ana, fixture('0702')), create(ana, fixture('0702'))]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const created = EvidenceMutation.parse(results.find(({ status }) => status === 201)?.body);
    const id = created.evidence.id;
    expect(created.evidence).toMatchObject({ visibility: 'PRIVATE', attempt_id: fixture('0702') });
    expect(created.synchronization.graph).toBe('APPLIED');
    expect((await get(bruno, id)).status).toBe(404);
    expect((await patch(bruno, id, { visibility: 'PUBLIC' })).status).toBe(404);
    expect((await remove(bruno, id)).status).toBe(404);
    expect((await patch(ana, id, {})).status).toBe(400);
    const before = EvidenceDetail.parse((await get(ana, id)).body);
    expect(before.content).toMatchObject({
      score: 40,
      simulation: { id: deliveries },
      decisions: [{ sequence: 1 }],
    });
    const updated = EvidenceUpdate.parse(
      (await patch(ana, id, { title: 'Evidencia revisada', visibility: 'PUBLIC' })).body,
    );
    expect(updated.evidence).toMatchObject({ title: 'Evidencia revisada', visibility: 'PUBLIC' });
    expect(updated.synchronization?.graph).toBe('APPLIED');
    const visible = EvidenceUpdate.parse((await patch(ana, id, { visibility: 'PRIVATE' })).body);
    expect(visible.synchronization).toBeNull();
    expect(EvidenceDetail.parse((await get(ana, id)).body).content).toEqual(before.content);
    const filtered = EvidenceList.parse((await list(ana, { skill_id: timeManagement })).body);
    expect(filtered.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, title: 'Evidencia revisada' })]),
    );
    const deleted = await remove(ana, id);
    expect(deleted.body).toMatchObject({ deleted: true, synchronization: { graph: 'APPLIED' } });
    expect((await get(ana, id)).status).toBe(404);
    expect(await connections.mongo.db.collection('evidencias').countDocuments()).toBe(1);
    expect(
      EvidenceList.parse((await list(ana, { skill_id: timeManagement })).body).items.some(
        (item) => item.id === id,
      ),
    ).toBe(false);
  });

  it('serves partial profile data when a secondary base is down', async () => {
    const down = crearConexiones({
      ...environment,
      NEO4J_BOLT_PORT: 6,
      MONGO_PORT: 6,
      DB_TIMEOUT_MS: 250,
    });
    try {
      const partialGraph = Profile.parse((await profile(ana, makeApp({ neo4j: down.neo4j }))).body);
      expect(partialGraph).toMatchObject({
        incomplete_data: ['graph'],
        skills: [],
        recommendations: [],
      });
      expect(partialGraph.recent_evidence).toHaveLength(1);
      const partialDocument = Profile.parse(
        (await profile(ana, makeApp({ mongo: down.mongo }))).body,
      );
      expect(partialDocument).toMatchObject({
        incomplete_data: ['document'],
        recent_evidence: [],
        summary: { evidence_count: 1 },
      });
      expect(partialDocument.skills.length).toBeGreaterThan(0);
      const direct = await get(ana, originalEvidence, makeApp({ mongo: down.mongo }));
      expect(direct.status).toBe(503);
      const creation = await create(ana, fixture('0703'), makeApp({ mongo: down.mongo }));
      expect(creation.status).toBe(503);
      expect(EvidenceList.parse((await list(ana)).body).total).toBe(1);
    } finally {
      await cerrarConexiones(down);
    }
  });

  it('compensates a snapshot when PostgreSQL rejects the evidence transaction', async () => {
    const sql = connections.postgres;
    await sql.query(`CREATE FUNCTION reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture rejects evidence'; END; $$;
      CREATE TRIGGER reject_evidence BEFORE INSERT ON evidencia
      FOR EACH ROW EXECUTE FUNCTION reject_evidence()`);
    try {
      expect((await create(ana, fixture('0703'))).status).toBe(500);
      expect(EvidenceList.parse((await list(ana)).body).total).toBe(1);
      expect(await connections.mongo.db.collection('evidencias').countDocuments()).toBe(1);
    } finally {
      await sql.query('DROP TRIGGER reject_evidence ON evidencia; DROP FUNCTION reject_evidence()');
    }
  });
});
