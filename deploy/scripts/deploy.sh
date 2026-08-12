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

META="$(curl -sf http://127.0.0.1:3000/api/cloud/v1/meta)" || { echo "ERROR: /meta failed"; exit 1; }
META_SHA="$(
  if command -v node >/dev/null 2>&1; then
    node -e "const m=JSON.parse(process.argv[1]); process.stdout.write(String(m?.data?.gitSha||''))" "$META"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("data",{}).get("gitSha",""), end="")' "$META"
  else
    echo "ERROR: need node or python3 to parse /meta" >&2
    exit 1
  fi
)"
if [[ "$META_SHA" != "$SHA" ]]; then
  echo "ERROR: cloud meta gitSha '$META_SHA' != deploy sha '$SHA'"
  exit 1
fi

if [[ -f "$RELEASE_DIR/web/version.json" ]]; then
  WEB_SHA="$(
    if command -v node >/dev/null 2>&1; then
      node -e "const m=require(process.argv[1]); process.stdout.write(String(m.gitSha||''))" "$RELEASE_DIR/web/version.json"
    elif command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("gitSha",""), end="")' "$RELEASE_DIR/web/version.json"
    else
      echo "ERROR: need node or python3 to parse version.json" >&2
      exit 1
    fi
  )"
  if [[ "$WEB_SHA" != "$SHA" ]]; then
    echo "ERROR: web version.json gitSha '$WEB_SHA' != deploy sha '$SHA'"
    exit 1
  fi
fi

mkdir -p "$DEPLOY_ROOT/releases/current"
# Prefer atomic symlink swap; if current/web is still a real directory (legacy), replace it.
if [[ -d "$DEPLOY_ROOT/releases/current/web" && ! -L "$DEPLOY_ROOT/releases/current/web" ]]; then
  mv "$DEPLOY_ROOT/releases/current/web" "$DEPLOY_ROOT/releases/current/web.bak.$(date +%s)"
fi
ln -sfn "$RELEASE_DIR/web" "$DEPLOY_ROOT/releases/current/web.new"
mv -Tf "$DEPLOY_ROOT/releases/current/web.new" "$DEPLOY_ROOT/releases/current/web"

echo "$SHA" > "$DEPLOY_ROOT/releases/current/deployed-sha"
echo "[deploy] complete sha=$SHA"
echo "[deploy] HTTPS GATE: IP+HTTP is test-only; real passwords/keys/rosters need domain+TLS"
