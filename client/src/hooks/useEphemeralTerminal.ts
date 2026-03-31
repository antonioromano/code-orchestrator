import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DARK_THEME = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

const LIGHT_THEME = {
  background: '#f5f5f5',
  foreground: '#343b58',
  cursor: '#343b58',
  selectionBackground: '#b4d5fe',
  black: '#0f0f14',
  red: '#8c4351',
  green: '#485e30',
  yellow: '#8f5e15',
  blue: '#34548a',
  magenta: '#5a4a78',
  cyan: '#0f4b6e',
  white: '#343b58',
  brightBlack: '#9699a3',
  brightRed: '#8c4351',
  brightGreen: '#485e30',
  brightYellow: '#8f5e15',
  brightBlue: '#34548a',
  brightMagenta: '#5a4a78',
  brightCyan: '#0f4b6e',
  brightWhite: '#343b58',
};

interface UseEphemeralTerminalOptions {
  id: string;
  cwd: string;
  socket: TypedSocket;
  theme: 'dark' | 'light';
}

export function useEphemeralTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseEphemeralTerminalOptions,
) {
  const { id, cwd, socket, theme } = options;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: themeRef.current === 'dark' ? DARK_THEME : LIGHT_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);

    terminalRef.current = terminal;

    requestAnimationFrame(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        fitAddon.fit();
        socket.emit('ephemeral:spawn', { id, cwd });
        socket.emit('ephemeral:resize', { id, cols: terminal.cols, rows: terminal.rows });
      } else {
        socket.emit('ephemeral:spawn', { id, cwd });
      }
    });

    const handleOutput = ({ id: eid, data }: { id: string; data: string }) => {
      if (eid === id) terminal.write(data);
    };
    socket.on('ephemeral:output', handleOutput);

    const onDataDisposable = terminal.onData((data) => {
      socket.emit('ephemeral:input', { id, data });
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit();
          socket.emit('ephemeral:resize', { id, cols: terminal.cols, rows: terminal.rows });
        }
      }, 100);
    });
    resizeObserver.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      socket.off('ephemeral:output', handleOutput);
      socket.emit('ephemeral:kill', { id });
      terminal.dispose();
      terminalRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, socket, cwd]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    }
  }, [theme]);
}
