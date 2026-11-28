import { randomUUID } from 'node:crypto';
import {
  Account,
  Deletion,
  Registration,
  Session,
  SimulationCatalog,
  SkillMutation,
} from '@qatok/shared';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
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
import { crearRutas } from '../../backend/src/routes/index.js';
import { crearEvidenciaRepository } from '../../backend/src/repositories/document/evidencia.repository.js';
import { crearAplicadorGrafo } from '../../backend/src/repositories/graph/sincronizacion.repository.js';
import { crearOutboxRepository } from '../../backend/src/repositories/relational/outbox.repository.js';
import { crearProcesadorSincronizacion } from '../../backend/src/sync/procesador.js';
import { cargarDataset, crearColecciones, leerDataset } from '../../database/document/ejecutar.mjs';
import {
  conectar,
  eliminarEsquemaDePrueba,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { appConRutas, loggerSilencioso } from '../apoyo/app-de-prueba.js';

const environment = cargarEntorno();
const dataset = leerDataset();
const password = 'Example password for tests';
let admin: Client;
let schema: string;
let connections: Conexiones;
let app: ReturnType<typeof appConRutas>;
let synchronization: ReturnType<typeof crearProcesadorSincronizacion>;
let failGraph = false;
const accounts = new Set<string>();
const skills = new Set<string>();

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
  const db = base.mongo.cliente.db('f1_test_' + randomUUID().replaceAll('-', ''));
  connections = { ...base, postgres, mongo: { ...base.mongo, db } };
  await crearColecciones(db);
  await cargarDataset(db);
  const graph = crearAplicadorGrafo(connections.neo4j);
  synchronization = crearProcesadorSincronizacion(
    crearOutboxRepository(postgres),
    {
      aplicar(event) {
        if (failGraph) return Promise.reject(new Error('Simulated connection failure'));
        return graph.aplicar(event);
      },
    },
    { logger: loggerSilencioso, esperaBaseMs: 0 },
  );
  app = appConRutas(
    crearRutas(crearControladores(connections, environment, loggerSilencioso, synchronization)),
  );
});

afterAll(async () => {
  try {
    if (connections) {
      await connections.neo4j.executeQuery(
        'MATCH (u:Usuario) WHERE u.id_usuario IN $accounts DETACH DELETE u',
        { accounts: [...accounts] },
      );
      await connections.neo4j.executeQuery(
        'MATCH (h:Habilidad) WHERE h.id_habilidad IN $skills DETACH DELETE h',
        { skills: [...skills] },
      );
      await connections.mongo.db.dropDatabase();
    }
  } finally {
    if (connections) await cerrarConexiones(connections);
    if (schema) await eliminarEsquemaDePrueba(admin, schema);
    await admin?.end();
  }
});

const authorize = (token: string) => 'Bearer ' + token;

async function register(email = randomUUID() + '@example.test') {
  const result = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test participant', email, password });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const registered = Registration.parse(result.body);
  accounts.add(registered.user.id);
  return registered;
}

