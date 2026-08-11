import type pg from 'pg';

export type TenantClient = Pick<pg.PoolClient, 'query'>;

export async function setTenantAccountId(client: TenantClient, accountId: string): Promise<void> {
  await client.query(`SELECT set_config('app.account_id', $1, true)`, [accountId]);
}

export async function withTenantTransaction<T>(
  pool: pg.Pool,
  accountId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE cloud_app`);
    await setTenantAccountId(client, accountId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
