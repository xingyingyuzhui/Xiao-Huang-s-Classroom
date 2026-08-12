#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backups/lab-sqlite}"
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
  echo "[backup] another lab sqlite backup is running"
  exit 1
fi

if ! compose ps --status running --services 2>/dev/null | grep -qx lab-server; then
  echo "[backup] lab-server not running; skip sqlite snapshot"
  exit 0
fi

ARCHIVE="$BACKUP_DIR/${TIMESTAMP}-${LABEL}.tar.gz"
TMP_ARCHIVE="${ARCHIVE}.tmp"

cleanup_tmp() {
  rm -f "$TMP_ARCHIVE"
}
trap cleanup_tmp EXIT

# Archive /data only. Do not list file contents (may include local names).
compose exec -T lab-server tar -C /data -czf - . > "$TMP_ARCHIVE"

if [[ ! -s "$TMP_ARCHIVE" ]]; then
  echo "ERROR: lab sqlite archive empty"
  exit 1
fi

mv -f "$TMP_ARCHIVE" "$ARCHIVE"
chmod 600 "$ARCHIVE"
sha256sum "$ARCHIVE" | awk '{print $1}' > "$ARCHIVE.sha256"
chmod 600 "$ARCHIVE.sha256"
trap - EXIT

if [[ -n "${BACKUP_OFFSITE_DIR:-}" ]]; then
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp -p "$ARCHIVE" "$ARCHIVE.sha256" "$BACKUP_OFFSITE_DIR/"
fi

echo "[backup] lab-sqlite ok bytes=$(wc -c < "$ARCHIVE") sha256=$(cat "$ARCHIVE.sha256")"

find "$BACKUP_DIR" -maxdepth 1 -name '*.tar.gz' -mtime "+$RETAIN_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name '*.tar.gz.sha256' -mtime "+$RETAIN_DAYS" -delete
