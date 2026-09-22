CREATE TABLE IF NOT EXISTS project_services (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('worker','cron')),
  command TEXT NOT NULL,
  schedule TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id,name)
);

CREATE TABLE IF NOT EXISTS service_runs (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES project_services(id) ON DELETE CASCADE,
  deployment_id BIGINT REFERENCES deployments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  output TEXT,
  error TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE(service_id,scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_project_services_enabled
  ON project_services(project_id,type,enabled);
CREATE INDEX IF NOT EXISTS idx_service_runs_recent
  ON service_runs(service_id,scheduled_for DESC);
