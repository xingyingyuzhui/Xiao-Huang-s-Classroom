#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backups/postgres}"
LABEL="${1:-manual}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOCK_FILE="${BACKUP_DIR}/.backup.lock"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

if [[ "$RETAIN_DAYS" -lt 7 ]]; then RETAIN_DAYS=7; fi
if [[ "$RETAIN_DAYS" -gt 30 ]]; then RETAIN_DAYS=30; fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[backup] another postgres backup is running"
  exit 1
fi

TMP_FILE="$BACKUP_DIR/.${TIMESTAMP}-${LABEL}.dump.tmp"
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}-${LABEL}.dump"

cleanup_tmp() {
  rm -f "$TMP_FILE"
}
trap cleanup_tmp EXIT

echo "[backup] postgres custom-format dump (no table contents logged)"

compose exec -T postgres \
  pg_dump --format=custom --compress=6 \
    -U "${POSTGRES_USER:-xiaohuang_cloud}" \
    "${POSTGRES_DB:-xiaohuang_classroom}" \
  > "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "ERROR: dump file empty"
  exit 1
fi

# TOC-only check; does not print row data / PII.
if ! compose exec -T postgres pg_restore --list < "$TMP_FILE" > /dev/null; then
  echo "ERROR: dump is not a readable custom-format archive"
  exit 1
fi

mv -f "$TMP_FILE" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" | awk '{print $1}' > "$BACKUP_FILE.sha256"
chmod 600 "$BACKUP_FILE.sha256"
trap - EXIT

if [[ -n "${BACKUP_OFFSITE_DIR:-}" ]]; then
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp -p "$BACKUP_FILE" "$BACKUP_FILE.sha256" "$BACKUP_OFFSITE_DIR/"
fi

echo "[backup] postgres ok bytes=$(wc -c < "$BACKUP_FILE") sha256=$(cat "$BACKUP_FILE.sha256")"

find "$BACKUP_DIR" -maxdepth 1 -name '*.dump' -mtime "+$RETAIN_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name '*.dump.sha256' -mtime "+$RETAIN_DAYS" -delete

echo "[backup] retain ${RETAIN_DAYS}d local (offsite copy if BACKUP_OFFSITE_DIR is set)"
