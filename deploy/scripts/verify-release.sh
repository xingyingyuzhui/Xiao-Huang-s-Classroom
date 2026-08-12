#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
WEB_VERSION_URL="${WEB_VERSION_URL:-}"

echo "[verify] smoke against $BASE_URL"

curl -sf "$BASE_URL/livez" > /dev/null || { echo "FAIL: /livez"; exit 1; }
echo "[verify] /livez ok"

READYZ="$(curl -sf "$BASE_URL/readyz")" || { echo "FAIL: /readyz"; exit 1; }
echo "[verify] /readyz ok: $READYZ"

META_URL="${BASE_URL%/}/api/cloud/v1/meta"
META="$(curl -sf "$META_URL")" || { echo "FAIL: /api/cloud/v1/meta"; exit 1; }
echo "[verify] /api/cloud/v1/meta ok"

if [[ -n "$EXPECTED_SHA" ]]; then
  META_SHA="$(node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.data?.gitSha||''))" "$META")"
  if [[ "$META_SHA" != "$EXPECTED_SHA" ]]; then
    echo "FAIL: meta gitSha '$META_SHA' != expected '$EXPECTED_SHA'"
    exit 1
  fi
  SCHEMA="$(node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.data?.schemaVersion||''))" "$META")"
  if [[ -z "$SCHEMA" ]]; then
    echo "FAIL: meta schemaVersion missing"
    exit 1
  fi
  echo "[verify] meta gitSha/schemaVersion match ($META_SHA / $SCHEMA)"
fi

if [[ -n "$WEB_VERSION_URL" ]]; then
  WEB="$(curl -sf "$WEB_VERSION_URL")" || { echo "FAIL: web version.json"; exit 1; }
  WEB_SHA="$(node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.gitSha||''))" "$WEB")"
  if [[ -n "$EXPECTED_SHA" && "$WEB_SHA" != "$EXPECTED_SHA" ]]; then
    echo "FAIL: web version.json gitSha '$WEB_SHA' != expected '$EXPECTED_SHA'"
    exit 1
  fi
  echo "[verify] web version.json ok ($WEB_SHA)"
fi

echo "[verify] HTTPS GATE: IP+HTTP smoke only; do not send real passwords or keys"
echo "[verify] passed"
