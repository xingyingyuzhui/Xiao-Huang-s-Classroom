# Deploy / rollback runbook (Phase 9)

Compose authority is **one base + one override**:

```bash
docker compose --env-file /opt/xiaohuang-classroom/secrets/.env \
  -f deploy/compose.yml -f deploy/compose.prod.yml …
```

Do not copy a second handwritten `compose.yml` onto the host. CI uses the same paths.

## HTTPS gate

IP + HTTP is **test-only** (static files + `/livez` smoke). Before real passwords, API keys, class rosters, WeChat login, avatars, or auto-update:

- registered domain
- TLS on 443
- `CLOUD_PUBLIC_ORIGIN=https://…`
- Secure / HttpOnly cookies

## Immutable images

| Artifact | Identity |
| --- | --- |
| Cloud API | `xiaohuang-cloud-server:<git-sha>` |
| Lab (loopback) | `xiaohuang-lab-server:<git-sha>` |
| Web | `/opt/xiaohuang-classroom/releases/<git-sha>/web` (static; not a container) |

OCI labels on images: `revision` (git SHA), `created` (build time), `version`, `source`.

Build example:

```bash
GIT_SHA=$(git rev-parse HEAD)
docker build --build-arg GIT_SHA=$GIT_SHA --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg APP_VERSION=0.0.1 \
  --build-arg SOURCE_REPO=https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom \
  -t xiaohuang-cloud-server:$GIT_SHA -f apps/cloud-server/Dockerfile .
```

## Deploy

```bash
export CLOUD_IMAGE_TAG=$SHA LAB_IMAGE_TAG=$SHA GIT_SHA=$SHA
# images already loaded on the host, web tree at releases/$SHA/web
/opt/xiaohuang-classroom/deploy/scripts/deploy.sh $SHA
```

The script:

1. Pre-deploy `pg_dump --format=custom` + SHA-256 (and lab SQLite if the container is up)
2. Starts postgres
3. Runs **`node dist/migrate.js`** (exits 0 / non-zero; does not listen). Never `--migrate-only` on `server.js`
4. `up -d` cloud + lab
5. Waits for loopback `/readyz`
6. Atomically retargets `releases/current/web`

Checksum drift or DB newer than app → migrate exits non-zero → do not switch `current`.

## Rollback (app only)

```bash
./deploy/scripts/rollback.sh <previous-web-sha> <previous-cloud-sha> <previous-lab-sha>
```

Specify all three. Rollback **does not** run migrations and **does not** invent a down-migration of production data.

Expand/contract:

- Forward migrations only add compatible structures.
- Rolling back images is safe while `/readyz` reports `schemaVersion <= maxAppSchemaVersion`.
- If the previous image is older than the database, stop. Restore a pre-deploy dump only as an operator decision (downtime, possible loss of rows written after that dump). There is no automatic schema down.

## Backup

| Job | Script | Retention |
| --- | --- | --- |
| Daily | `deploy/scripts/backup-daily.sh` via `deploy/systemd/xiaohuang-backup.timer` | 7–30 days (`RETAIN_DAYS`, default 14) |
| Pre-deploy | `backup-postgres.sh pre-deploy-<sha>` | same |
| Lab SQLite | `backup-lab-sqlite.sh` | same |
| Offsite | `BACKUP_OFFSITE_DIR` (30-day copy). Keep AI KEK elsewhere. | operator |

Dumps are custom-format + SHA-256. Scripts log sizes and hashes only — no table contents / PII.

Monthly: restore the dump into a **temporary** postgres, compare counts (accounts / classes / workspaces / max schema version), destroy the temp instance. See Phase 0 evidence in `docs/engineering/account-cloud-release-baseline.md`.

## Remaining live-server work

This repo change does not SSH to production. An operator still needs to:

1. rsync `deploy/` (compose pair, nginx, scripts, systemd units)
2. Load SHA-tagged images (not floating tags)
3. `nginx -t` if the site file changed; keep `/api/` as 404 (do not proxy lab)
4. Enable `xiaohuang-backup.timer`
5. First deploy with `DEPLOY_BUILD=0` after images are loaded, or `DEPLOY_BUILD=1` to build on host
6. Record the new SHA / digest / backup checksum next to the Phase 0 baseline
