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
  META_SHA="$(
    if command -v node >/dev/null 2>&1; then
      node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.data?.gitSha||''))" "$META"
    else
      python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("data",{}).get("gitSha",""), end="")' "$META"
    fi
  )"
  if [[ "$META_SHA" != "$EXPECTED_SHA" ]]; then
    echo "FAIL: meta gitSha '$META_SHA' != expected '$EXPECTED_SHA'"
    exit 1
  fi
  SCHEMA="$(
    if command -v node >/dev/null 2>&1; then
      node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.data?.schemaVersion||''))" "$META"
    else
      python3 -c 'import json,sys; v=json.loads(sys.argv[1]).get("data",{}).get("schemaVersion",""); print("" if v is None else v, end="")' "$META"
    fi
  )"
  if [[ -z "$SCHEMA" ]]; then
    echo "FAIL: meta schemaVersion missing"
    exit 1
  fi
  echo "[verify] meta gitSha/schemaVersion match ($META_SHA / $SCHEMA)"
fi

if [[ -n "$WEB_VERSION_URL" ]]; then
  WEB="$(curl -sf "$WEB_VERSION_URL")" || { echo "FAIL: web version.json"; exit 1; }
  WEB_SHA="$(
    if command -v node >/dev/null 2>&1; then
      node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.gitSha||''))" "$WEB"
    else
      python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("gitSha",""), end="")' "$WEB"
    fi
  )"
  if [[ -n "$EXPECTED_SHA" && "$WEB_SHA" != "$EXPECTED_SHA" ]]; then
    echo "FAIL: web version.json gitSha '$WEB_SHA' != expected '$EXPECTED_SHA'"
    exit 1
  fi
  echo "[verify] web version.json ok ($WEB_SHA)"
fi

echo "[verify] HTTPS GATE: IP+HTTP smoke only; do not send real passwords or keys"
echo "[verify] passed"
