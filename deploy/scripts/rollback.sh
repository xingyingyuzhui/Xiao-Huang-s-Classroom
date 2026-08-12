#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

WEB_SHA="${1:?Usage: rollback.sh <web-sha> <cloud-sha> <lab-sha>}"
CLOUD_SHA="${2:?Usage: rollback.sh <web-sha> <cloud-sha> <lab-sha>}"
LAB_SHA="${3:?Usage: rollback.sh <web-sha> <cloud-sha> <lab-sha>}"
RELEASE_DIR="$DEPLOY_ROOT/releases/$WEB_SHA"

echo "[rollback] web=$WEB_SHA cloud=$CLOUD_SHA lab=$LAB_SHA"
echo "[rollback] expand/contract only — will not down-migrate production data"

[ -d "$RELEASE_DIR/web" ] || { echo "ERROR: web release missing: $RELEASE_DIR/web"; exit 1; }

export GIT_SHA="$CLOUD_SHA"
export CLOUD_IMAGE_TAG="$CLOUD_SHA"
export LAB_IMAGE_TAG="$LAB_SHA"

mkdir -p "$DEPLOY_ROOT/releases/current"
ln -sfn "$RELEASE_DIR/web" "$DEPLOY_ROOT/releases/current/web.new"
mv -Tf "$DEPLOY_ROOT/releases/current/web.new" "$DEPLOY_ROOT/releases/current/web"

compose up -d --force-recreate --no-deps cloud-server lab-server

for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3000/readyz > /dev/null 2>&1; then
    echo "[rollback] cloud-server ready"
    echo "[rollback] complete"
    exit 0
  fi
  sleep 1
done

echo "ERROR: readyz failed after rollback. If schemaVersion > maxAppSchemaVersion,"
echo "the previous image cannot serve this database. Restore a pre-deploy dump"
echo "only after an operator decision — there is no automatic down-migration."
exit 1
