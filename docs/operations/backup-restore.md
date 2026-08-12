# Backup & Restore

## Backup Strategy

- **Daily:** systemd timer → `deploy/scripts/backup-daily.sh` (postgres + lab SQLite).
- **Pre-deploy:** `backup-postgres.sh pre-deploy-<sha>` and `backup-lab-sqlite.sh` from `deploy.sh`.
- **Format:** `pg_dump --format=custom --compress=6` + SHA-256. Lab SQLite is a tar of `/data`.
- **Retention:** local 7–30 days (`RETAIN_DAYS`, default 14, clamped). Optional `BACKUP_OFFSITE_DIR` for a 30-day copy. Keep AI KEK off that path.
- **Failure:** timer `OnFailure=` logs an alert; the job does not overwrite the last successful dump (atomic temp → rename).
- **PII:** scripts log sizes and hashes only. They do not print table contents, account names, or env secrets.

## Creating a Backup

```bash
./deploy/scripts/backup-postgres.sh <label>
./deploy/scripts/backup-lab-sqlite.sh <label>
# or
./deploy/scripts/backup-daily.sh daily
```

Output:

- `/opt/xiaohuang-classroom/backups/postgres/<timestamp>-<label>.dump`
- `/opt/xiaohuang-classroom/backups/postgres/<timestamp>-<label>.dump.sha256`

## Restoring from Backup

```bash
RESTORE_CONFIRM=yes ./deploy/scripts/restore-postgres.sh \
  /opt/xiaohuang-classroom/backups/postgres/<file>.dump
```

The script verifies SHA-256, checks `pg_restore --list` (TOC only), stops cloud-server, restores, and starts cloud-server again.

## Monthly Drill

1. `backup-postgres.sh drill-test`
2. Start a **temporary** `postgres:16-alpine` (not the production volume).
3. `pg_restore --no-owner --no-acl` into the temp instance.
4. Compare counts only: `cloud_schema_migrations` max(version) / row count, accounts, classes, workspaces. Do not dump PII into logs.
5. Destroy the temp instance.

Phase 0 drill evidence (do not delete that dump): `docs/engineering/account-cloud-release-baseline.md`.
