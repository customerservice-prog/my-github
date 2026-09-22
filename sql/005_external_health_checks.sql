CREATE TABLE IF NOT EXISTS project_health_checks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_health_latest
  ON project_health_checks(project_id, environment, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_health_checked
  ON project_health_checks(checked_at DESC);
