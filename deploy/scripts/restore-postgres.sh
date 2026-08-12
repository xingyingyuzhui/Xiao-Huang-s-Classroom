#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BACKUP_FILE="${1:?Usage: restore-postgres.sh <backup-file>}"

[ -f "$BACKUP_FILE" ] || { echo "ERROR: backup file not found"; exit 1; }

if [ -f "$BACKUP_FILE.sha256" ]; then
  echo "[restore] verifying checksum"
  expected="$(tr -d ' \t\n' < "$BACKUP_FILE.sha256")"
  actual="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "ERROR: checksum mismatch"
    exit 1
  fi
fi

echo "[restore] archive is readable custom format (TOC only; no row dump)"
compose exec -T postgres pg_restore --list < "$BACKUP_FILE" > /dev/null

if [[ "${RESTORE_CONFIRM:-}" != "yes" ]]; then
  echo "[restore] set RESTORE_CONFIRM=yes to apply this dump (stops cloud-server)"
  exit 1
fi

echo "[restore] stopping cloud-server"
compose stop cloud-server

echo "[restore] restoring"
compose exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-acl \
    -U "${POSTGRES_USER:-xiaohuang_cloud}" \
    -d "${POSTGRES_DB:-xiaohuang_classroom}" \
  < "$BACKUP_FILE"

compose up -d cloud-server
echo "[restore] complete"
