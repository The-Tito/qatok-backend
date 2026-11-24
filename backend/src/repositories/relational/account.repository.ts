import type { Account, EstadoUsuario, Rol } from '@qatok/shared';
import type { Pool, PoolClient } from 'pg';

const accountColumns = `id_usuario AS id, nombre AS name, correo AS email, rol AS role,
  estado AS status, fecha_registro AS registered_at`;

type AccountRow = Omit<Account, 'role' | 'status' | 'registered_at'> & {
  role: Rol;
  status: EstadoUsuario;
  registered_at: Date;
};
const statuses = { ACTIVO: 'ACTIVE', INACTIVO: 'INACTIVE', SUSPENDIDO: 'SUSPENDED' } as const;
function publicAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
    status: statuses[row.status],
    registered_at: row.registered_at.toISOString(),
  };
}

export function createAccountRepository(pool: Pool) {
  return {
    async insert(
      client: PoolClient,
      id: string,
      name: string,
      email: string,
      passwordHash: string,
    ) {
      const { rows } = await client.query<AccountRow>(
        `INSERT INTO usuario (id_usuario, nombre, correo, contrasena_hash, rol, estado, fecha_registro)
         VALUES ($1, $2, $3, $4, 'ESTUDIANTE', 'ACTIVO', now()) RETURNING ${accountColumns}`,
        [id, name, email, passwordHash],
      );
      return publicAccount(rows[0]!);
    },
    async findById(id: string) {
      const { rows } = await pool.query<AccountRow>(
        `SELECT ${accountColumns} FROM usuario WHERE id_usuario = $1`,
        [id],
      );
      return rows[0] ? publicAccount(rows[0]) : null;
    },
    async findForLogin(email: string) {
      const { rows } = await pool.query<AccountRow & { password_hash: string }>(
        `SELECT ${accountColumns}, contrasena_hash AS password_hash
         FROM usuario WHERE lower(correo) = $1`,
        [email],
      );
      const row = rows[0];
      return row ? { user: publicAccount(row), passwordHash: row.password_hash } : null;
    },
    async updateName(id: string, name: string) {
      const { rows } = await pool.query<AccountRow>(
        `UPDATE usuario SET nombre = $2 WHERE id_usuario = $1 AND estado = 'ACTIVO'
         RETURNING ${accountColumns}`,
        [id, name],
      );
      return rows[0] ? publicAccount(rows[0]) : null;
    },
    async delete(client: PoolClient, id: string) {
      const account = await client.query(
        "SELECT id_usuario FROM usuario WHERE id_usuario = $1 AND estado = 'ACTIVO' FOR UPDATE",
        [id],
      );
      if (!account.rowCount) return null;
      const evidence = await client.query<{ id: string }>(
        'SELECT id_evidencia AS id FROM evidencia WHERE id_usuario = $1',
        [id],
      );
      await client.query('DELETE FROM usuario WHERE id_usuario = $1', [id]);
      return evidence.rows.map((row) => row.id);
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
