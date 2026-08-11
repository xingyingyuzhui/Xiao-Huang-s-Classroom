#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="/opt/xiaohuang-classroom"
PREV_SHA="${1:?Usage: rollback.sh <previous-sha>}"
RELEASE_DIR="$DEPLOY_ROOT/releases/$PREV_SHA"

echo "[rollback] Rolling back to $PREV_SHA"

[ -d "$RELEASE_DIR" ] || { echo "ERROR: release dir $RELEASE_DIR not found"; exit 1; }

# Switch web symlink
ln -sfn "$RELEASE_DIR/web" "$DEPLOY_ROOT/current/web.new"
mv -Tf "$DEPLOY_ROOT/current/web.new" "$DEPLOY_ROOT/current/web"

# Restart cloud-server with previous image
docker compose -f "$DEPLOY_ROOT/compose.yml" up -d --force-recreate cloud-server

# Health check
for i in $(seq 1 15); do
    if curl -sf http://127.0.0.1:3000/readyz > /dev/null 2>&1; then
        echo "[rollback] Cloud server ready"
        break
    fi
    [ "$i" -eq 15 ] && { echo "ERROR: readyz failed after 15s"; exit 1; }
    sleep 1
done

echo "[rollback] Rolled back to $PREV_SHA"
