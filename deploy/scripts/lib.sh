# Shared compose paths for deploy/backup/rollback. Source from sibling scripts.
# CI and host must use the same files: deploy/compose.yml + deploy/compose.prod.yml.

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/xiaohuang-classroom}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/secrets/.env}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-deploy}"

compose() {
  local files=(-f "$COMPOSE_DIR/compose.yml" -f "$COMPOSE_DIR/compose.prod.yml")
  local env_args=()
  if [[ -f "$ENV_FILE" ]]; then
    env_args+=(--env-file "$ENV_FILE")
  fi
  docker compose -p "$COMPOSE_PROJECT_NAME" "${env_args[@]}" "${files[@]}" "$@"
}
