import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { EvidenceShare, EvidenceShareList, SharedEvidence } from '@qatok/shared';
import { Pool, type Client } from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../../backend/src/app.js';
import { cargarEntorno } from '../../backend/src/config/entorno.js';
import { crearControladores } from '../../backend/src/contenedor.js';
import {
  cerrarConexiones,
  crearConexiones,
  type Conexiones,
} from '../../backend/src/db/conexiones.js';
import { createSessionTokens } from '../../backend/src/lib/session.js';
import { createAccountRepository } from '../../backend/src/repositories/relational/account.repository.js';
import { crearRutas } from '../../backend/src/routes/index.js';
import { cargarDataset, crearColecciones } from '../../database/document/ejecutar.mjs';
import {
  conectar,
  eliminarEsquemaDePrueba,
  leerDataset,
  prepararEsquemaDePrueba,
} from '../../database/relational/ejecutar.mjs';
import { loggerSilencioso } from '../apoyo/app-de-prueba.js';

const environment = cargarEntorno();
const fixture = (suffix: string) => 'e0000000-0000-4000-8000-00000000' + suffix;
const evidenceId = fixture('1101');
const sharesPath = '/api/evidence/' + evidenceId + '/shares';
const publicPath = '/api/public/evidence/';
const data = leerDataset().comparticion;
const activeToken = data.find(
  (entry) => entry.estado === 'ACTIVA' && !entry.fecha_expiracion,
)!.token;
const expiredToken = data.find(
  (entry) => entry.estado === 'ACTIVA' && entry.fecha_expiracion,
)!.token;
const revokedToken = data.find((entry) => entry.estado === 'REVOCADA')!.token;
let admin: Client;
let schema: string;
let connections: Conexiones;
let app: ReturnType<typeof makeApp>;
let ana: string;
let bruno: string;

function makeApp(mongo = connections.mongo, logger = loggerSilencioso) {
  return crearApp({
    rutas: crearRutas(crearControladores({ ...connections, mongo }, environment, logger)),
    logger,
    corsOrigen: 'http://localhost:3000',
  });
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
  const db = base.mongo.cliente.db('share_test_' + randomUUID().replaceAll('-', ''));
  connections = { ...base, postgres, mongo: { ...base.mongo, db } };
  await crearColecciones(db);
  await cargarDataset(db);
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
    await connections?.mongo.db.dropDatabase();
  } finally {
    if (connections) await cerrarConexiones(connections);
    if (schema) await eliminarEsquemaDePrueba(admin, schema);
    await admin?.end();
  }
}, 60_000);

const create = (owner: string, body: Record<string, unknown> = {}) =>
  request(app).post(sharesPath).set('Authorization', owner).send(body);
const list = (owner: string) => request(app).get(sharesPath).set('Authorization', owner);
const revoke = (owner: string, id: string) =>
  request(app)
    .delete('/api/shares/' + id)
    .set('Authorization', owner);
const read = (token: string, server = app) => request(server).get(publicPath + token);

