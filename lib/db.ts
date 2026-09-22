import pg from "pg";

const { Pool } = pg;

declare global {
  var __myGithubPool: pg.Pool | undefined;
}

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000
  });
}

export const pool = global.__myGithubPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.__myGithubPool = pool;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
