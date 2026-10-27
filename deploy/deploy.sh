#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-local}"
LOCAL_PORT=3014
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.$ENVIRONMENT"
if [ "$ENVIRONMENT" != "local" ]; then
  echo "Use the Vibe Factory environment controls for Coolify deployments."
  exit 1
fi

cd "$ROOT_DIR"

if [ -f "$ENV_FILE" ]; then
  COMMAND_CENTER_DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-}"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  if [ -n "$COMMAND_CENTER_DEPLOY_DRY_RUN" ]; then
    DEPLOY_DRY_RUN="$COMMAND_CENTER_DEPLOY_DRY_RUN"
  fi
fi

if [ ! -d node_modules ]; then
  npm install
fi

echo "Running unit tests for $ENVIRONMENT"
npm run test:unit

echo "Building Next.js app"
NODE_ENV=production npm run build

if [ "$ENVIRONMENT" = "local" ]; then
  echo "Starting local server on port $LOCAL_PORT"

  PID_FILE="$ROOT_DIR/logs/server.pid"
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi

  if command -v fuser >/dev/null 2>&1; then
    PORT_PIDS=$(fuser "$LOCAL_PORT/tcp" 2>/dev/null || true)
    if [ -n "$PORT_PIDS" ]; then
      echo "Releasing port $LOCAL_PORT from PID(s): $PORT_PIDS"
      fuser -k "$LOCAL_PORT/tcp" >/dev/null 2>&1 || true
    fi
  fi

  # Wait for the port to be released (up to 10s)
  for i in $(seq 1 20); do
    ss -H -ltn "sport = :$LOCAL_PORT" | grep -q . || break
    sleep 0.5
  done
  if ss -H -ltn "sport = :$LOCAL_PORT" | grep -q .; then
    echo "Port $LOCAL_PORT is still in use; cannot start local server."
    exit 1
  fi

  mkdir -p "$ROOT_DIR/logs"
  if command -v setsid >/dev/null 2>&1; then
    setsid npx next start -H "0.0.0.0" -p "$LOCAL_PORT" > "$ROOT_DIR/logs/server.log" 2>&1 < /dev/null &
  else
    nohup npx next start -H "0.0.0.0" -p "$LOCAL_PORT" > "$ROOT_DIR/logs/server.log" 2>&1 < /dev/null &
  fi
  SERVER_PID=$!

  # Wait for the server to actually start listening (up to 15s)
  for i in $(seq 1 30); do
    sleep 0.5
    if ss -H -ltn "sport = :$LOCAL_PORT" | grep -q .; then
      LISTENER_PIDS=$(fuser "$LOCAL_PORT/tcp" 2>/dev/null || true)
      LISTENER_PID=$(printf "%s" "$LISTENER_PIDS" | awk '{print $1}')
      if [ -n "$LISTENER_PID" ]; then
        echo "$LISTENER_PID" > "$PID_FILE"
      else
        echo "$SERVER_PID" > "$PID_FILE"
      fi
      echo "Local server started at http://localhost:3014 (PID ${LISTENER_PID:-$SERVER_PID})"
      exit 0
    fi
  done

  echo "Local server failed to start on port $LOCAL_PORT. Check logs/server.log for details."
  exit 1
fi

echo "Remote deployments are managed through Coolify in Vibe Factory."
exit 1

