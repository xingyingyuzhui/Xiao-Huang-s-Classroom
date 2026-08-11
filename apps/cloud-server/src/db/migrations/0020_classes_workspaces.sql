-- Classes / workspaces (Task 5 / migration 0020)

CREATE TABLE IF NOT EXISTS classes (
  class_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT classes_name_length CHECK (char_length(name) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_classes_account_id ON classes (account_id);
CREATE INDEX IF NOT EXISTS idx_classes_account_active ON classes (account_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classes_account_trash ON classes (account_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  class_id TEXT NULL REFERENCES classes (class_id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspaces_kind_check CHECK (kind IN ('personal', 'class')),
  CONSTRAINT workspaces_subject_length CHECK (char_length(subject_id) BETWEEN 1 AND 64),
  CONSTRAINT workspaces_kind_class_consistency CHECK (
    (kind = 'personal' AND class_id IS NULL)
    OR (kind = 'class' AND class_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workspaces_account_id ON workspaces (account_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_class_id ON workspaces (class_id)
  WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_personal_unique
  ON workspaces (account_id, subject_id)
  WHERE class_id IS NULL AND kind = 'personal' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_class_unique
  ON workspaces (account_id, class_id, subject_id)
  WHERE class_id IS NOT NULL AND kind = 'class' AND deleted_at IS NULL;

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY classes_select_tenant ON classes
  FOR SELECT
  USING (account_id = current_setting('app.account_id', true));

CREATE POLICY classes_insert_tenant ON classes
  FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY classes_update_tenant ON classes
  FOR UPDATE
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY classes_delete_tenant ON classes
  FOR DELETE
  USING (account_id = current_setting('app.account_id', true));

CREATE POLICY workspaces_select_tenant ON workspaces
  FOR SELECT
  USING (account_id = current_setting('app.account_id', true));

CREATE POLICY workspaces_insert_tenant ON workspaces
  FOR INSERT
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY workspaces_update_tenant ON workspaces
  FOR UPDATE
  USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY workspaces_delete_tenant ON workspaces
  FOR DELETE
  USING (account_id = current_setting('app.account_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON classes TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces TO cloud_app;
