import { useRef } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTerminal } from '../hooks/useTerminal.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const STATUS_COLORS: Record<string, string> = {
  waiting: '#f59e0b',
  running: '#3b82f6',
  idle: '#22c55e',
  exited: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting for input',
  running: 'Running',
  idle: 'Idle',
  exited: 'Exited',
};

interface TerminalPanelProps {
  session: SessionInfo;
  socket: TypedSocket;
  theme: 'dark' | 'light';
  onDelete: (id: string) => void;
  onFocus?: (id: string) => void;
  onToggleDiff?: (id: string) => void;
  isDiffOpen?: boolean;
}

export function TerminalPanel({ session, socket, theme, onDelete, onFocus, onToggleDiff, isDiffOpen }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminal(containerRef, { sessionId: session.id, socket, theme });

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `session::${session.id}` });

  const borderColor = STATUS_COLORS[session.status] || STATUS_COLORS.idle;
  const isDark = theme === 'dark';

  const headerBtnStyle = {
    background: 'none',
    border: 'none',
    color: isDark ? '#565f89' : '#8b8fa3',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 4px',
    lineHeight: 1,
  };

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className="terminal-panel"
      style={{
        ...sortableStyle,
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        flex: 1,
        background: isDark ? '#1a1b26' : '#f5f5f5',
      }}
    >
      <div
        className="terminal-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: isDark ? '#16161e' : '#e8e8e8',
          borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            {...dragAttributes}
            {...dragListeners}
            style={{
              cursor: 'grab',
              fontSize: '12px',
              color: isDark ? '#565f89' : '#8b8fa3',
              flexShrink: 0,
              userSelect: 'none',
            }}
            title="Drag to reorder"
          >
            {'\u2807'}
          </span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: borderColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: isDark ? '#c0caf5' : '#343b58',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.name}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: isDark ? '#565f89' : '#8b8fa3',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.folderPath}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '11px',
              color: borderColor,
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            {STATUS_LABELS[session.status]}
          </span>
          {onToggleDiff && (
            <button
              onClick={() => onToggleDiff(session.id)}
              style={{
                ...headerBtnStyle,
                color: isDiffOpen ? '#7aa2f7' : headerBtnStyle.color,
              }}
              title="Toggle diff view"
            >
              {'\u2A25'}
            </button>
          )}
          {onFocus && (
            <button
              onClick={() => onFocus(session.id)}
              style={headerBtnStyle}
              title="Focus session"
            >
              {'\u2922'}
            </button>
          )}
          <button
            onClick={() => onDelete(session.id)}
            style={headerBtnStyle}
            title="Close session"
          >
            {'\u2715'}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '4px',
        }}
      />
    </div>
  );
}
