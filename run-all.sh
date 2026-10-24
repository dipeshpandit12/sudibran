#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${REPO_ROOT}/compose.yaml"
FRONTEND_ENV_FILE="${REPO_ROOT}/frontend/.env"
BACKEND_ENV_FILE="${REPO_ROOT}/backend/.env"

compose() {
  if [[ -f "${BACKEND_ENV_FILE}" ]]; then
    docker compose --env-file "${BACKEND_ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
  else
    docker compose -f "${COMPOSE_FILE}" "$@"
  fi
}

check_env_files() {
  local missing=false

  if [[ ! -f "${FRONTEND_ENV_FILE}" ]]; then
    echo "Warning: frontend/.env is missing." >&2
    echo "  Create it with: cp frontend/.env.example frontend/.env" >&2
    echo "  Then review frontend/.env and add your local frontend settings." >&2
    missing=true
  fi

  if [[ ! -f "${BACKEND_ENV_FILE}" ]]; then
    echo "Warning: backend/.env is missing." >&2
    echo "  Create it with: cp backend/.env.example backend/.env" >&2
    echo "  Then review backend/.env and add your local integration settings." >&2
    missing=true
  fi

  if [[ "${missing}" == "true" ]]; then
    echo "  Do not commit either .env file; both are ignored by Git." >&2
    echo "  Docker will continue with safe defaults where values are missing." >&2
    echo >&2
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-60}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --show-error --fail --max-time 2 "${url}" >/dev/null 2>&1; then
      echo "✓ ${label} is ready: ${url}"
      return 0
    fi
    sleep 2
  done

  echo "${label} did not become ready at ${url}." >&2
  compose ps >&2
  return 1
}

usage() {
  cat <<'EOF'
Usage: ./run-all.sh [up|down|restart|logs|status|build]

  up       Build and start the complete Docker stack (default)
  down     Stop the stack while preserving the Postgres volume
  restart  Recreate the complete stack and wait for health
  logs     Follow logs from every service
  status   Show service and health status
  build    Build all images without starting them

The Docker stack uses the scripted planner because the locally authenticated
Factory Droid binary is a host executable. Run the backend directly on the host
when you need subscription-authenticated Droid planning.
EOF
}

command="${1:-up}"

if [[ "${command}" == "help" || "${command}" == "-h" || "${command}" == "--help" ]]; then
  usage
  exit 0
fi

check_env_files

require_command docker
require_command curl

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

# The host's subscription-authenticated Droid binary cannot execute in the Linux image.
# A caller may explicitly choose another container-safe planner with DOCKER_PLANNER.
export PLANNER="${DOCKER_PLANNER:-scripted}"

case "${command}" in
  up)
    compose up --build --detach
    wait_for_url "FastAPI" "http://127.0.0.1:8000/api/health"
    wait_for_url "Next.js" "http://127.0.0.1:3000"
    echo
    echo "Sudibran is running:"
    echo "  Frontend: http://localhost:3000"
    echo "  FastAPI:  http://localhost:8000/docs"
    echo "  Health:   http://localhost:8000/api/health"
    echo "  Logs:     ./run-all.sh logs"
    echo "  Stop:     ./run-all.sh down"
    ;;
  down)
    compose down
    ;;
  restart)
    compose down
    compose up --build --detach
    wait_for_url "FastAPI" "http://127.0.0.1:8000/api/health"
    wait_for_url "Next.js" "http://127.0.0.1:3000"
    ;;
  logs)
    compose logs --follow
    ;;
  status)
    compose ps
    ;;
  build)
    compose build
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

