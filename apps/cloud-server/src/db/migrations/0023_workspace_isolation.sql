-- Workspace / class tenant isolation (Phase 4 / migration 0023).
-- Composite FKs keep class workspaces and sync rows on the same account.
-- RLS on classes / workspaces / sync_* stays enabled; this file does not disable it.
-- Comments are operational only; no PII.

ALTER TABLE classes
  ADD CONSTRAINT classes_account_class_uid UNIQUE (account_id, class_id);

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_account_workspace_uid UNIQUE (account_id, workspace_id);

-- Class-kind rows must match classes.(account_id, class_id).
-- Personal rows have class_id NULL and are not checked by this FK.
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_class_account_fk
  FOREIGN KEY (account_id, class_id)
  REFERENCES classes (account_id, class_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE workspaces VALIDATE CONSTRAINT workspaces_class_account_fk;

ALTER TABLE sync_resources
  ADD CONSTRAINT sync_resources_workspace_account_fk
  FOREIGN KEY (account_id, workspace_id)
  REFERENCES workspaces (account_id, workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE sync_change_log
  ADD CONSTRAINT sync_change_log_workspace_fk
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces (workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE sync_change_log
  ADD CONSTRAINT sync_change_log_workspace_account_fk
  FOREIGN KEY (account_id, workspace_id)
  REFERENCES workspaces (account_id, workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE sync_operations
  ADD CONSTRAINT sync_operations_workspace_fk
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces (workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE sync_operations
  ADD CONSTRAINT sync_operations_workspace_account_fk
  FOREIGN KEY (account_id, workspace_id)
  REFERENCES workspaces (account_id, workspace_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE sync_resources VALIDATE CONSTRAINT sync_resources_workspace_account_fk;
ALTER TABLE sync_change_log VALIDATE CONSTRAINT sync_change_log_workspace_fk;
ALTER TABLE sync_change_log VALIDATE CONSTRAINT sync_change_log_workspace_account_fk;
ALTER TABLE sync_operations VALIDATE CONSTRAINT sync_operations_workspace_fk;
ALTER TABLE sync_operations VALIDATE CONSTRAINT sync_operations_workspace_account_fk;

COMMENT ON CONSTRAINT workspaces_class_account_fk ON workspaces IS
  'Class workspaces must share (account_id, class_id) with classes. NULL class_id (personal) is not checked.';

COMMENT ON CONSTRAINT sync_resources_workspace_account_fk ON sync_resources IS
  'Sync resource tenant pair must match the owning workspace.';

COMMENT ON CONSTRAINT sync_change_log_workspace_account_fk ON sync_change_log IS
  'Change-log tenant pair must match the owning workspace.';

COMMENT ON CONSTRAINT sync_operations_workspace_account_fk ON sync_operations IS
  'Operation tenant pair must match the owning workspace.';

COMMENT ON TABLE workspaces IS
  'One live workspace per (account, subject) or (account, class, subject). Roster is a sync resource, not a SQL table. Guest copies are never auto-merged.';
