#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="/opt/xiaohuang-classroom"
BACKUP_DIR="$DEPLOY_ROOT/backups/postgres"
LABEL="${1:-manual}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}-${LABEL}.dump"

mkdir -p "$BACKUP_DIR"

echo "[backup] Creating PostgreSQL backup: $BACKUP_FILE"

docker compose -f "$DEPLOY_ROOT/compose.yml" exec -T postgres \
    pg_dump --format=custom --compress=6 -U "${POSTGRES_USER:-xiaohuang_cloud}" "${POSTGRES_DB:-xiaohuang_classroom}" \
    > "$BACKUP_FILE"

# SHA-256 checksum
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"

echo "[backup] Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

# Prune backups older than 7 days
find "$BACKUP_DIR" -name '*.dump' -mtime +7 -delete
find "$BACKUP_DIR" -name '*.sha256' -mtime +7 -delete

echo "[backup] Pruned backups older than 7 days"
