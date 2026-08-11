#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="/opt/xiaohuang-classroom"
SHA="${1:?Usage: deploy.sh <git-sha>}"
RELEASE_DIR="$DEPLOY_ROOT/releases/$SHA"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[deploy] Starting deployment of $SHA"

# Pre-flight
[ -f "$DEPLOY_ROOT/secrets/.env" ] || { echo "ERROR: secrets/.env not found"; exit 1; }
[ -d "$RELEASE_DIR" ] || { echo "ERROR: release dir $RELEASE_DIR not found"; exit 1; }

# Backup database before migration
"$SCRIPT_DIR/backup-postgres.sh" "pre-deploy-$SHA"

# Build and pull images
docker compose -f "$DEPLOY_ROOT/compose.yml" build --pull
docker compose -f "$DEPLOY_ROOT/compose.yml" pull postgres

# Run migrations (one-shot container)
docker compose -f "$DEPLOY_ROOT/compose.yml" run --rm cloud-server node dist/server.js --migrate-only

# Deploy cloud server
docker compose -f "$DEPLOY_ROOT/compose.yml" up -d cloud-server

# Health check (30s timeout)
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:3000/readyz > /dev/null 2>&1; then
        echo "[deploy] Cloud server ready"
        break
    fi
    [ "$i" -eq 30 ] && { echo "ERROR: readyz failed after 30s"; exit 1; }
    sleep 1
done

# Switch web symlink atomically
ln -sfn "$RELEASE_DIR/web" "$DEPLOY_ROOT/current/web.new"
mv -Tf "$DEPLOY_ROOT/current/web.new" "$DEPLOY_ROOT/current/web"

echo "[deploy] Deployment $SHA complete"
