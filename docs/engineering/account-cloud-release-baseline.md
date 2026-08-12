# Account/cloud release baseline

Recorded 2026-08-12 during `codex/account-cloud-hardening` Phase 0.
No secrets, account names, or payload contents.

## Source

| Field       | Value                                                |
| ----------- | ---------------------------------------------------- |
| Branch      | `codex/account-cloud-hardening`                      |
| Git SHA     | `1282f71a00ed07fa00f8ce7bf2f8a54a62e5346a`           |
| Commit      | `chore(account): snapshot current cloud integration` |
| Commit time | 2026-08-12 09:54:28 +0800                            |

## PostgreSQL backup

| Field         | Value                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| File          | `/opt/xiaohuang-classroom/backups/postgres/20260812-095500-hardening-baseline.dump` |
| Format        | `pg_dump --format=custom --compress=6`                                              |
| SHA-256       | `9b44d038fcd861b19a819f75cfdc861b50366e219a5450094c45c5254aad0986`                  |
| Mode          | `600` (deploy user only)                                                            |
| Restore drill | temp `postgres:16-alpine` + `pg_restore --no-owner --no-acl`                        |
| Drill result  | counts match production                                                             |

Production / restore counts (no PII):

| Metric                                 | Value |
| -------------------------------------- | ----- |
| `cloud_schema_migrations.max(version)` | 31    |
| `cloud_schema_migrations` rows         | 6     |
| accounts                               | 2     |
| classes                                | 2     |
| workspaces                             | 2     |

Temp restore container was removed. Backup file kept.

## Running images

| Service      | Tag                             | Digest / Image ID                                                         | Container created         |
| ------------ | ------------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| cloud-server | `xiaohuang-cloud-server:latest` | `sha256:e98dc144bc706ba134704a6ad91e7954645bb1442877799cb0e98f1ac3b89b06` | 2026-08-11 23:14:53 +0800 |
| lab-server   | `xiaohuang-lab-server:latest`   | `sha256:a0beffcfbceb1128156cc7e3bffd6be886b6b0590333a18b978d41f8e4e095b0` | 2026-08-11 22:16:23 +0800 |
| postgres     | `postgres:16-alpine`            | `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` | 2026-08-11 18:17:55 +0800 |

Container IDs:

- `deploy-cloud-server-1` = `5b3cf993287e…`
- `deploy-lab-server-1` = `b4fdf72a920c…`
- `deploy-postgres-1` = `a198e18f4d70…`

Postgres publishes no host port (`5432/tcp` internal only).

## Health (loopback)

- `GET /livez` → `{"ok":true,"service":"cloud-server"}`
- `GET /readyz` → `ok=true`, `db=true`, `schemaVersion=31`, `maxAppSchemaVersion=31`
- Public web `GET /` → 200

Public route snapshot at record time (must change in Phase 1):

| Path                 | HTTP                                  |
| -------------------- | ------------------------------------- |
| `/api/cloud/v1/meta` | 200                                   |
| `/livez`             | 200                                   |
| `/readyz`            | 200 (public; should be loopback-only) |
| `/api/settings`      | 200 (legacy lab; must stop)           |
| `/api/students`      | 200 (legacy lab; must stop)           |

## Config hashes (local repo at baseline SHA)

| File                          | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `deploy/compose.yml`          | `284acd2fecf6deee69e8d0fc3c6c00824d41513404d0f49ae70c42fd8dc141f9` |
| `deploy/compose.prod.yml`     | `10b497e7c49537ac689143fc718101f53726a6837c82104424901222cc545e6a` |
| `deploy/nginx/xiaohuang.conf` | `b14a75bae0121cb38fb2317c8e48586f2e3abf09ed3358252c01950923e41253` |

Server compose/nginx may differ from git; Phase 9 must converge to one authority.

## Web release

- Path: `/opt/xiaohuang-classroom/releases/current/web/`
- `index.html` mtime: 2026-08-12 09:24 (hardening UI deploy; after baseline commit)
- `runtime-config.json` (non-secret):

```json
{
  "cloudBaseUrl": "/api/cloud/v1",
  "features": {
    "accountCloudProgram": true,
    "publicGuestAi": false
  },
  "releaseChannel": "stable"
}
```

Note: production file at record time used an absolute `cloudBaseUrl` host. Do not commit host/IP into this doc as a secret; treat origin as operator config.

## Known gaps frozen by this baseline

- Public Nginx still proxies all `/api/` to lab-server.
- Images tagged `latest`, not git SHA.
- Refresh sessions have reuse detection but no `device_sessions.expires_at`.
- Web access token restore used `sessionStorage` rather than HttpOnly refresh cookie.
- Sync push could complete without pull; conflict snapshots were empty.

Next: Phase 1 close legacy public `/api/`; do not delete this backup.

## Phase 9 (2026-08-12) — compose / images / backup / rollback

Repo work on `codex/account-cloud-hardening`. **Do not delete** the Phase 0 dump above. This section is the target contract; live host still needs an operator apply (no SSH from this change).

### Compose authority

| File                      | Role                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/compose.yml`      | Single base: services, hardening, healthchecks, volume names `deploy_pgdata` / `deploy_labdata`                                         |
| `deploy/compose.prod.yml` | Override only: `xiaohuang-cloud-server:${CLOUD_IMAGE_TAG}` and `xiaohuang-lab-server:${LAB_IMAGE_TAG}` (git SHA). No floating app tags. |
| `deploy/compose.test.yml` | Ephemeral CI postgres only — not production                                                                                             |

CI and `deploy/scripts/lib.sh` use `-f deploy/compose.yml -f deploy/compose.prod.yml`.

### Immutable images

OCI build args on `apps/cloud-server/Dockerfile` and `apps/server/Dockerfile`: `GIT_SHA`, `BUILD_TIME`, `APP_VERSION`, `SOURCE_REPO` → `org.opencontainers.image.{revision,created,version,source}`.

Web remains a SHA directory (`releases/<sha>/web`), not a container.

### Migration CLI

`node dist/migrate.js` (tsup entry `src/migrate.ts`): apply + exit 0; checksum drift / DB newer than app → non-zero; no listen. Deploy scripts must not pass `--migrate-only` to `server.js`.

### Backup / rollback

- Daily + pre-deploy: `deploy/scripts/backup-daily.sh` / `backup-postgres.sh` / `backup-lab-sqlite.sh` (custom format + SHA-256, retain 7–30 days, optional `BACKUP_OFFSITE_DIR`).
- Rollback: `rollback.sh <web-sha> <cloud-sha> <lab-sha>` — no down-migration. Expand/contract only; incompatible schema → operator restore of a pre-deploy dump.
- Runbook: `docs/operations/deploy-rollback-runbook.md`.

### HTTPS gate

IP+HTTP remains test-only. Real passwords, keys, rosters, WeChat, avatars, and auto-update require domain + TLS.

### Remaining live-server work

Operator still must rsync `deploy/`, load SHA-tagged images, `nginx -t` (keep public `/api/` as 404), enable `xiaohuang-backup.timer`, and record the new digest + backup checksum beside the Phase 0 row. Do not treat Phase 0 `*:latest` image tags as the ongoing deploy identity.
