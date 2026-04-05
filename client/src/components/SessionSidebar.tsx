import type { ReactNode } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';
import { StatusDot } from './primitives/index.js';
import { AlertTriangle } from 'lucide-react';

interface SessionSidebarProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  /** Optional element rendered next to the "Sessions" header label */
  headerAction?: ReactNode;
  className?: string;
  /** Override the default 200px width */
  width?: number;
}

export function SessionSidebar({ sessions, activeSessionId, onSelectSession, headerAction, className, width }: SessionSidebarProps) {
  return (
    <div
      className={className}
      style={{
        width: width != null ? `${width}px` : '200px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-base)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border-base)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Sessions
        </span>
        {headerAction}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          return (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              aria-current={isActive ? 'true' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 8px',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                borderRadius: 'var(--radius-sm)',
                background: isActive ? 'var(--color-surface-bright, var(--color-bg-surface))' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background var(--transition-fast)',
                marginBottom: '2px',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--color-bg-elevated)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <StatusDot status={s.status} size={6} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                  >
                    {s.name}
                  </span>
                  {s.hasGitChanges && (
                    <AlertTriangle size={11} color="var(--color-status-waiting)" strokeWidth={2} style={{ flexShrink: 0 }} />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {s.folderPath.split('/').slice(-2).join('/')}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
