-- Persist the accepted content hash so a replay with a different payload is rejected.
ALTER TABLE sync_operations
  ADD COLUMN IF NOT EXISTS content_hash TEXT;