describe('F3b evidence sharing', () => {
  it('requires ownership and validates the create input', async () => {
    expect((await request(app).get(sharesPath)).status).toBe(401);
    expect((await request(app).post(sharesPath)).status).toBe(401);
    expect((await request(app).delete('/api/shares/' + fixture('1201'))).status).toBe(401);
    expect((await list(bruno)).status).toBe(404);
    expect((await create(bruno)).status).toBe(404);
    expect((await revoke(bruno, fixture('1201'))).status).toBe(404);
    expect((await revoke(ana, randomUUID())).status).toBe(404);
    expect((await create(ana, { expires_in_days: 0 })).status).toBe(400);
    expect((await create(ana, { expires_in_days: 91 })).status).toBe(400);
    expect((await create(ana, { recipient: ' ' })).status).toBe(400);
    expect((await create(ana, { recipient: 'x'.repeat(151) })).status).toBe(400);
  });

  it('issues distinct tokens and revokes a link without removing it from the list', async () => {
    const [one, two] = await Promise.all([
      request(app).post(sharesPath).set('Authorization', ana),
      create(ana, { expires_in_days: 1, recipient: '  Equipo de selección  ' }),
    ]);
    expect(one.status, JSON.stringify(one.body)).toBe(201);
    expect(two.status, JSON.stringify(two.body)).toBe(201);
    expect(one.headers['cache-control']).toBe('no-store');
    const first = EvidenceShare.parse(one.body);
    const second = EvidenceShare.parse(two.body);
    expect(first.token).toHaveLength(43);
    expect(Buffer.from(first.token, 'base64url')).toHaveLength(32);
    expect(second.token).not.toBe(first.token);
    expect(first.public_url).toBe(publicPath + first.token);
    expect(first).toMatchObject({ recipient: null, is_valid: true, status: 'ACTIVE' });
    expect(second.recipient).toBe('Equipo de selección');
    expect(Date.parse(first.expires_at!) - Date.parse(first.created_at)).toBe(30 * 86_400_000);
    expect(Date.parse(second.expires_at!) - Date.parse(second.created_at)).toBe(86_400_000);
    expect((await read(first.token)).status).toBe(200);
    expect((await revoke(ana, first.id)).status).toBe(204);
    expect((await revoke(ana, first.id)).status).toBe(204);
    const invalid = await read(first.token);
    expect(invalid.status).toBe(404);
    expect(invalid.body.error.code).toBe('INVALID_SHARE_LINK');
    const links = EvidenceShareList.parse((await list(ana)).body);
    expect(links.total).toBe(5);
    expect(links.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: 'REVOKED', is_valid: false }),
        expect.objectContaining({ token: expiredToken, status: 'ACTIVE', is_valid: false }),
        expect.objectContaining({ token: activeToken, expires_at: null, is_valid: true }),
      ]),
    );
  });

  it('returns only the public snapshot and does not log the bearer token', async () => {
    let logs = '';
    const destination = new Writable({
      write(chunk: Buffer, _, callback) {
        logs += chunk.toString('utf8');
        callback();
      },
    });
    const logger = pino(destination);
    const result = await request(makeApp(connections.mongo, logger))
      .get('/API/Public/Evidence/' + activeToken)
      .query({ copy: activeToken });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['referrer-policy']).toBe('no-referrer');
    const evidence = SharedEvidence.parse(result.body);
    expect(result.body).toEqual(evidence);
    expect(evidence).toMatchObject({
      title: 'Manejo de un cliente molesto',
      owner: { name: 'Ana López' },
      content: { score: 92.5, simulation: { title: 'Cliente molesto por un retraso' } },
    });
    expect(evidence.content.decisions).toHaveLength(2);
    expect(logs).toContain('/api/public/evidence/[OCULTO]');
    expect(logs).not.toContain(activeToken);
  });

  it('checks revocation and expiry before accessing MongoDB', async () => {
    const down = crearConexiones({ ...environment, MONGO_PORT: 6, DB_TIMEOUT_MS: 250 });
    try {
      const server = makeApp(down.mongo);
      const expired = await read(expiredToken, server);
      expect(expired.status).toBe(410);
      expect(expired.body.error.code).toBe('SHARE_LINK_EXPIRED');
      expect(expired.headers['cache-control']).toBe('no-store');
      for (const token of [revokedToken, randomUUID(), 'invalid!']) {
        const invalid = await read(token, server);
        expect(invalid.status).toBe(404);
        expect(invalid.body.error.code).toBe('INVALID_SHARE_LINK');
      }
      const unavailable = await read(activeToken, server);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error).toMatchObject({
        code: 'DATABASE_UNAVAILABLE',
        details: { database: 'document' },
      });
    } finally {
      await cerrarConexiones(down);
    }
  });
});
