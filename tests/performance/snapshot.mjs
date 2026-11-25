import { conectar as connectPostgres } from '../../database/relational/ejecutar.mjs';
import { conectar as connectMongo } from '../../database/document/ejecutar.mjs';
import { conectar as connectNeo4j } from '../../database/graph/ejecutar.mjs';

const postgres = connectPostgres();
const { cliente: mongo, db } = connectMongo();
const neo4j = connectNeo4j();
try {
  await postgres.connect();
  const [relational, documentVersion, drafts, revisions, evidence, graph, graphVersion] =
    await Promise.all([
      postgres.query(`
        SELECT current_setting('server_version') AS version,
          (SELECT count(*)::int FROM usuario) AS users,
          (SELECT count(*)::int FROM habilidad) AS skills,
          (SELECT count(*)::int FROM simulacion) AS simulations,
          (SELECT count(*)::int FROM intento) AS attempts,
          (SELECT count(*)::int FROM intento WHERE estado = 'COMPLETADO') AS completed_attempts,
          (SELECT count(*)::int FROM respuesta) AS answers,
          (SELECT count(*)::int FROM evidencia) AS evidence,
          (SELECT count(*)::int FROM comparticion) AS shares,
          (SELECT count(*)::int FROM evento_sincronizacion WHERE estado = 'APLICADO') AS applied_events,
          (SELECT count(*)::int FROM evento_sincronizacion WHERE estado = 'PENDIENTE') AS pending_events,
          (SELECT count(*)::int FROM evento_sincronizacion WHERE estado = 'FALLIDO') AS failed_events
      `),
      db.command({ buildInfo: 1 }),
      db.collection('contenidos_simulacion').countDocuments(),
      db.collection('revisiones_simulacion').countDocuments(),
      db.collection('evidencias').countDocuments(),
      neo4j.executeQuery(`
        CALL () { MATCH (node) RETURN count(node) AS nodes }
        CALL () { MATCH ()-[edge]->() RETURN count(edge) AS relationships }
        RETURN nodes, relationships
      `),
      neo4j.executeQuery('CALL dbms.components() YIELD versions RETURN versions[0] AS version'),
    ]);
  const counts = graph.records[0];
  process.stdout.write(
    JSON.stringify({
      postgres: relational.rows[0],
      mongo: { version: documentVersion.version, drafts, revisions, evidence },
      neo4j: {
        version: graphVersion.records[0].get('version'),
        nodes: Number(counts.get('nodes')),
        relationships: Number(counts.get('relationships')),
      },
    }) + '\n',
  );
} finally {
  await Promise.all([postgres.end(), mongo.close(), neo4j.close()]);
}
