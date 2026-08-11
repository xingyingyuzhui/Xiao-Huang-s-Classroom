#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="/opt/xiaohuang-classroom"
BACKUP_FILE="${1:?Usage: restore-postgres.sh <backup-file>}"

[ -f "$BACKUP_FILE" ] || { echo "ERROR: backup file not found: $BACKUP_FILE"; exit 1; }

# Verify checksum if available
if [ -f "$BACKUP_FILE.sha256" ]; then
    echo "[restore] Verifying checksum..."
    sha256sum -c "$BACKUP_FILE.sha256" || { echo "ERROR: checksum mismatch"; exit 1; }
fi

# List contents for verification
echo "[restore] Backup contents:"
docker compose -f "$DEPLOY_ROOT/compose.yml" exec -T postgres \
    pg_restore --list < "$BACKUP_FILE" | head -20

echo ""
read -rp "[restore] Proceed with restore? (yes/no): " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }

# Stop cloud-server to avoid writes during restore
docker compose -f "$DEPLOY_ROOT/compose.yml" stop cloud-server

# Restore
echo "[restore] Restoring from $BACKUP_FILE..."
docker compose -f "$DEPLOY_ROOT/compose.yml" exec -T postgres \
    pg_restore --clean --if-exists -U "${POSTGRES_USER:-xiaohuang_cloud}" -d "${POSTGRES_DB:-xiaohuang_classroom}" \
    < "$BACKUP_FILE"

# Restart cloud-server
docker compose -f "$DEPLOY_ROOT/compose.yml" up -d cloud-server

echo "[restore] Restore complete, cloud-server restarted"
