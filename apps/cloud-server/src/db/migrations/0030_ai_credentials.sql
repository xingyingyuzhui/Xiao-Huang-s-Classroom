CREATE TABLE IF NOT EXISTS ai_credentials (
  account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  tag BYTEA NOT NULL,
  wrapped_dek BYTEA NOT NULL,
  kek_version INTEGER NOT NULL DEFAULT 1,
  last4 TEXT NOT NULL,
  configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT ai_usage_pk PRIMARY KEY (account_id, usage_date)
);

CREATE TABLE IF NOT EXISTS ai_quota (
  account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  monthly_limit INTEGER NOT NULL DEFAULT 2000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_credentials_tenant ON ai_credentials
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY ai_usage_tenant ON ai_usage
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

CREATE POLICY ai_quota_tenant ON ai_quota
  FOR ALL USING (account_id = current_setting('app.account_id', true))
  WITH CHECK (account_id = current_setting('app.account_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_credentials TO cloud_app;
GRANT SELECT, INSERT, UPDATE ON ai_usage TO cloud_app;
GRANT SELECT, INSERT, UPDATE ON ai_quota TO cloud_app;
