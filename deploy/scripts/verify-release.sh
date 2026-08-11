#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "[verify] Post-deploy smoke tests against $BASE_URL"

# Liveness
curl -sf "$BASE_URL/livez" > /dev/null || { echo "FAIL: /livez"; exit 1; }
echo "[verify] /livez OK"

# Readiness
READYZ=$(curl -sf "$BASE_URL/readyz")
echo "[verify] /readyz: $READYZ"

# Schema version (if endpoint exists)
if curl -sf "$BASE_URL/api/cloud/v1/health" > /dev/null 2>&1; then
    echo "[verify] /api/cloud/v1/health OK"
fi

echo "[verify] All smoke tests passed"
