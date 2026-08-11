# Incident Runbook — 小黄的教室 Cloud Server

## 1. Postgres Unavailable

**Symptoms:** `/readyz` returns 503; application logs connection errors.

**Steps:**
1. Check container status: `docker ps | grep postgres`
2. Check logs: `docker logs cloud-postgres --tail 100`
3. Restart container: `docker restart cloud-postgres`
4. If data corrupted, restore from backup:
   ```bash
   pg_restore -d cloud_db /backups/latest.dump
   ```
5. Re-run migrations: `npm run migrate -w @xiaohuang/cloud-server`

---

## 2. Disk Space Critical

**Symptoms:** Write failures, WAL accumulation, backup failures.

**Steps:**
1. Identify large files: `du -sh /var/lib/postgresql/data/*`
2. Remove old WAL: `pg_archivecleanup /var/lib/postgresql/data/pg_wal <oldest_needed>`
3. Cleanup old backups: keep last 7 daily + 4 weekly
4. Run audit log cleanup: `POST /api/cloud/v1/admin/cleanup`
5. Vacuum: `VACUUM FULL audit_log;`

---

## 3. Migration Failure

**Symptoms:** `migrateToLatest` returns `ok: false`; schema version stuck.

**Steps:**
1. Check which migration failed: compare `cloud_schema_migrations` table vs manifest
2. Fix the SQL issue manually or adjust migration file
3. If partially applied, manually roll back the failed DDL statements
4. Re-run: `npm run migrate -w @xiaohuang/cloud-server`
5. Verify: `SELECT MAX(version) FROM cloud_schema_migrations;`

---

## 4. Refresh Token Reuse Detected

**Symptoms:** `auth.refresh_reuse` events in audit_log; user reports forced logout.

**Steps:**
1. Query audit log: `SELECT * FROM audit_log WHERE event_type = 'auth.refresh_reuse' ORDER BY created_at DESC LIMIT 20;`
2. Identify affected account and device family
3. Revoke entire token family: `DELETE FROM device_sessions WHERE account_id = $1;`
4. Notify user to re-authenticate
5. Check for credential stuffing patterns (multiple accounts, same IP)

---

## 5. AI Provider Timeout / Quota Exceeded

**Symptoms:** AI requests return 502/429; `ai.credential_set` events show rotation.

**Steps:**
1. Check provider status page (OpenAI, Anthropic, etc.)
2. Review usage: `SELECT COUNT(*) FROM audit_log WHERE event_type LIKE 'ai.%' AND created_at > NOW() - INTERVAL '1 hour';`
3. If rate-limited, back off or switch to backup key
4. If quota exceeded, upgrade plan or pause non-critical AI features
5. Monitor recovery with `/readyz`

---

## 6. Sync Conflicts Spike

**Symptoms:** Elevated `sync.conflict` events; users report data overwrites.

**Steps:**
1. Query: `SELECT detail->>'resourceType', COUNT(*) FROM audit_log WHERE event_type = 'sync.conflict' AND created_at > NOW() - INTERVAL '1 hour' GROUP BY 1;`
2. Check if a specific client version is causing issues (look at user-agent in detail)
3. If client bug, notify users to update
4. If server clock drift, check `SELECT NOW();` and NTP status
5. Consider temporary conflict resolution override (last-write-wins)

---

## 7. Bad Release Rollback

**Steps:**
1. Identify bad version from deploy logs
2. Roll back container image: `docker service update --image cloud-server:<previous_tag> cloud_server`
3. If migration was applied and is backward-incompatible:
   - Stop application
   - Restore DB from pre-deploy backup
   - Redeploy previous version
4. Post-mortem: document what went wrong, add regression test
