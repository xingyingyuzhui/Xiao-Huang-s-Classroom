-- Auth / accounts / device sessions (Task 4 / migration 0010)

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT NULL,
  email TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  pending_deletion_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_status_check CHECK (status IN ('active', 'pending_deletion', 'deleted')),
  CONSTRAINT accounts_pending_deletion_consistency CHECK (
    (status = 'pending_deletion' AND pending_deletion_at IS NOT NULL)
    OR (status <> 'pending_deletion' AND pending_deletion_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts (status);

CREATE TABLE IF NOT EXISTS account_identities (
  identity_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_identities_kind_check CHECK (kind IN ('username', 'email', 'wechat')),
  CONSTRAINT account_identities_kind_value_unique UNIQUE (kind, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_account_identities_account_id ON account_identities (account_id);

CREATE TABLE IF NOT EXISTS password_credentials (
  account_id TEXT PRIMARY KEY REFERENCES accounts (account_id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_sessions (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  replaced_refresh_token_hash TEXT NULL,
  token_family_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CONSTRAINT device_sessions_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_account_id ON device_sessions (account_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_refresh_hash ON device_sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_device_sessions_replaced_hash ON device_sessions (replaced_refresh_token_hash)
  WHERE replaced_refresh_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_sessions_family_id ON device_sessions (token_family_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_account_device_active
  ON device_sessions (account_id, device_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account_id ON password_reset_tokens (account_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_identities TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON password_credentials TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_sessions TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO cloud_app;
