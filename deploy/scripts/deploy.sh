#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

SHA="${1:?Usage: deploy.sh <git-sha>}"
RELEASE_DIR="$DEPLOY_ROOT/releases/$SHA"
export GIT_SHA="$SHA"
export CLOUD_IMAGE_TAG="${CLOUD_IMAGE_TAG:-$SHA}"
export LAB_IMAGE_TAG="${LAB_IMAGE_TAG:-$SHA}"
export BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
export APP_VERSION="${APP_VERSION:-0.0.1}"
export SOURCE_REPO="${SOURCE_REPO:-https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom}"

echo "[deploy] starting $SHA cloud=$CLOUD_IMAGE_TAG lab=$LAB_IMAGE_TAG"

[ -f "$ENV_FILE" ] || { echo "ERROR: secrets env file missing"; exit 1; }
[ -d "$RELEASE_DIR/web" ] || { echo "ERROR: web release missing: $RELEASE_DIR/web"; exit 1; }

"$SCRIPT_DIR/backup-postgres.sh" "pre-deploy-$SHA"
"$SCRIPT_DIR/backup-lab-sqlite.sh" "pre-deploy-$SHA"

if [[ "${DEPLOY_BUILD:-0}" == "1" ]]; then
  echo "[deploy] building images"
  compose build --pull
fi

echo "[deploy] ensuring postgres"
compose up -d postgres

echo "[deploy] migrating (node dist/migrate.js)"
compose run --rm cloud-server node dist/migrate.js

echo "[deploy] starting services"
compose up -d postgres cloud-server lab-server

ready=0
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/readyz > /dev/null 2>&1; then
    echo "[deploy] cloud-server ready"
    ready=1
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "ERROR: readyz failed after 30s"
    exit 1
  fi
done
[[ "$ready" == "1" ]]

mkdir -p "$DEPLOY_ROOT/releases/current"
ln -sfn "$RELEASE_DIR/web" "$DEPLOY_ROOT/releases/current/web.new"
mv -Tf "$DEPLOY_ROOT/releases/current/web.new" "$DEPLOY_ROOT/releases/current/web"

echo "[deploy] complete sha=$SHA"
echo "[deploy] HTTPS GATE: IP+HTTP is test-only; real passwords/keys/rosters need domain+TLS"
