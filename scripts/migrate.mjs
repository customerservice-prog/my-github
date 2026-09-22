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
try {
  const sql = await fs.readFile(path.join(process.cwd(), "sql", "001_init.sql"), "utf8");
  await pool.query(sql);
  console.log("Database schema is ready.");
} finally {
  await pool.end();
}
