import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conectar,
  leerDataset,
  leerSql,
  prepararEsquemaDePrueba,
  revertir,
} from '../../database/relational/ejecutar.mjs';

const dataset = leerDataset();
const client = conectar();

beforeAll(async () => {
  await client.connect();
  await prepararEsquemaDePrueba(client);
});

afterAll(async () => {
  try {
    await revertir(client);
  } finally {
    await client.end();
  }
});

describe('esquema y carga relacional', () => {
  it('construye las tablas y carga todas las filas del dataset', async () => {
    const { rows } = await client.query(leerSql('tests/01-conteos.sql'));
    const conteos = Object.fromEntries(
      Object.entries(dataset).map(([tabla, filas]) => [tabla, filas.length]),
    );
    expect(rows).toEqual([{ ...conteos, evento_sincronizacion: 0 }]);
  });

  it('rechaza datos que violan claves, estados, fechas y rangos', async () => {
    await client.query(leerSql('tests/02-integridad.sql'));
  });

  it('revierte respuesta, cierre y evento, y distingue el orden dentro de una transacción', async () => {
    await client.query(leerSql('tests/03-transaccion.sql'));
  });

  it('el catálogo contiene solo las simulaciones publicadas', async () => {
    const { rows } = await client.query(leerSql('queries/01-catalogo.sql'), [null, 10, 0]);
    const idsPublicados = dataset.simulacion
      .filter((s) => s.estado === 'PUBLICADA')
      .map((s) => s.id_simulacion);
    expect(rows.map((s: { id_simulacion: string }) => s.id_simulacion).sort()).toEqual(
      idsPublicados.sort(),
    );
  });

  it('solo devuelve el intento al dueño y resuelve su revisión publicada', async () => {
    const intento = dataset.intento[0];
    if (!intento) throw new Error('El dataset necesita un intento.');
    const otro = dataset.usuario.find((u) => u.id_usuario !== intento.id_usuario);
    if (!otro) throw new Error('El dataset necesita otro usuario.');
    const sql = leerSql('queries/02-intento.sql');
    const propio = await client.query(sql, [intento.id_intento, intento.id_usuario]);
    expect(propio.rows[0].id_revision_publicada).toBeTruthy();
    expect((await client.query(sql, [intento.id_intento, otro.id_usuario])).rowCount).toBe(0);
  });

  it('distingue enlaces sin expiración, revocados y vencidos', async () => {
    const sql = leerSql('queries/03-enlace.sql');
    const activo = dataset.comparticion.find((c) => c.estado === 'ACTIVA' && !c.fecha_expiracion);
    const revocado = dataset.comparticion.find((c) => c.estado === 'REVOCADA');
    const vencido = dataset.comparticion.find((c) => c.estado === 'ACTIVA' && c.fecha_expiracion);
    if (!activo || !revocado || !vencido) throw new Error('Faltan casos de enlaces en el dataset.');
    expect((await client.query(sql, [activo.token])).rows[0].vencido).toBe(false);
    expect((await client.query(sql, [revocado.token])).rowCount).toBe(0);
    expect((await client.query(sql, [vencido.token])).rows[0].vencido).toBe(true);
  });
});
