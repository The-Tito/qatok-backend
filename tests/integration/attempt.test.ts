import { randomUUID } from 'node:crypto';
import {
  AttemptDetail,
  AttemptList,
  AttemptMutation,
  AttemptStarted,
  ResponseRecorded,
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
const negotiation = fixture('0301');
const deliveries = fixture('0302');
const first = { step_id: fixture('0401'), option_id: fixture('0501') };
const terminal = { step_id: fixture('0402'), option_id: fixture('0504') };
const delivery = { step_id: fixture('0404'), option_id: fixture('0508') };
let admin: Client;
let schema: string;
let connections: Conexiones;
let app: ReturnType<typeof appConRutas>;
let synchronization: ReturnType<typeof crearProcesadorSincronizacion>;
let ana: string;
let bruno: string;
let carla: string;
let failGraph = false;

function makeApp(mongo = connections.mongo) {
  return appConRutas(
    crearRutas(
      crearControladores({ ...connections, mongo }, environment, loggerSilencioso, synchronization),
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
  [ana, bruno, carla] = await Promise.all([auth('0101'), auth('0102'), auth('0103')]);
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

const start = (auth: string, simulation_id: string) =>
  request(app).post(basePath).set('Authorization', auth).send({ simulation_id });
const detail = (auth: string, id: string) =>
  request(app)
    .get(basePath + '/' + id)
    .set('Authorization', auth);
const respond = async (auth: string, id: string, input: typeof first, server = app) =>
  request(server)
    .post(basePath + '/' + id + '/responses')
    .set('Authorization', auth)
    .send(input);
const abandon = (auth: string, id: string) =>
  request(app)
    .post(basePath + '/' + id + '/abandon')
    .set('Authorization', auth);

describe('F2 attempts', () => {
  it('starts only one attempt and conceals it from other players', async () => {
    expect((await request(app).get(basePath)).status).toBe(401);
    expect((await start(bruno, fixture('0303'))).body.error.code).toBe('SIMULATION_NOT_PUBLISHED');
    expect((await start(bruno, randomUUID())).status).toBe(404);
    const outcomes = await Promise.all([start(bruno, negotiation), start(bruno, negotiation)]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual([201, 409]);
    const created = AttemptStarted.parse(outcomes.find(({ status }) => status === 201)?.body);
    const conflict = outcomes.find(({ status }) => status === 409);
    expect(conflict?.body.error).toMatchObject({
      code: 'ACTIVE_ATTEMPT_EXISTS',
      details: { attempt_id: created.attempt.id },
    });
    expect(created.attempt.simulation).toEqual({ id: negotiation, title: expect.any(String) });
    expect(created.synchronization.graph).toBe('APPLIED');
    expect(created.current_step.id).toBe(first.step_id);
    expect(Object.keys(created.current_step.options[0]!).sort()).toEqual(['description', 'id']);
    expect((await detail(ana, created.attempt.id)).status).toBe(404);
    expect((await respond(ana, created.attempt.id, first)).status).toBe(404);
    expect((await abandon(ana, created.attempt.id)).status).toBe(404);
    const page = await request(app)
      .get(basePath)
      .set('Authorization', bruno)
      .query({ status: 'IN_PROGRESS' });
    expect(AttemptList.parse(page.body)).toEqual({ total: 1, items: [created.attempt] });
    const emptyPage = await request(app)
      .get(basePath)
      .set('Authorization', bruno)
      .query({ offset: 30 });
    expect(AttemptList.parse(emptyPage.body)).toEqual({ total: 1, items: [] });
    expect(
      AttemptMutation.parse((await abandon(bruno, created.attempt.id)).body).attempt.status,
    ).toBe('ABANDONED');
  });

  it('resumes after a response and completes with its score after deactivation', async () => {
    const created = AttemptStarted.parse((await start(bruno, negotiation)).body);
    const id = created.attempt.id;
    const wrong = await respond(bruno, id, { ...first, option_id: terminal.option_id });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('OPTION_NOT_IN_STEP');
    const results = await Promise.all([respond(bruno, id, first), respond(bruno, id, first)]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 409)?.body.error.code).toBe('STEP_NOT_CURRENT');
    const advance = ResponseRecorded.parse(results.find(({ status }) => status === 201)?.body);
    expect(advance).toMatchObject({
      response: { sequence: 1 },
      next_step: { id: terminal.step_id },
    });
    expect(advance.consequences.length).toBeGreaterThan(0);
    expect(advance.feedback.comment.length).toBeGreaterThan(0);
    expect(AttemptDetail.parse((await detail(bruno, id)).body)).toMatchObject({
      current_step: { id: terminal.step_id },
      responses: [advance.response],
    });
    const deactivated = await request(app)
      .post('/api/admin/simulations/' + negotiation + '/deactivate')
      .set('Authorization', carla);
    expect(deactivated.status).toBe(200);
    expect((await start(ana, negotiation)).body.error.code).toBe('SIMULATION_NOT_PUBLISHED');
    const finished = await respond(bruno, id, terminal);
    expect(finished.status).toBe(201);
    const parsed = ResponseRecorded.parse(finished.body);
    expect(parsed).toMatchObject({
      attempt: { status: 'COMPLETED', score: 92.5 },
      response: { sequence: 2 },
      next_step: null,
      synchronization: { graph: 'APPLIED' },
    });
    expect(parsed.synchronization.event_ids).toHaveLength(2);
    expect(parsed.attempt.finished_at).toBe(parsed.response.answered_at);
    const replay = await respond(bruno, id, terminal);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('ATTEMPT_NOT_IN_PROGRESS');
    expect(AttemptDetail.parse((await detail(bruno, id)).body).responses).toEqual([
      advance.response,
      parsed.response,
    ]);
  });

  it('serializes a terminal response and abandonment', async () => {
    const { attempt } = AttemptStarted.parse((await start(bruno, deliveries)).body);
    const [response, abandoned] = await Promise.all([
      respond(bruno, attempt.id, delivery),
      abandon(bruno, attempt.id),
    ]);
    const read = AttemptDetail.parse((await detail(bruno, attempt.id)).body);
    if (response.status === 201) {
      expect(abandoned.status).toBe(409);
      expect(read).toMatchObject({
        attempt: { status: 'COMPLETED', score: 90 },
        responses: [{ sequence: 1 }],
      });
    } else {
      expect(response.status).toBe(409);
      expect(abandoned.status).toBe(200);
      expect(read).toMatchObject({ attempt: { status: 'ABANDONED', score: null }, responses: [] });
    }
    expect(read.current_step).toBeNull();
  });

  it('rolls back on MongoDB failure and keeps the answer when Neo4j is unavailable', async () => {
    const { attempt } = AttemptStarted.parse((await start(bruno, deliveries)).body);
    const unavailable = crearConexiones({ ...environment, MONGO_PORT: 6, DB_TIMEOUT_MS: 250 });
    try {
      const result = await respond(bruno, attempt.id, delivery, makeApp(unavailable.mongo));
      expect(result.status).toBe(503);
      expect(result.body.error).toMatchObject({
        code: 'DATABASE_UNAVAILABLE',
        details: { database: 'document' },
      });
    } finally {
      await cerrarConexiones(unavailable);
    }
    expect(AttemptDetail.parse((await detail(bruno, attempt.id)).body)).toMatchObject({
      attempt: { status: 'IN_PROGRESS' },
      responses: [],
    });

    failGraph = true;
    const recorded = await respond(bruno, attempt.id, delivery).finally(() => {
      failGraph = false;
    });
    expect(recorded.status).toBe(201);
    const confirmed = ResponseRecorded.parse(recorded.body);
    expect(confirmed.synchronization.graph).toBe('PENDING');
    expect(AttemptDetail.parse((await detail(bruno, attempt.id)).body)).toMatchObject({
      attempt: { status: 'COMPLETED', score: 90 },
      responses: [confirmed.response],
    });
    const ids = confirmed.synchronization.event_ids;
    const outbox = crearOutboxRepository(connections.postgres);
    expect(await outbox.estanAplicados(ids)).toBe(false);
    await synchronization.procesarPendientes();
    expect(await outbox.estanAplicados(ids)).toBe(true);
    const { records } = await connections.neo4j.executeQuery(
      `MATCH (i:Intento {id_intento: $id})-[:REGISTRA]->(r:Respuesta)
       RETURN i.estado AS status, i.puntuacion AS score, r.id_respuesta AS responseId`,
      { id: attempt.id },
    );
    expect(records.map((record) => record.toObject())).toEqual([
      { status: 'COMPLETADO', score: 90, responseId: confirmed.response.id },
    ]);
  });
});
