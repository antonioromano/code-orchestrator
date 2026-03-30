#!/usr/bin/env bash
set -euo pipefail

# --- Resolve project root (follows symlinks, works on macOS and Linux) ---
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd -P)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# --- Check Node.js ---
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Please install Node.js 18+." >&2
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ is required (found $(node -v))." >&2
  exit 1
fi

# --- Auto-install dependencies if missing ---
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  echo "Dependencies not installed. Running npm install..."
  (cd "$PROJECT_ROOT" && npm install)
fi

# --- Cross-platform helpers ---

# Open a URL in the default browser
open_url() {
  case "$(uname -s)" in
    Darwin) open "$1" 2>/dev/null || true ;;
    Linux)  xdg-open "$1" 2>/dev/null || sensible-browser "$1" 2>/dev/null || true ;;
    *)      echo "Dashboard ready. Open $1 in your browser." ;;
  esac
}

# Check if a TCP port is listening
check_port() {
  if command -v lsof &>/dev/null; then
    lsof -i :"$1" -sTCP:LISTEN &>/dev/null
  elif command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":$1 "
  else
    (echo >/dev/tcp/localhost/"$1") 2>/dev/null
  fi
}

# Kill processes listening on a TCP port
kill_port() {
  if command -v lsof &>/dev/null; then
    lsof -i :"$1" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
  elif command -v fuser &>/dev/null; then
    fuser -k "$1/tcp" 2>/dev/null || true
  fi
}

# Health check with curl or wget fallback
health_check() {
  if command -v curl &>/dev/null; then
    curl -s --max-time 2 http://localhost:5173/api/health >/dev/null 2>&1
  elif command -v wget &>/dev/null; then
    wget -q --timeout=2 -O /dev/null http://localhost:5173/api/health 2>/dev/null
  else
    return 1
  fi
}

# --- Check if servers are already running ---
if health_check; then
  echo "Swarm is already running. Opening dashboard..."
  open_url http://localhost:5173
  exit 0
fi

# Check for port conflicts (stale processes or other apps)
if check_port 5400 || check_port 5173; then
  echo "Killing stale processes on ports 5400/5173..."
  kill_port 5400
  kill_port 5173
  sleep 1
  # Force kill if still alive
  if check_port 5400 || check_port 5173; then
    if command -v lsof &>/dev/null; then
      lsof -i :5400 -i :5173 -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
    elif command -v fuser &>/dev/null; then
      fuser -k 5400/tcp 2>/dev/null || true
      fuser -k 5173/tcp 2>/dev/null || true
    fi
    sleep 1
  fi
  if check_port 5400 || check_port 5173; then
    echo "Error: Could not free ports 5400/5173." >&2
    exit 1
  fi
  echo "Ports cleared."
fi

# --- Open browser when servers are ready (background) ---
OPENER_PID=""
open_when_ready() {
  local attempts=0
  local max_attempts=60
  while [ $attempts -lt $max_attempts ]; do
    if health_check; then
      echo ""
      echo "Dashboard ready at http://localhost:5173"
      open_url http://localhost:5173
      return 0
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  echo "Warning: Servers did not become ready within 30 seconds." >&2
  echo "Try opening http://localhost:5173 manually." >&2
}
open_when_ready &
OPENER_PID=$!

# --- Cleanup on exit ---
cleanup() {
  if [ -n "$OPENER_PID" ] && kill -0 "$OPENER_PID" 2>/dev/null; then
    kill "$OPENER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- Start servers ---
echo "Starting Argus..."
echo "  Server: http://localhost:5400"
echo "  Client: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."
echo ""

cd "$PROJECT_ROOT"
exec npm run dev
