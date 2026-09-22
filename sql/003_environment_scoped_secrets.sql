ALTER TABLE project_env
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

ALTER TABLE project_env
  DROP CONSTRAINT IF EXISTS project_env_project_id_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS project_env_project_environment_key
  ON project_env(project_id, environment, key);

CREATE INDEX IF NOT EXISTS idx_project_env_scope
  ON project_env(project_id, environment);
