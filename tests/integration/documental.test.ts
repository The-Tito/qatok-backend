import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aPasoVista,
  crearContenidoRepository,
  type PasoContenido,
} from '../../backend/src/repositories/document/contenido.repository.js';
import { crearEvidenciaRepository } from '../../backend/src/repositories/document/evidencia.repository.js';
import {
  cargarDataset,
  conectar,
  crearColecciones,
  leerDataset,
} from '../../database/document/ejecutar.mjs';

const { cliente } = conectar();
const db = cliente.db(`prueba_documental_${randomUUID().replaceAll('-', '')}`);
const contenidos = crearContenidoRepository(db);
const evidencias = crearEvidenciaRepository(db);
const dataset = leerDataset();

function pasoTerminal(): PasoContenido {
  const paso = dataset.documental.contenidos_simulacion.flatMap((doc) => doc.pasos)[0];
  if (!paso) throw new Error('El dataset necesita un paso para las pruebas.');
  return {
    ...paso,
    id_paso: randomUUID(),
    orden: 1,
    opciones: paso.opciones.map((opcion) => ({
      ...opcion,
      id_opcion: randomUUID(),
      id_paso_siguiente: null,
    })),
  };
}

beforeAll(async () => {
  await crearColecciones(db);
  await cargarDataset(db);
});

afterAll(async () => {
  try {
    await db.dropDatabase();
  } finally {
    await cliente.close();
  }
});

describe('persistencia documental', () => {
  it('carga y lee las revisiones por el ID que guarda PostgreSQL', async () => {
    for (const sim of dataset.relacional.simulacion) {
      if (!sim.id_revision_publicada) continue;
      const inicial = await contenidos.obtenerPaso(sim.id_simulacion, sim.id_revision_publicada);
      expect(inicial?.orden).toBe(1);
      if (!inicial) throw new Error('Falta el paso inicial.');
      const vista = aPasoVista(inicial);
      expect(vista.opciones[0]).not.toHaveProperty('valoracion');
      expect(vista.opciones[0]).not.toHaveProperty('id_paso_siguiente');
      expect(await contenidos.obtenerPaso(randomUUID(), sim.id_revision_publicada)).toBeNull();
      expect(
        (
          await contenidos.obtenerPaso(
            sim.id_simulacion,
            sim.id_revision_publicada,
            inicial.id_paso,
          )
        )?.id_paso,
      ).toBe(inicial.id_paso);
    }
  });

  it('permite borradores vacíos en simulaciones distintas y rechaza publicarlos', async () => {
    const primero = await contenidos.guardarBorrador(randomUUID(), null, []);
    const paso = { ...pasoTerminal(), opciones: [] };
    const otros = await Promise.all([
      contenidos.guardarBorrador(randomUUID(), null, [paso]),
      contenidos.guardarBorrador(randomUUID(), null, [paso]),
    ]);
    expect(primero?.version).toBe(1);
    expect(otros.map((x) => x?.version)).toEqual([1, 1]);
    if (!primero) throw new Error('No se creó el borrador.');
    await expect(contenidos.guardarRevision(randomUUID(), primero)).rejects.toMatchObject({
      codigo: 'CONTENIDO_INCOMPLETO',
    });
  });

  it('el validador de MongoDB rechaza un contexto de otro tipo', async () => {
    const paso = { ...pasoTerminal(), tipo: 'CORREO', contexto: { agenda: ['Revisar alcance'] } };
    await expect(
      db
        .collection<{ _id: string; version: number; pasos: unknown[] }>('contenidos_simulacion')
        .insertOne({ version: 1, pasos: [paso], _id: randomUUID() }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('detecta una edición concurrente de la misma versión', async () => {
    const id = randomUUID();
    const paso = pasoTerminal();
    await contenidos.guardarBorrador(id, null, [paso]);
    const resultados = await Promise.all([
      contenidos.guardarBorrador(id, 1, [{ ...paso, titulo: 'Edición A' }]),
      contenidos.guardarBorrador(id, 1, [{ ...paso, titulo: 'Edición B' }]),
    ]);
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect((await contenidos.obtenerBorrador(id))?.version).toBe(2);
  });

  it('rechaza ciclos, pasos inalcanzables y referencias externas', async () => {
    const p = pasoTerminal();
    const conDestino = (destino: string): PasoContenido => ({
      ...p,
      opciones: p.opciones.map((o) => ({ ...o, id_paso_siguiente: destino })),
    });
    for (const pasos of [
      [conDestino(p.id_paso)],
      [conDestino(randomUUID())],
      [p, { ...pasoTerminal(), orden: 2 }],
    ]) {
      const borrador = { _id: randomUUID(), version: 1, pasos };
      await expect(contenidos.guardarRevision(randomUUID(), borrador)).rejects.toMatchObject({
        codigo: 'RAMIFICACION_INVALIDA',
      });
    }
  });

  it('reutiliza la revisión al reintentar y la aísla de cambios en el borrador', async () => {
    const paso = pasoTerminal();
    const borrador = await contenidos.guardarBorrador(randomUUID(), null, [paso]);
    if (!borrador) throw new Error('No se creó el borrador.');
    const publicada = await contenidos.guardarRevision(randomUUID(), borrador);
    expect(await contenidos.guardarRevision(randomUUID(), borrador)).toEqual(publicada);
    await contenidos.guardarBorrador(borrador._id, borrador.version, [
      { ...paso, titulo: 'Edición posterior' },
    ]);
    expect((await contenidos.obtenerPaso(borrador._id, publicada._id))?.titulo).toBe(paso.titulo);
  });

  it('impide publicar simultáneamente escenarios con un ID de paso u opción compartido', async () => {
    for (const repetido of ['paso', 'opcion']) {
      const paso = pasoTerminal();
      const otroPaso =
        repetido === 'paso'
          ? { ...pasoTerminal(), id_paso: paso.id_paso }
          : { ...pasoTerminal(), opciones: paso.opciones };
      const guardar = (p: PasoContenido) =>
        contenidos.guardarRevision(randomUUID(), { _id: randomUUID(), version: 1, pasos: [p] });
      const resultados = await Promise.allSettled([guardar(paso), guardar(otroPaso)]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const fallo = resultados.find((r) => r.status === 'rejected');
      expect(fallo?.reason).toMatchObject({ code: 11000 });
    }
  });

  it('persiste y elimina una evidencia autocontenida', async () => {
    const semilla = dataset.documental.evidencias[0];
    if (!semilla) throw new Error('Falta una evidencia en el dataset.');
    expect(await evidencias.obtener(semilla._id)).toMatchObject(semilla);
    const copia = { ...semilla, _id: randomUUID(), creado_en: new Date() };
    await evidencias.guardar(copia);
    expect(await evidencias.obtener(copia._id)).toEqual(copia);
    await evidencias.eliminar(copia._id);
    expect(await evidencias.obtener(copia._id)).toBeNull();
  });
});