describe('F1 API contract', () => {
  it('registers, normalizes email, rejects duplicates and logs in without exposing credentials', async () => {
    const email = randomUUID() + '@example.test';
    const registered = await register('  ' + email.toUpperCase() + '  ');
    expect(registered.user).toMatchObject({ email, role: 'STUDENT', status: 'ACTIVE' });
    expect(registered.synchronization.graph).toBe('APPLIED');
    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email, password });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(Session.parse(login.body).user).toEqual(registered.user);
    expect(Object.keys(login.body.user).sort()).toEqual([
      'email',
      'id',
      'name',
      'registered_at',
      'role',
      'status',
    ]);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong password' });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects passwords exceeding 72 bytes and role injection', async () => {
    for (const fields of [{ password: 'ó'.repeat(37) }, { password, role: 'ADMIN' }]) {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test participant', email: 'tests@example.test', ...fields });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('creates a single account for concurrent registrations with the same normalized email', async () => {
    const email = randomUUID() + '@example.test';
    const responses = await Promise.all(
      [email, '  ' + email.toUpperCase() + '  '].map((address) =>
        request(app)
          .post('/api/auth/register')
          .send({ name: 'Test participant', email: address, password }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = responses.find((r) => r.status === 201);
    accounts.add(Registration.parse(winner?.body).user.id);
  });

  it('reads and edits the current account, and rejects expired, malformed or deactivated sessions', async () => {
    const { user, token } = await register();
    const authorized = authorize(token);
    expect(
      Account.parse((await request(app).get('/api/me').set('Authorization', authorized)).body),
    ).toEqual(user);
    const update = await request(app)
      .patch('/api/me')
      .set('Authorization', authorized)
      .send({ name: 'Updated name' });
    expect(Account.parse(update.body).name).toBe('Updated name');
    const expired = await new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('qatok-backend')
      .setAudience('qatok-api')
      .setExpirationTime(1)
      .sign(new TextEncoder().encode(environment.JWT_SECRET));
    for (const invalid of ['', 'Bearer malformed', authorize(expired)]) {
      expect((await request(app).get('/api/me').set('Authorization', invalid)).status).toBe(401);
    }
    await connections.postgres.query(
      "UPDATE usuario SET estado = 'INACTIVO' WHERE id_usuario = $1",
      [user.id],
    );
    expect((await request(app).get('/api/me').set('Authorization', authorized)).status).toBe(401);
    const inactive = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });
    expect(inactive.status).toBe(403);
    expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('checks the current admin role and handles skill CRUD and constraints', async () => {
    const { user, token } = await register();
    const authorized = authorize(token);
    const input = {
      name: 'Test skill ' + randomUUID(),
      description: 'Description',
      category: 'Practice',
      target_level: 65,
      visual_type: 'LEAF',
    };
    const create = () =>
      request(app).post('/api/admin/skills').set('Authorization', authorized).send(input);
    expect((await create()).body.error.code).toBe('FORBIDDEN');
    await connections.postgres.query("UPDATE usuario SET rol = 'ADMIN' WHERE id_usuario = $1", [
      user.id,
    ]);
    const created = SkillMutation.parse((await create()).body);
    skills.add(created.skill.id);
    expect(created.skill.visual_type).toBe('LEAF');
    expect((await create()).body.error.code).toBe('SKILL_ALREADY_EXISTS');
    const invalidType = await request(app)
      .post('/api/admin/skills')
      .set('Authorization', authorized)
      .send({ ...input, name: input.name + ' invalid', visual_type: 'WATER' });
    expect(invalidType.body.error.code).toBe('VALIDATION_ERROR');
    const { rows } = await connections.postgres.query<{ id: string }>(
      'SELECT id_habilidad AS id FROM simulacion_habilidad LIMIT 1',
    );
    const referenced = rows[0];
    if (!referenced) throw new Error('The fixture requires a skill in use.');
    const blocked = await request(app)
      .delete('/api/admin/skills/' + referenced.id)
      .set('Authorization', authorized);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SKILL_IN_USE');
    const path = '/api/admin/skills/' + created.skill.id;
    const update = await request(app)
      .put(path)
      .set('Authorization', authorized)
      .send({ ...input, target_level: 75, visual_type: null });
    expect(SkillMutation.parse(update.body).skill).toMatchObject({
      target_level: 75,
      visual_type: null,
    });
    const listed = await request(app).get('/api/skills').set('Authorization', authorized);
    expect(listed.body.items).toContainEqual(
      expect.objectContaining({ id: created.skill.id, target_level: 75, visual_type: null }),
    );
    expect(
      Deletion.parse((await request(app).delete(path).set('Authorization', authorized)).body)
        .deleted,
    ).toBe(true);
    await connections.postgres.query(
      "UPDATE usuario SET rol = 'ESTUDIANTE' WHERE id_usuario = $1",
      [user.id],
    );
    expect((await create()).status).toBe(403);
  });

  it('returns only published simulations and combines literal search, filters and pagination', async () => {
    const { token } = await register();
    const list = () => request(app).get('/api/simulations').set('Authorization', authorize(token));
    const first = SimulationCatalog.parse((await list().query({ limit: 1, offset: 0 })).body);
    expect(first.items).toHaveLength(1);
    expect(first.total).toBe(2);
    const empty = SimulationCatalog.parse((await list().query({ limit: 1, offset: 100 })).body);
    expect(empty).toEqual({ items: [], total: 2 });
    const item = first.items[0];
    const skill = item?.skills[0];
    if (!item || !skill)
      throw new Error('The fixture requires a published simulation with a skill.');
    const filtered = await list().query({
      search: item.title.toUpperCase(),
      difficulty: item.difficulty,
      skill_id: skill.id,
    });
    expect(SimulationCatalog.parse(filtered.body)).toEqual({ items: [item], total: 1 });
    expect(SimulationCatalog.parse((await list().query({ search: '%' })).body).total).toBe(0);
    expect((await list().query({ limit: 101 })).status).toBe(400);
    const draft = dataset.relacional.simulacion.find((s) => !s.id_revision_publicada);
    if (!draft) throw new Error('The fixture requires a draft.');
    const detail = (id: string) =>
      request(app)
        .get('/api/simulations/' + id)
        .set('Authorization', authorize(token));
    expect((await detail(draft.id_simulacion)).status).toBe(404);
    expect((await detail(item.id)).body).toEqual(item);
  });

  it('keeps a confirmed account when graph projection is pending', async () => {
    failGraph = true;
    try {
      const registered = await register();
      expect(registered.synchronization.graph).toBe('PENDING');
      expect(
        (await request(app).get('/api/me').set('Authorization', authorize(registered.token)))
          .status,
      ).toBe(200);
    } finally {
      failGraph = false;
      await synchronization.procesarPendientes();
    }
  });

  it('rolls account creation back if the outbox rejects the event', async () => {
    const pool = connections.postgres;
    const email = randomUUID() + '@example.test';
    await pool.query(
      "ALTER TABLE evento_sincronizacion ADD CONSTRAINT test_fail_registration CHECK (tipo <> 'USUARIO_CREADO') NOT VALID",
    );
    try {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test participant', email, password });
      expect(response.status).toBe(500);
      expect((await pool.query('SELECT 1 FROM usuario WHERE correo = $1', [email])).rowCount).toBe(
        0,
      );
    } finally {
      await pool.query('ALTER TABLE evento_sincronizacion DROP CONSTRAINT test_fail_registration');
    }
  });

  it('revokes the session and links even when MongoDB cleanup fails', async () => {
    const pool = connections.postgres;
    const id = dataset.documental.evidencias[0]?._id;
    const { rows } = await pool.query<{ email: string }>(
      'UPDATE usuario SET contrasena_hash = $1 WHERE id_usuario = (SELECT id_usuario FROM evidencia WHERE id_evidencia = $2) RETURNING correo AS email',
      [await bcrypt.hash(password, 10), id],
    );
    const owner = rows[0];
    if (!id || !owner) throw new Error('The fixture requires an evidence owner.');
    const login = await request(app).post('/api/auth/login').send({ email: owner.email, password });
    const authorized = authorize(Session.parse(login.body).token);
    // This fixture UUID is present in the shared graph. Leave it intact during this test.
    const graphUnavailable = crearProcesadorSincronizacion(
      crearOutboxRepository(pool),
      {
        aplicar: async () => {
          throw new Error('Simulated connection failure');
        },
      },
      { logger: loggerSilencioso },
    );
    const unavailable = crearConexiones({ ...environment, MONGO_PORT: 6, DB_TIMEOUT_MS: 250 });
    try {
      const deleteApp = appConRutas(
        crearRutas(
          crearControladores(
            { ...connections, mongo: unavailable.mongo },
            environment,
            loggerSilencioso,
            graphUnavailable,
          ),
        ),
      );
      const result = await request(deleteApp).delete('/api/me').set('Authorization', authorized);
      expect(Deletion.parse(result.body)).toMatchObject({
        deleted: true,
        synchronization: { graph: 'PENDING' },
      });
    } finally {
      await cerrarConexiones(unavailable);
    }
    expect((await request(app).get('/api/me').set('Authorization', authorized)).status).toBe(401);
    expect(
      (await pool.query('SELECT 1 FROM comparticion WHERE id_evidencia = $1', [id])).rowCount,
    ).toBe(0);
    const evidence = crearEvidenciaRepository(connections.mongo.db);
    expect(await evidence.obtener(id)).not.toBeNull();
    await evidence.removeByIds([id]);
    expect(await evidence.obtener(id)).toBeNull();
  });
});
