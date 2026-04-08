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

# --- Ports (must not collide with argus production on 5400) ---
SERVER_PORT=5401
CLIENT_PORT=5402

# --- Runtime file paths ---
RUNTIME_DIR="$PROJECT_ROOT/server/data"
PID_FILE="$RUNTIME_DIR/swarm.pid"
SESSION_FILE="$RUNTIME_DIR/swarm.session"
LOG_FILE="$RUNTIME_DIR/swarm.log"

# --- Cross-platform helpers ---

open_url() {
  case "$(uname -s)" in
    Darwin) open "$1" 2>/dev/null || true ;;
    Linux)  xdg-open "$1" 2>/dev/null || sensible-browser "$1" 2>/dev/null || true ;;
    *)      echo "Dashboard ready. Open $1 in your browser." ;;
  esac
}

check_port() {
  if command -v lsof &>/dev/null; then
    lsof -i :"$1" -sTCP:LISTEN &>/dev/null
  elif command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":$1 "
  else
    (echo >/dev/tcp/localhost/"$1") 2>/dev/null
  fi
}

kill_port() {
  if command -v lsof &>/dev/null; then
    lsof -i :"$1" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
  elif command -v fuser &>/dev/null; then
    fuser -k "$1/tcp" 2>/dev/null || true
  fi
}

force_kill_port() {
  if command -v lsof &>/dev/null; then
    lsof -i :"$1" -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  elif command -v fuser &>/dev/null; then
    fuser -k "$1/tcp" 2>/dev/null || true
  fi
}

health_check() {
  if command -v curl &>/dev/null; then
    curl -s --max-time 2 http://localhost:$CLIENT_PORT/api/health >/dev/null 2>&1
  elif command -v wget &>/dev/null; then
    wget -q --timeout=2 -O /dev/null http://localhost:$CLIENT_PORT/api/health 2>/dev/null
  else
    return 1
  fi
}

# --- Preflight checks ---

preflight() {
  # Check Node.js
  if ! command -v node &>/dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+." >&2
    exit 1
  fi
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Error: Node.js 18+ is required (found $(node -v))." >&2
    exit 1
  fi

  # Auto-install dependencies if missing
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "Dependencies not installed. Running npm install..."
    (cd "$PROJECT_ROOT" && npm install)
  fi

  # Ensure runtime directory exists
  mkdir -p "$RUNTIME_DIR"
}

# --- Clean stale ports ---

clean_ports() {
  if check_port $SERVER_PORT || check_port $CLIENT_PORT; then
    echo "Killing stale processes on ports $SERVER_PORT/$CLIENT_PORT..."
    kill_port $SERVER_PORT
    kill_port $CLIENT_PORT
    sleep 1
    # Force kill if still alive
    if check_port $SERVER_PORT || check_port $CLIENT_PORT; then
      force_kill_port $SERVER_PORT
      force_kill_port $CLIENT_PORT
      sleep 1
    fi
    if check_port $SERVER_PORT || check_port $CLIENT_PORT; then
      echo "Error: Could not free ports $SERVER_PORT/$CLIENT_PORT." >&2
      exit 1
    fi
    echo "Ports cleared."
  fi
}

# --- Detect backgrounding method ---

detect_method() {
  if command -v screen &>/dev/null; then
    echo "screen"
  elif command -v tmux &>/dev/null; then
    echo "tmux"
  else
    echo "nohup"
  fi
}

# --- Open browser when ready (background, disowned) ---

open_when_ready() {
  local attempts=0
  local max_attempts=60
  while [ $attempts -lt $max_attempts ]; do
    if health_check; then
      echo ""
      echo "Dashboard ready at http://localhost:$CLIENT_PORT"
      open_url http://localhost:$CLIENT_PORT
      return 0
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  echo "Warning: Servers did not become ready within 30 seconds." >&2
  echo "Try opening http://localhost:$CLIENT_PORT manually." >&2
}

# --- Subcommands ---

cmd_start() {
  preflight

  # Already running?
  if health_check; then
    echo "Swarm is already running. Opening dashboard..."
    open_url http://localhost:$CLIENT_PORT
    exit 0
  fi

  # Clean stale ports
  clean_ports

  # Detect backgrounding method
  local method
  method=$(detect_method)

  # Truncate log file
  : > "$LOG_FILE"

  # Write session marker
  echo "$method" > "$SESSION_FILE"

  echo "Starting Swarm in background (via $method)..."
  echo "  Server: http://localhost:$SERVER_PORT"
  echo "  Client: http://localhost:$CLIENT_PORT"
  echo ""

  case "$method" in
    screen)
      screen -dmS swarm bash -c "cd '$PROJECT_ROOT' && npm run dev 2>&1 | tee -a '$LOG_FILE'"
      ;;
    tmux)
      tmux new-session -d -s swarm "cd '$PROJECT_ROOT' && npm run dev 2>&1 | tee -a '$LOG_FILE'"
      ;;
    nohup)
      nohup bash -c "cd '$PROJECT_ROOT' && npm run dev" > "$LOG_FILE" 2>&1 &
      echo $! > "$PID_FILE"
      disown
      ;;
  esac

  # Wait for health check in background, then open browser (fully detached from terminal)
  ( open_when_ready ) >> "$LOG_FILE" 2>&1 &
  disown

  echo "Use 'swarm logs'    to see output."
  echo "Use 'swarm stop'    to shut down."
  [ "$method" != "nohup" ] && echo "Use 'swarm attach'  to attach to the live session."
  echo ""
}

