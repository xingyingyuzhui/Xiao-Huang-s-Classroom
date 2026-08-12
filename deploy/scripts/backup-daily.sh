#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="${1:-daily}"

status=0
"$SCRIPT_DIR/backup-postgres.sh" "$LABEL" || status=1
"$SCRIPT_DIR/backup-lab-sqlite.sh" "$LABEL" || status=1

if [[ "$status" -ne 0 ]]; then
  echo "[backup] daily job failed (see above). systemd OnFailure should alert."
  exit 1
fi

echo "[backup] daily job ok"
