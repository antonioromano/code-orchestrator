import { useRef, useState } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Maximize2, Minimize2, Minus, GitCompare, FolderOpen, X, Move, RotateCcw, AlertTriangle } from 'lucide-react';
import { useTerminal } from '../hooks/useTerminal.js';
import { StatusPill } from './primitives/index.js';
import { Badge } from './primitives/index.js';
import { Tooltip } from './primitives/index.js';
// Status visual handling is now CSS-driven via data-status attribute and StatusPill

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface TerminalPanelProps {
  session: SessionInfo;
  socket: TypedSocket;
  theme: 'dark' | 'light';
  onDelete: (id: string) => void;
  onRestart?: (id: string) => void;
  onFocus?: (id: string) => void;
  onUnfocus?: () => void;
  onCollapse?: (id: string) => void;
  onToggleDiff?: (id: string) => void;
  isDiffOpen?: boolean;
  onToggleExplorer?: (id: string) => void;
  isExplorerOpen?: boolean;
}

const QUICK_ACTIONS = [
  { label: '↑', data: '\x1b[A', title: 'Arrow up' },
  { label: '↓', data: '\x1b[B', title: 'Arrow down' },
  { label: '↵', data: '\r', title: 'Enter' },
  { label: 'y', data: 'y\r', title: 'Yes' },
  { label: 'n', data: 'n\r', title: 'No' },
  { label: '^C', data: '\x03', title: 'Ctrl+C (interrupt)' },
  { label: '1', data: '1\r', title: 'Option 1' },
  { label: '2', data: '2\r', title: 'Option 2' },
  { label: '3', data: '3\r', title: 'Option 3' },
  { label: '4', data: '4\r', title: 'Option 4' },
  { label: '5', data: '5\r', title: 'Option 5' },
  { label: 'Esc', data: '\x1b', title: 'Escape' },
  { label: 'Tab', data: '\t', title: 'Tab' },
];

export function TerminalPanel({ session, socket, theme, onDelete, onRestart, onFocus, onUnfocus, onCollapse, onToggleDiff, isDiffOpen, onToggleExplorer, isExplorerOpen }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminal(containerRef, { sessionId: session.id, socket, theme });

  const [mobileInput, setMobileInput] = useState('');

  const handleMobileSend = () => {
    const text = mobileInput.trim();
    if (!text) return;
    socket.emit('session:input', { sessionId: session.id, data: text + '\r' });
    setMobileInput('');
  };

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `session::${session.id}` });

  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: `background var(--transition-fast), color var(--transition-fast)`,
  };

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className="terminal-panel terminal-card"
      data-status={session.status}
      style={{
        ...sortableStyle,
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        flex: 1,
        background: 'var(--color-bg-card)',
      }}
    >
      <div
        className="terminal-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--color-bg-elevated)',
          flexShrink: 0,
          gap: 'var(--space-2)',
        }}
      >
        {/* Left: drag + name + status pill + agent badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <Tooltip content="Drag to reorder" position="bottom">
            <span
              {...dragAttributes}
              {...dragListeners}
              style={{
                cursor: 'grab',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
                userSelect: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <Move size={14} strokeWidth={1.75} />
            </span>
          </Tooltip>

          <span
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-base)',
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.name}
          </span>

          <StatusPill status={session.status} />

          {session.hasGitChanges && (
            <Tooltip content="Uncommitted changes" position="bottom">
              <AlertTriangle size={13} color="var(--color-status-waiting)" strokeWidth={2} style={{ flexShrink: 0 }} />
            </Tooltip>
          )}

          <Badge label={session.agentType} />
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>

          {onToggleDiff && (
            <Tooltip content="Toggle diff view" position="top">
              <button
                onClick={() => onToggleDiff(session.id)}
                className={isDiffOpen ? '' : 'hover-bg-surface'}
                style={{
                  ...iconBtnStyle,
                  color: isDiffOpen ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  background: isDiffOpen ? 'var(--color-accent-subtle)' : 'transparent',
                }}
                aria-label="Toggle diff view"
              >
                <GitCompare size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          {onToggleExplorer && (
            <Tooltip content="Toggle explorer view" position="top">
              <button
                onClick={() => onToggleExplorer(session.id)}
                className={isExplorerOpen ? '' : 'hover-bg-surface'}
                style={{
                  ...iconBtnStyle,
                  color: isExplorerOpen ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  background: isExplorerOpen ? 'var(--color-accent-subtle)' : 'transparent',
                }}
                aria-label="Toggle explorer view"
              >
                <FolderOpen size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          {onFocus && (
            <Tooltip content="Focus session" position="top">
              <button
                onClick={() => onFocus(session.id)}
                className="hover-bg-surface"
                style={iconBtnStyle}
                aria-label="Focus session"
              >
                <Maximize2 size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          {onCollapse && (
            <Tooltip content="Minimize to chip" position="top">
              <button
                onClick={() => onCollapse(session.id)}
                className="hover-bg-surface"
                style={iconBtnStyle}
                aria-label="Minimize session"
              >
                <Minus size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          {onUnfocus && (
            <Tooltip content="Close focus" position="top">
              <button
                onClick={onUnfocus}
                className="hover-bg-surface"
                style={iconBtnStyle}
                aria-label="Close focus"
              >
                <Minimize2 size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          {onRestart && session.status === 'exited' && (
            <Tooltip content="Restart session" position="top">
              <button
                onClick={() => onRestart(session.id)}
                className="hover-success"
                style={iconBtnStyle}
                aria-label="Restart session"
              >
                <RotateCcw size={14} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}

          <Tooltip content="Close session" position="top">
            <button
              onClick={() => onDelete(session.id)}
              className="hover-error"
              style={iconBtnStyle}
              aria-label="Close session"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '4px',
          background: 'var(--color-bg-deepest)',
        }}
      />

      {/* Mobile input toolbar — hidden on desktop via CSS */}
      <div className="mobile-terminal-input">
        <div className="mobile-terminal-quickkeys">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="mobile-quickkey-btn"
              title={action.title}
              aria-label={action.title}
              onClick={() => socket.emit('session:input', { sessionId: session.id, data: action.data })}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="mobile-terminal-textrow">
          <input
            className="mobile-terminal-text-input"
            type="text"
            aria-label="Type command"
            placeholder="Type command..."
            value={mobileInput}
            onChange={(e) => setMobileInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleMobileSend();
              }
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button className="mobile-terminal-send-btn" onClick={handleMobileSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
