ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staging_domain TEXT,
  ADD COLUMN IF NOT EXISTS staging_branch TEXT DEFAULT 'staging';

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS target_slug TEXT,
  ADD COLUMN IF NOT EXISTS target_branch TEXT,
  ADD COLUMN IF NOT EXISTS target_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(archived_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deployments_project_environment
  ON deployments(project_id, environment, queued_at DESC);
