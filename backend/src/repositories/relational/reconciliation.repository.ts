import type { PoolClient } from 'pg';
import type { Sources } from '../../reconciliation/model.js';

export async function lockReconciliationSources(client: PoolClient) {
  await client.query(`LOCK TABLE usuario, habilidad, simulacion, simulacion_habilidad,
    intento, respuesta, evidencia IN EXCLUSIVE MODE NOWAIT`);
}

export async function readReconciliationSources(client: PoolClient): Promise<Sources> {
  const users = await client.query<Sources['users'][number]>('SELECT id_usuario FROM usuario');
  const skills = await client.query<Sources['skills'][number]>(
    'SELECT id_habilidad, nombre, nivel_objetivo FROM habilidad',
  );
  const simulations = await client.query<Sources['simulations'][number]>(
    'SELECT id_simulacion, titulo, estado, id_revision_publicada FROM simulacion',
  );
  const weights = await client.query<Sources['weights'][number]>(
    'SELECT id_simulacion, id_habilidad, peso, nivel_esperado FROM simulacion_habilidad',
  );
  const attempts = await client.query<
    Omit<Sources['attempts'][number], 'fecha_inicio' | 'fecha_fin'> & {
      fecha_inicio: Date;
      fecha_fin: Date | null;
    }
  >(
    'SELECT id_intento, id_usuario, id_simulacion, estado, fecha_inicio, fecha_fin, puntuacion FROM intento',
  );
  const responses = await client.query<Sources['responses'][number]>(
    'SELECT id_respuesta, id_intento, id_paso, id_opcion, secuencia FROM respuesta',
  );
  const evidence = await client.query<Sources['evidence'][number]>(
    'SELECT id_evidencia, id_intento, id_usuario, titulo FROM evidencia',
  );
  return {
    users: users.rows,
    skills: skills.rows,
    simulations: simulations.rows,
    weights: weights.rows,
    attempts: attempts.rows.map((row) => ({
      ...row,
      fecha_inicio: row.fecha_inicio.toISOString(),
      fecha_fin: row.fecha_fin?.toISOString() ?? null,
    })),
    responses: responses.rows,
    evidence: evidence.rows,
  };
}
