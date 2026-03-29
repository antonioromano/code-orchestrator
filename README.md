# Code Orchestrator `v0.3.0`

A web-based dashboard for managing multiple AI coding agent sessions simultaneously. Spawn [Claude Code](https://claude.ai/code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), or [OpenAI Codex](https://github.com/openai/codex) processes via pseudo-terminals, stream their I/O to browser-based terminals, and monitor session state in real time.

## Installation

```bash
git clone https://github.com/antonioromano/code-orchestrator.git
cd remote-orchestrator
./setup.sh
```

`setup.sh` handles everything in 5 steps:

1. **Node.js check** — Requires v18+; exits with install instructions if missing
2. **System dependencies** — Verifies `git` and `curl`; on Linux, checks for `python3`, `make`, `g++` (required for node-pty native compilation)
3. **Install dependencies** — Runs `npm install` across all workspaces
4. **AI CLI detection** — Finds installed agents and warns if none are detected
5. **`swarm` command** — Creates a symlink in `~/.local/bin` or `/usr/local/bin`

### Starting the dashboard

```bash
swarm
```

The `swarm` command:
- If the dashboard is already running, opens it in your browser immediately
- Kills any stale processes on ports 5400/5173
- Starts the server and client concurrently
- Waits for the health check to pass, then opens `http://localhost:5173` automatically
- Press **Ctrl+C** to stop all services

### Uninstalling

```bash
./uninstall.sh
```

Removes the `swarm` symlink. Optionally removes `node_modules/`. Project files are left intact.

## Prerequisites

- **Node.js** v18+
- **At least one AI CLI** installed and available in `$PATH`:
  - Claude Code: `npm install -g @anthropic-ai/claude-code`
  - Gemini CLI: `npm install -g @google/gemini-cli`
  - OpenAI Codex: `npm install -g @openai/codex`
- **macOS** or **Linux** (WSL is untested)
- **Linux only:** `build-essential` and `python3` (for node-pty native compilation)

## Dashboard Features

### Session Management

- **Create sessions** — Pick a project folder (system picker or interactive folder tree), set an optional name, and choose which AI agent to run
- **Clone sessions** — Duplicate an existing session in the same folder with a different agent
- **Delete sessions** — Close sessions with a confirmation prompt
- **Status badges** — Each session shows its real-time state: `waiting` (prompt visible), `running` (agent processing), `idle` (quiet, no prompt), or `exited`

### Layout & Organization

- **Grouped grid** — Sessions are automatically grouped by their working folder
- **Drag-and-drop reordering** — Rearrange both groups and individual sessions within groups via drag handles
- **Persistent order** — Session ordering is saved to disk and restored on page reload

### Focus Mode

- **Full-screen session** — Click into any session to expand it, with the terminal taking up most of the view
- **Collapsed session strip** — Other sessions appear as a horizontal mini bar with status indicators for quick switching
- **Exit** — Press **Escape** or click the back button to return to the grid

### Terminal

- **xterm.js terminal** — Smooth, high-performance terminal in the browser
- **Live two-way I/O** — All keyboard input and terminal output streams via Socket.io in real time
- **Reconnect replay** — A 100KB rolling buffer per session replays output when you reconnect or reload
- **Full terminal features** — Clickable links, copy-paste, and responsive resizing

### Git Diff Viewer

- **Inline diff panel** — Opens alongside the terminal in focus mode, showing the current git state of the session's folder
- **Three diff sections** — Unstaged changes, staged changes, and branch changes displayed separately
- **Auto-refresh** — Polls for new changes every 3 seconds while the session is running; manual refresh button also available
- **File-level breakdown** — Expandable file sections with per-file addition/deletion counts; `NEW` and `DELETED` badges for created or removed files
- **Diff fullscreen** — Expand the diff panel to full screen; press **Escape** to collapse

### Multi-Agent Support

- **Built-in agents** — Claude Code, Gemini CLI, and OpenAI Codex available out of the box
- **Custom agents** — Add any CLI tool as an agent via Settings (name + command)
- **Default agent** — Configure which agent is pre-selected when creating new sessions
- **Install detection** — Settings panel shows which agents are installed and their resolved paths, with install commands for missing ones

### Remote Access

- **ngrok tunnel** — Expose the dashboard publicly via an ngrok tunnel directly from the toolbar
- **One-click start/stop** — Start and stop the tunnel from the header; copy or open the public URL
- **Sleep prevention** — Keeps the computer awake while the tunnel is active
- **Install guidance** — If ngrok is not installed, shows OS-specific install instructions (Homebrew on macOS, snap on Linux)

> **Security note:** The public URL grants full terminal access to all sessions. Share it only with trusted users.

### Theme

- **Dark and Light modes** — Dark theme uses a Tokyo Night-inspired palette; Light theme for bright environments
- **Persisted preference** — Theme choice is saved to `localStorage` and defaults to the OS system preference

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Exit diff fullscreen → close diff panel → exit focus mode (priority order) |

### How It Works

1. **Session creation** — The dashboard lets you create named sessions pointed at any local directory.
2. **PTY spawning** — The server spawns the AI CLI inside a pseudo-terminal via the user's login shell (`$SHELL -l -c "exec <agent>"`).
3. **Real-time streaming** — Terminal I/O flows through Socket.io rooms. Each session is a room identified by its UUID.
4. **State detection** — The server strips ANSI codes from output and, after a 500ms settle period, analyzes the tail to classify the session as `waiting`, `running`, `idle`, or `exited`.
5. **Reconnect replay** — A 100KB rolling buffer per session allows clients to catch up on output when joining or reconnecting.
6. **Persistence** — Sessions and their display order are saved to JSON files on disk and restored on server restart.

## Tech Stack

- **Server:** Express, Socket.io, node-pty, TypeScript (ESM)
- **Client:** React 19, xterm.js, Socket.io-client, @dnd-kit, Vite
- **Shared:** TypeScript types for session models, REST shapes, and Socket.io event maps
