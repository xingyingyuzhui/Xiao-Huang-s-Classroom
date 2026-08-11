# Backup & Restore

## Backup Strategy

- **Automatic**: Every deploy runs `backup-postgres.sh pre-deploy-<sha>` before migrations.
- **Manual**: `./deploy/scripts/backup-postgres.sh manual` for ad-hoc backups.
- **Retention**: 7 daily backups kept locally. Older dumps auto-pruned.
- **Format**: pg_dump custom format with SHA-256 checksum.

## Creating a Backup

```bash
./deploy/scripts/backup-postgres.sh <label>
# Output: /opt/xiaohuang-classroom/backups/postgres/<timestamp>-<label>.dump
```

## Restoring from Backup

```bash
./deploy/scripts/restore-postgres.sh /opt/xiaohuang-classroom/backups/postgres/<file>.dump
```

The script will:
1. Verify SHA-256 checksum
2. Show backup contents (`pg_restore --list`)
3. Prompt for confirmation
4. Stop cloud-server, restore, restart

## Monthly Drill

Run monthly to verify backup integrity:

```bash
# 1. Create a fresh backup
./deploy/scripts/backup-postgres.sh drill-test

# 2. Verify the dump is readable
docker compose -f /opt/xiaohuang-classroom/compose.yml exec -T postgres \
    pg_restore --list < /opt/xiaohuang-classroom/backups/postgres/<latest>.dump

# 3. Optionally restore to a test database to verify data
```
