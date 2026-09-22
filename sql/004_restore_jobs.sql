CREATE TABLE IF NOT EXISTS restore_jobs (
  id BIGSERIAL PRIMARY KEY,
  backup_id BIGINT REFERENCES backups(id) ON DELETE SET NULL,
  snapshot_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  database_name TEXT,
  error TEXT,
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_restore_jobs_created
  ON restore_jobs(created_at DESC);
