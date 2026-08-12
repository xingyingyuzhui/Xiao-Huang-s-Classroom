#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "[verify] smoke against $BASE_URL"

curl -sf "$BASE_URL/livez" > /dev/null || { echo "FAIL: /livez"; exit 1; }
echo "[verify] /livez ok"

READYZ="$(curl -sf "$BASE_URL/readyz")" || { echo "FAIL: /readyz"; exit 1; }
echo "[verify] /readyz ok"

if curl -sf "${BASE_URL%/}/api/cloud/v1/meta" > /dev/null 2>&1; then
  echo "[verify] /api/cloud/v1/meta ok"
fi

echo "[verify] HTTPS GATE: IP+HTTP smoke only; do not send real passwords or keys"
echo "[verify] passed"
