# Production Deployment

This guide covers running Argus as a persistent, remotely accessible service.

## Quick start

```bash
git clone https://github.com/antonioromano/code-orchestrator.git ~/argus
cd ~/argus
npm install && npm run build
bin/argus setup     # Symlink 'argus' into PATH
argus run           # Verify it starts, then Ctrl+C
```

## argus CLI reference

```
argus run                       Start in foreground (Ctrl+C to stop)
argus start                     Daemonize in background (PID file + log)
argus stop                      Stop the daemon
argus status                    Show running state
argus logs                      Tail the log file
argus update                    Update to latest tag (prompts for confirmation)
argus update vX.Y.Z             Update to a specific tag
argus update --head             Update to tip of default branch (master/main)
argus update --head <branch>    Update to tip of a specific branch
argus update -y                 Skip confirmation prompt
argus update vX.Y.Z --force     Downgrade to an older version
argus setup                     Symlink argus into PATH
argus remove                    Remove symlink, stop daemon, show cleanup instructions
argus help                      Full reference
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ARGUS_PORT` | `5400` | Server port (API + WebSocket + static assets) |
| `ARGUS_DATA_DIR` | `server/data` | Directory for sessions, config, logs, PID file |

Set inline, export in your shell profile, or set in your service definition (launchd, systemd).

## Reliable Remote Access

### Remote access with ngrok

The simplest way to access Argus remotely. ngrok is built into the dashboard — start a tunnel from the toolbar, no extra config needed.

1. Install ngrok and add your authtoken:
   ```bash
   # macOS
   brew install ngrok
   # Linux
   snap install ngrok
   
   ngrok config add-authtoken <your-token>
   ```

2. In the Argus dashboard, click the globe icon in the toolbar and set a password. The tunnel starts immediately and shows the public URL.

3. Share the URL and password with anyone who needs access.

ngrok tunnels the production server's port automatically. The tunnel stops when you click stop in the dashboard or when the server shuts down.

> **Security note:** The public URL grants full terminal access to all sessions. Always set a password and share only with trusted users.

### Reliable restarts

For an always-on installation, use your OS service manager so Argus starts on boot and restarts on crashes.

#### macOS (launchd)

Create a plist at `~/Library/LaunchAgents/com.user.argus.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.argus</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOU/.local/bin/argus</string>
        <string>run</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/YOU/.local/bin:/Users/YOU/.asdf/shims:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin</string>
        <key>ARGUS_PORT</key>
        <string>5400</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOU/Library/Logs/argus.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOU/Library/Logs/argus.log</string>
</dict>
</plist>
```

Run `argus setup` first to create the symlink at `~/.local/bin/argus` (or `/usr/local/bin/argus`). The plist uses the symlink path so it survives if you move the repo. Adjust the `PATH` to include wherever `node` and `npm` live on your system (asdf shims, Homebrew, nvm, system Node, etc.). No `WorkingDirectory` is needed — the script resolves the project root by following the symlink.

Load and manage:

```bash
launchctl load ~/Library/LaunchAgents/com.user.argus.plist     # Start
launchctl unload ~/Library/LaunchAgents/com.user.argus.plist   # Stop
launchctl list | grep com.user.argus                           # Check status
argus logs                                                     # View logs
```

`argus logs` automatically finds the log file by reading the plist's `StandardOutPath` via `PlistBuddy`. On Linux with systemd, it falls back to `journalctl`.

Logs are written to `~/Library/Logs/argus.log` (as configured in the plist). macOS does not rotate these automatically. To prevent unbounded growth, either periodically truncate the file or use `newsyslog`.

With `KeepAlive: true`, launchd restarts the process if it crashes or exits. This means `argus update` (which rebuilds and exits) will trigger an automatic restart.

#### Linux (systemd)

Create `~/.config/systemd/user/argus.service`:

```ini
[Unit]
Description=Argus Dashboard
After=network.target

[Service]
Type=simple
Environment=PATH=/home/YOU/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=ARGUS_PORT=5400
ExecStart=/home/YOU/.local/bin/argus run
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable argus          # Start on login
systemctl --user start argus           # Start now
systemctl --user status argus          # Check status
journalctl --user -u argus -f          # View logs
```

### Remote access with Caddy + Tailscale

For private, always-on remote access without exposing Argus to the public internet, use Tailscale with a Caddy reverse proxy. This is ideal when you want persistent access from your own devices without sharing a public URL.

Argus serves static assets, API, and WebSocket on a single port in production, so the proxy config is straightforward.

Example Caddyfile serving Argus at `/argus` alongside other apps on the same machine:

```
:8777 {
    # Strip /argus prefix, proxy everything to Argus
    handle_path /argus* {
        reverse_proxy localhost:5400
    }

    # Vite build hardcodes asset paths at root level
    handle /assets/* {
        reverse_proxy localhost:5400
    }

    # API and WebSocket at root level
    handle /api/* {
        reverse_proxy localhost:5400
    }
    handle /socket.io/* {
        reverse_proxy localhost:5400
    }
}
```

Expose the Caddy port via Tailscale:

```bash
tailscale serve --bg 8777
```

This makes Argus available at `https://your-machine.tailnet-name.ts.net/argus` with automatic HTTPS, accessible only from your tailnet.

## Updating

```bash
argus update                  # Latest tag (prompts for confirmation)
argus update v0.12.0          # Specific tag
argus update --head           # Tip of default branch (master/main)
argus update --head feature   # Tip of a specific branch
argus update -y               # Skip confirmation
argus update v0.9.0 --force   # Downgrade (blocked by default)
```

The update command:
1. Fetches tags and branches from the remote
2. Compares current vs target version — exits early if already current, blocks downgrades unless `--force` is passed
3. Prompts for confirmation (skip with `-y`, auto-skipped in non-interactive contexts)
4. Stashes uncommitted changes (if any)
5. Checks out the target (tag targets detach HEAD; branch targets create/update a local tracking branch)
6. Runs `npm install` and `npm run build`
7. Restarts the daemon if it was running via `argus start`

If running under launchd/systemd with auto-restart, the service manager handles the restart automatically.

All session data lives in `ARGUS_DATA_DIR` and is untouched by updates (it's gitignored). If an update fails mid-build, re-clone the repo and point `ARGUS_DATA_DIR` at your existing data directory — nothing is lost.

## Multiple instances

Run multiple instances on different ports with isolated data:

```bash
ARGUS_PORT=5400 ARGUS_DATA_DIR=~/argus-data-1 argus start
ARGUS_PORT=5500 ARGUS_DATA_DIR=~/argus-data-2 argus start
```

Each instance has its own sessions, config, PID file, and log file.

## Dev and prod coexistence

Dev mode (`npm run dev` / `swarm start`) uses port 5401 for the API and 5173 for Vite. Production (`argus`) uses port 5400. They can run simultaneously from the same repo — sessions and data are isolated via separate data directories.

For a clean separation, use two clones: one for development, one as the production installation.
