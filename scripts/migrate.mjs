import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 2 });

function checksum(value) {
  return createHash("sha256").update(value).digest("hex");
}

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const sqlDir = path.join(process.cwd(), "sql");
  const files = (await fs.readdir(sqlDir))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const filename of files) {
    const fullPath = path.join(sqlDir, filename);
    const sql = await fs.readFile(fullPath, "utf8");
    const digest = checksum(sql);
    const existing = await pool.query(
      "SELECT checksum FROM schema_migrations WHERE filename=$1",
      [filename]
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== digest) {
        throw new Error(
          "Migration " + filename + " was changed after it was applied. Create a new numbered migration instead."
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)",
        [filename, digest]
      );
      await client.query("COMMIT");
      console.log("Applied migration", filename);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("Database migrations are current.");
} finally {
  await pool.end();
}