cmd_stop() {
  if ! health_check && [ ! -f "$SESSION_FILE" ]; then
    echo "Swarm is not running."
    exit 0
  fi

  echo "Stopping Swarm..."

  # Method-specific kill
  if [ -f "$SESSION_FILE" ]; then
    local method
    method=$(cat "$SESSION_FILE")
    case "$method" in
      screen)
        screen -S swarm -X quit 2>/dev/null || true
        ;;
      tmux)
        tmux kill-session -t swarm 2>/dev/null || true
        ;;
      nohup)
        if [ -f "$PID_FILE" ]; then
          local pid
          pid=$(cat "$PID_FILE")
          # Try killing the process group first, then the individual process
          kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        fi
        ;;
    esac
  fi

  # Safety net: kill anything still on our ports
  sleep 1
  kill_port $SERVER_PORT
  kill_port $CLIENT_PORT
  sleep 1

  # Force kill if still alive
  if check_port $SERVER_PORT || check_port $CLIENT_PORT; then
    force_kill_port $SERVER_PORT
    force_kill_port $CLIENT_PORT
    sleep 1
  fi

  # Clean up runtime files
  rm -f "$PID_FILE" "$SESSION_FILE"

  if check_port $SERVER_PORT || check_port $CLIENT_PORT; then
    echo "Warning: Some processes may still be running on ports $SERVER_PORT/$CLIENT_PORT." >&2
  else
    echo "Swarm stopped."
  fi
}

cmd_status() {
  if health_check; then
    local method="unknown"
    [ -f "$SESSION_FILE" ] && method=$(cat "$SESSION_FILE")
    echo "Swarm is running (via $method)."
    echo "  Dashboard: http://localhost:$CLIENT_PORT"
  elif [ -f "$SESSION_FILE" ]; then
    echo "Swarm appears to have crashed."
    echo "  Run 'swarm stop' to clean up, then 'swarm start'."
  else
    echo "Swarm is not running."
  fi
}

cmd_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file found. Is Swarm running?" >&2
    echo "  Start with: swarm start" >&2
    exit 1
  fi
  echo "Tailing Swarm logs (Ctrl+C to stop tailing)..."
  echo ""
  tail -f "$LOG_FILE"
}

cmd_attach() {
  if ! health_check; then
    echo "Swarm is not running. Start it with: swarm start" >&2
    exit 1
  fi

  if [ ! -f "$SESSION_FILE" ]; then
    echo "No session file found. Cannot determine session type." >&2
    echo "  Use 'swarm logs' to see output instead." >&2
    exit 1
  fi

  local method
  method=$(cat "$SESSION_FILE")
  case "$method" in
    screen)
      echo "Attaching to screen session (detach with Ctrl+A, D)..."
      screen -r swarm
      ;;
    tmux)
      echo "Attaching to tmux session (detach with Ctrl+B, D)..."
      tmux attach -t swarm
      ;;
    nohup)
      echo "Cannot attach in nohup mode. Use 'swarm logs' instead."
      ;;
    *)
      echo "Unknown session type: $method" >&2
      echo "  Use 'swarm logs' to see output instead." >&2
      exit 1
      ;;
  esac
}

cmd_help() {
  echo "Usage: swarm <command>"
  echo ""
  echo "Commands:"
  echo "  start     Start Swarm in the background"
  echo "  stop      Stop the running Swarm service"
  echo "  status    Show whether Swarm is running (default)"
  echo "  logs      Tail the Swarm log output"
  echo "  attach    Attach to the live session (screen/tmux only)"
  echo "  help      Show this help message"
  echo ""
  echo "Examples:"
  echo "  swarm             Show status"
  echo "  swarm start       Start the service in background"
  echo "  swarm stop        Stop the service"
  echo ""
}

# --- Subcommand dispatch ---

COMMAND="${1:-status}"

case "$COMMAND" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  attach)  cmd_attach ;;
  help|--help|-h)  cmd_help ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    echo ""
    cmd_help
    exit 1
    ;;
esac
