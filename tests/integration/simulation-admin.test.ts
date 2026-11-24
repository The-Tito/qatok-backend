import { randomUUID } from 'node:crypto';
import {
  AdminSimulation,
  AdminSimulationList,
  SimulationContent,
  SimulationMutation,
  type SimulationStep,
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
import { crearColecciones } from '../../database/document/ejecutar.mjs';
import {
  conectar,
  eliminarEsquemaDePrueba,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { appConRutas, loggerSilencioso } from '../apoyo/app-de-prueba.js';

const environment = cargarEntorno();
const path = '/api/admin/simulations';
const simulations = new Set<string>();
const steps = new Set<string>();
const options = new Set<string>();
let schemaClient: Client;
let schema: string;
let connections: Conexiones;
let app: ReturnType<typeof appConRutas>;
let sync: ReturnType<typeof crearProcesadorSincronizacion>;
let adminToken: string;
let studentToken: string;
let skillId: string;
let failGraph = false;

function makeApp(mongo = connections.mongo) {
  return appConRutas(
    crearRutas(crearControladores({ ...connections, mongo }, environment, loggerSilencioso, sync)),
  );
}

beforeAll(async () => {
  schemaClient = conectar();
  await schemaClient.connect();
  schema = await prepararEsquemaDePrueba(schemaClient);
  await schemaClient.query('COMMIT');
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
  const db = base.mongo.cliente.db('simulation_admin_test_' + randomUUID().replaceAll('-', ''));
  connections = { ...base, postgres, mongo: { ...base.mongo, db } };
  await crearColecciones(db);
  const graph = crearAplicadorGrafo(connections.neo4j);
  sync = crearProcesadorSincronizacion(
    crearOutboxRepository(postgres),
    {
      aplicar(event) {
        if (failGraph) return Promise.reject(new Error('Simulated graph outage'));
        return graph.aplicar(event);
      },
    },
    { logger: loggerSilencioso, esperaBaseMs: 0 },
  );
  app = makeApp();
  const { rows } = await postgres.query<{ id: string; role: string }>(
    'SELECT id_usuario AS id, rol AS role FROM usuario',
  );
  const accounts = createAccountRepository(postgres);
  const tokens = createSessionTokens(environment.JWT_SECRET);
  async function authorization(role: string) {
    const row = rows.find((value) => value.role === role);
    const user = row ? await accounts.findById(row.id) : null;
    if (!user) throw new Error('Missing account fixture for ' + role);
    return 'Bearer ' + (await tokens.issue(user));
  }
  adminToken = await authorization('ADMIN');
  studentToken = await authorization('ESTUDIANTE');
  const skill = await request(app)
    .post('/api/admin/skills')
    .set('Authorization', adminToken)
    .send({
      name: 'Simulation admin ' + randomUUID(),
      description: 'Fixture',
      category: 'Practice',
    });
  expect(skill.status, JSON.stringify(skill.body)).toBe(201);
  expect(skill.body.synchronization.graph).toBe('APPLIED');
  skillId = skill.body.skill.id as string;
});

afterAll(async () => {
  try {
    if (connections) {
      try {
        await connections.neo4j.executeQuery(
          `MATCH (n) WHERE n.id_simulacion IN $simulations OR n.id_paso IN $steps
           OR n.id_opcion IN $options OR n.id_habilidad = $skill DETACH DELETE n`,
          {
            simulations: [...simulations],
            steps: [...steps],
            options: [...options],
            skill: skillId ?? null,
          },
        );
      } finally {
        await connections.mongo.db.dropDatabase();
      }
    }
  } finally {
    if (connections) await cerrarConexiones(connections);
    if (schema) await eliminarEsquemaDePrueba(schemaClient, schema);
    await schemaClient?.end();
  }
});

const metadata = () => ({
  title: 'Negociar una entrega',
  description: 'Escenario de prueba',
  difficulty: 'BASIC',
  estimated_duration: 15,
  skills: [{ skill_id: skillId, weight: 1, expected_level: 60 }],
});

function emailStep(): SimulationStep {
  const id = randomUUID();
  const optionId = randomUUID();
  steps.add(id);
  options.add(optionId);
  return {
    id,
    order: 1,
    title: 'Entrega parcial',
    description: 'Prepara una propuesta.',
    type: 'EMAIL',
    context: {
      sender: 'Cliente',
      subject: 'Fecha de entrega',
      body: ' ¿Podemos acordar un avance? ',
    },
    options: [
      {
        id: optionId,
        description: 'Ofrecer un avance',
        score: 80.25,
        next_step_id: null,
        consequences: [{ description: 'Se acuerda la entrega', impact: 'POSITIVE', type: 'TIME' }],
        feedback: {
          type: 'CORRECT',
          comment: 'Ofreciste una alternativa',
          recommendation: 'Confirma el plazo',
        },
      },
    ],
  };
}

const admin = () => request(app);
async function createDraft() {
  const result = await admin().post(path).set('Authorization', adminToken).send(metadata());
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const simulation = AdminSimulation.parse(result.body);
  simulations.add(simulation.id);
  return simulation.id;
}
const putContent = (id: string, version: number | null, contentSteps: SimulationStep[]) =>
  admin()
    .put(path + '/' + id + '/content')
    .set('Authorization', adminToken)
    .send({ version, steps: contentSteps });
const publish = (id: string, version: number) =>
  admin()
    .post(path + '/' + id + '/publish')
    .set('Authorization', adminToken)
    .send({ version });

async function storedReference(id: string) {
  const { rows } = await connections.postgres.query<{ state: string; revision: string | null }>(
    'SELECT estado AS state, id_revision_publicada AS revision FROM simulacion WHERE id_simulacion = $1',
    [id],
  );
  return rows[0];
}

describe('simulation administration API', () => {
  it('requires ADMIN and validates skills, precision, pagination and draft metadata', async () => {
    expect((await admin().get(path)).status).toBe(401);
    expect(
      (await admin().post(path).set('Authorization', studentToken).send(metadata())).status,
    ).toBe(403);
    const missingSkill = await admin()
      .post(path)
      .set('Authorization', adminToken)
      .send({
        ...metadata(),
        skills: [{ skill_id: randomUUID(), weight: 1, expected_level: 60 }],
      });
    expect(missingSkill.body.error.code).toBe('SKILL_NOT_FOUND');
    const invalidWeight = await admin()
      .post(path)
      .set('Authorization', adminToken)
      .send({
        ...metadata(),
        skills: [{ skill_id: skillId, weight: 0.001, expected_level: 60 }],
      });
    expect(invalidWeight.status).toBe(400);
    const id = await createDraft();
    const edited = await admin()
      .put(path + '/' + id)
      .set('Authorization', adminToken)
      .send({ ...metadata(), title: 'Actualizar escenario' });
    expect(AdminSimulation.parse(edited.body)).toMatchObject({
      id,
      title: 'Actualizar escenario',
      status: 'DRAFT',
    });
    const list = await admin()
      .get(path)
      .set('Authorization', adminToken)
      .query({ status: 'DRAFT', limit: 1 });
    const drafts = AdminSimulationList.parse(list.body);
    expect(drafts.items).toHaveLength(1);
    expect(drafts.total).toBeGreaterThanOrEqual(2);
    expect(drafts.items[0]?.status).toBe('DRAFT');
  });

  it('requires the version the administrator saw and rejects invalid branches', async () => {
    const id = await createDraft();
    expect((await publish(id, 1)).body.error.code).toBe('MISSING_CONTENT');
    const step = emailStep();
    expect(SimulationContent.parse((await putContent(id, null, [step])).body)).toEqual({
      version: 1,
      steps: [step],
    });
    const bad = {
      ...step,
      options: step.options.map((option) => ({ ...option, next_step_id: step.id })),
    };
    expect(SimulationContent.parse((await putContent(id, 1, [bad])).body).version).toBe(2);
    expect((await putContent(id, 1, [step])).body.error.code).toBe('STALE_CONTENT_VERSION');
    expect((await publish(id, 1)).body.error.code).toBe('STALE_CONTENT_VERSION');
    expect((await publish(id, 2)).body.error.code).toBe('INVALID_BRANCHES');
    expect(await storedReference(id)).toEqual({ state: 'BORRADOR', revision: null });
  });

  it('publishes the exact MongoDB revision, projects it in Neo4j and retains it after deactivation', async () => {
    const id = await createDraft();
    const step = emailStep();
    await putContent(id, null, [step]);
    const result = SimulationMutation.parse((await publish(id, 1)).body);
    expect(result).toMatchObject({
      simulation: { status: 'PUBLISHED' },
      synchronization: { graph: 'APPLIED' },
    });
    const reference = await storedReference(id);
    expect(reference?.state).toBe('PUBLICADA');
    const revision = await connections.mongo.db
      .collection<{ _id: string; version: number }>('revisiones_simulacion')
      .findOne({ _id: reference?.revision ?? '' });
    expect(revision).toMatchObject({
      id_simulacion: id,
      version: 1,
      pasos: [{ id_paso: step.id }],
    });
    const graph = await connections.neo4j.executeQuery(
      'MATCH (:Simulacion {id_simulacion: $id})-[:CONTIENE]->(step:Paso) RETURN step.id_paso AS id',
      { id },
    );
    expect(graph.records.map((record) => record.get('id'))).toEqual([step.id]);
    expect(
      (
        await admin()
          .get('/api/simulations/' + id)
          .set('Authorization', studentToken)
      ).status,
    ).toBe(200);
    const inactive = await admin()
      .post(path + '/' + id + '/deactivate')
      .set('Authorization', adminToken);
    expect(SimulationMutation.parse(inactive.body).simulation.status).toBe('INACTIVE');
    expect(
      (
        await admin()
          .get('/api/simulations/' + id)
          .set('Authorization', studentToken)
      ).status,
    ).toBe(404);
    expect((await storedReference(id))?.revision).toBe(reference?.revision);
    const content = await admin()
      .get(path + '/' + id + '/content')
      .set('Authorization', adminToken);
    expect(SimulationContent.parse(content.body)).toEqual({ version: 1, steps: [step] });
    expect(
      (
        await admin()
          .delete(path + '/' + id)
          .set('Authorization', adminToken)
      ).status,
    ).toBe(409);
  });

  it('serializes editing against publication so an outdated revision cannot win', async () => {
    const id = await createDraft();
    const step = emailStep();
    const updated = { ...step, title: 'Entrega actualizada' };
    await putContent(id, null, [step]);
    const [publication, edit] = await Promise.all([publish(id, 1), putContent(id, 1, [updated])]);
    expect([publication.status, edit.status].sort()).toEqual([200, 409]);
    if (edit.status === 200) expect((await publish(id, 2)).status).toBe(200);
    const content = await admin()
      .get(path + '/' + id + '/content')
      .set('Authorization', adminToken);
    expect(SimulationContent.parse(content.body)).toEqual(
      edit.status === 200 ? { version: 2, steps: [updated] } : { version: 1, steps: [step] },
    );
  });

  it('retries a candidate after SQL rollback and can replace an abandoned older candidate', async () => {
    for (const editFirst of [false, true]) {
      const id = await createDraft();
      const step = emailStep();
      await putContent(id, null, [step]);
      const pool = connections.postgres;
      await pool.query(
        "ALTER TABLE evento_sincronizacion ADD CONSTRAINT test_fail_publish CHECK (tipo <> 'SIMULACION_PUBLICADA') NOT VALID",
      );
      try {
        expect((await publish(id, 1)).status).toBe(500);
      } finally {
        await pool.query('ALTER TABLE evento_sincronizacion DROP CONSTRAINT test_fail_publish');
      }
      const revisions = connections.mongo.db.collection<{
        _id: string;
        id_simulacion: string;
        version: number;
      }>('revisiones_simulacion');
      const candidate = await revisions.findOne({ id_simulacion: id });
      expect(candidate?.version).toBe(1);
      expect(await storedReference(id)).toEqual({ state: 'BORRADOR', revision: null });
      if (editFirst)
        expect((await putContent(id, 1, [{ ...step, title: 'Otra versión' }])).status).toBe(200);
      const retried = await publish(id, editFirst ? 2 : 1);
      expect(retried.status).toBe(200);
      const reference = await storedReference(id);
      expect(await revisions.countDocuments({ id_simulacion: id })).toBe(1);
      if (editFirst) expect(reference?.revision).not.toBe(candidate?._id);
      else expect(reference?.revision).toBe(candidate?._id);
    }
  });

  it('leaves a draft when MongoDB is unavailable and keeps a confirmed revision when Neo4j fails', async () => {
    const id = await createDraft();
    await putContent(id, null, [emailStep()]);
    const unavailable = crearConexiones({ ...environment, MONGO_PORT: 6, DB_TIMEOUT_MS: 250 });
    try {
      const result = await request(makeApp(unavailable.mongo))
        .post(path + '/' + id + '/publish')
        .set('Authorization', adminToken)
        .send({ version: 1 });
      expect(result.status).toBe(503);
      expect(result.body.error.details.database).toBe('document');
      expect(await storedReference(id)).toEqual({ state: 'BORRADOR', revision: null });
    } finally {
      await cerrarConexiones(unavailable);
    }
    failGraph = true;
    try {
      const result = SimulationMutation.parse((await publish(id, 1)).body);
      expect(result.synchronization.graph).toBe('PENDING');
      expect((await storedReference(id))?.revision).toBeTruthy();
    } finally {
      failGraph = false;
      await sync.procesarPendientes();
    }
  });

  it('deletes drafts and their MongoDB content without affecting published simulations', async () => {
    const id = await createDraft();
    await putContent(id, null, [emailStep()]);
    const result = await admin()
      .delete(path + '/' + id)
      .set('Authorization', adminToken);
    expect(result.status).toBe(204);
    expect(await storedReference(id)).toBeUndefined();
    expect(
      await connections.mongo.db
        .collection<{ _id: string }>('contenidos_simulacion')
        .findOne({ _id: id }),
    ).toBeNull();
  });
});
