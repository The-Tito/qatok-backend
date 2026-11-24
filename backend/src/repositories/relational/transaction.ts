import type { Pool, PoolClient } from 'pg';

export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      discard = true;
    });
    throw error;
  } finally {
    client.release(discard);
  }
}

export function violatesConstraint(error: unknown, code: string, constraint: string): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string; constraint?: string }).code === code &&
    (error as { constraint?: string }).constraint === constraint
  );
}
