-- Absolute refresh-session expiry (no sliding window).
-- Backfill existing rows to created_at + 30 days.
-- Cleanup (admin/internal only, not a user route):
--   UPDATE device_sessions SET status = 'revoked', revoked_at = NOW()
--     WHERE status = 'active' AND expires_at <= NOW();
--   DELETE FROM device_sessions WHERE expires_at < NOW() - INTERVAL '7 days';

ALTER TABLE device_sessions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ NULL;

UPDATE device_sessions
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

ALTER TABLE device_sessions
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

CREATE INDEX IF NOT EXISTS idx_device_sessions_expires_at
  ON device_sessions (expires_at)
  WHERE status = 'active';

COMMENT ON COLUMN device_sessions.expires_at IS
  'Absolute session expiry (created_at + 30 days). Rotation must not extend this value.';
COMMENT ON COLUMN device_sessions.last_rotated_at IS
  'Last successful refresh-token rotation; does not slide expires_at.';
