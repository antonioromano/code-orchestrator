import { useState } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';

const STATUS_COLORS: Record<string, string> = {
  waiting: '#f59e0b',
  running: '#3b82f6',
  idle: '#22c55e',
  exited: '#6b7280',
};

interface CollapsedSessionStripProps {
  sessions: SessionInfo[];
  focusedSessionId: string;
  theme: 'dark' | 'light';
  onSwitchFocus: (id: string) => void;
}

function CollapsedBar({
  session,
  theme,
  onClick,
}: {
  session: SessionInfo;
  theme: 'dark' | 'light';
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isDark = theme === 'dark';
  const statusColor = STATUS_COLORS[session.status] || STATUS_COLORS.idle;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderLeft: `3px solid ${statusColor}`,
        borderRadius: '4px',
        background: hovered
          ? (isDark ? '#24253a' : '#e4e4e4')
          : (isDark ? '#1e1f2e' : '#efefef'),
        cursor: 'pointer',
        minWidth: '120px',
        maxWidth: '220px',
        flexShrink: 0,
        transition: 'background 0.15s ease',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: isDark ? '#c0caf5' : '#343b58',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {session.name}
      </span>
    </div>
  );
}

export function CollapsedSessionStrip({
  sessions,
  focusedSessionId,
  theme,
  onSwitchFocus,
}: CollapsedSessionStripProps) {
  const isDark = theme === 'dark';
  const otherSessions = sessions.filter((s) => s.id !== focusedSessionId);

  if (otherSessions.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '6px',
        padding: '4px 16px',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
      }}
    >
      {otherSessions.map((session) => (
        <CollapsedBar
          key={session.id}
          session={session}
          theme={theme}
          onClick={() => onSwitchFocus(session.id)}
        />
      ))}
    </div>
  );
}
