-- sync_resources: stores latest revision of each resource per workspace
CREATE TABLE IF NOT EXISTS sync_resources (
  resource_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_resources_pk PRIMARY KEY (workspace_id, resource_type, resource_id)
);

-- Change log with server-side monotonic sequence for pull cursor
CREATE TABLE IF NOT EXISTS sync_change_log (
  sequence BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  revision BIGINT NOT NULL,
  operation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_change_log_workspace_cursor 
  ON sync_change_log (workspace_id, sequence);

-- Idempotency: prevent duplicate operations
CREATE TABLE IF NOT EXISTS sync_operations (
  account_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_operations_pk PRIMARY KEY (account_id, operation_id)
);

-- RLS
ALTER TABLE sync_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_resources_tenant ON sync_resources
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY sync_change_log_tenant ON sync_change_log
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY sync_operations_tenant ON sync_operations
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON sync_resources TO cloud_app;
GRANT SELECT, INSERT ON sync_change_log TO cloud_app;
GRANT USAGE, SELECT ON SEQUENCE sync_change_log_sequence_seq TO cloud_app;
GRANT SELECT, INSERT ON sync_operations TO cloud_app;
