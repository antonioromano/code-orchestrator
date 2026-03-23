import { useMemo } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, GitBranch, X } from 'lucide-react';
import { TerminalPanel } from './TerminalPanel.js';
import { SessionGroup } from './SessionGroup.js';
import { GitDiffPanel } from './GitDiffPanel.js';
import { useGitDiff } from '../hooks/useGitDiff.js';
import { Tooltip, StatusDot } from './primitives/index.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface DiffState {
  isOpen: boolean;
  isFullscreen: boolean;
}

interface DashboardProps {
  sessions: SessionInfo[];
  socket: TypedSocket;
  theme: 'dark' | 'light';
  onDeleteSession: (id: string) => void;
  onCreateSession: () => void;
  onCloneSession: (folderPath: string, agentType?: string) => void;
  onReorder: (order: string[]) => void;
  focusedSessionId: string | null;
  onFocusSession: (id: string) => void;
  onUnfocusSession: () => void;
  getDiffState: (sessionId: string) => DiffState;
  onToggleDiff: (sessionId: string) => void;
  onToggleDiffFullscreen: (sessionId: string) => void;
  onCloseDiff: (sessionId: string) => void;
}

function groupSessionsByFolder(sessions: SessionInfo[]): Map<string, SessionInfo[]> {
  const groups = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    const existing = groups.get(session.folderPath) || [];
    existing.push(session);
    groups.set(session.folderPath, existing);
  }
  return groups;
}

function triggerRefit() {
  for (const delay of [50, 150, 350]) {
    setTimeout(() => {
      window.dispatchEvent(new Event('terminal:refit'));
    }, delay);
  }
}

function FocusedDiffWrapper({
  sessionId,
  sessionStatus,
  diffState,
  theme,
  onClose,
  onToggleFullscreen,
}: {
  sessionId: string;
  sessionStatus: string;
  diffState: DiffState;
  theme: 'dark' | 'light';
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const { diff, isLoading, error, refresh } = useGitDiff({
    sessionId,
    isOpen: diffState.isOpen,
    sessionStatus: sessionStatus as 'running' | 'waiting' | 'idle' | 'exited',
  });

  return (
    <GitDiffPanel
      diff={diff}
      theme={theme}
      isLoading={isLoading}
      error={error}
      isFullscreen={diffState.isFullscreen}
      onClose={onClose}
      onToggleFullscreen={onToggleFullscreen}
      onRefresh={refresh}
    />
  );
}

export function Dashboard({
  sessions,
  socket,
  theme,
  onDeleteSession,
  onCreateSession,
  onCloneSession,
  onReorder,
  focusedSessionId,
  onFocusSession,
  onUnfocusSession,
  getDiffState,
  onToggleDiff,
  onToggleDiffFullscreen,
  onCloseDiff,
}: DashboardProps) {
  const isFocused = !!focusedSessionId;
  const focusedSession = isFocused ? sessions.find((s) => s.id === focusedSessionId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const groups = useMemo(() => groupSessionsByFolder(sessions), [sessions]);
  const groupKeys = useMemo(() => Array.from(groups.keys()), [groups]);
  const groupSortableIds = useMemo(() => groupKeys.map((k) => `group::${k}`), [groupKeys]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith('group::') && overId.startsWith('group::')) {
      const activeKey = activeId.replace('group::', '');
      const overKey = overId.replace('group::', '');

      const oldIndex = groupKeys.indexOf(activeKey);
      const newIndex = groupKeys.indexOf(overKey);
      if (oldIndex === -1 || newIndex === -1) return;

      const newGroupKeys = [...groupKeys];
      newGroupKeys.splice(oldIndex, 1);
      newGroupKeys.splice(newIndex, 0, activeKey);

      const newOrder: string[] = [];
      for (const key of newGroupKeys) {
        const groupSessions = groups.get(key);
        if (groupSessions) {
          for (const s of groupSessions) {
            newOrder.push(s.id);
          }
        }
      }
      onReorder(newOrder);
    } else if (activeId.startsWith('session::') && overId.startsWith('session::')) {
      const activeSessionId = activeId.replace('session::', '');
      const overSessionId = overId.replace('session::', '');

      const currentOrder = sessions.map((s) => s.id);
      const oldIndex = currentOrder.indexOf(activeSessionId);
      const newIndex = currentOrder.indexOf(overSessionId);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = [...currentOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, activeSessionId);
      onReorder(newOrder);
    }

    triggerRefit();
  };

  const handleUnfocus = () => {
    onUnfocusSession();
    triggerRefit();
  };

  const handleSwitchFocus = (id: string) => {
    onFocusSession(id);
    triggerRefit();
  };

  // Empty state
  if (sessions.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - var(--header-height))',
          gap: 'var(--space-4)',
          color: 'var(--color-text-muted)',
        }}
      >
        {/* Terminal illustration */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 'var(--radius-xl)',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-base)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M6 8l3 3-3 3M11 14h6" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            No sessions yet
          </div>
          <div style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-muted)' }}>
            Create a Claude Code session to get started
          </div>
        </div>
        <button
          onClick={onCreateSession}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            fontSize: 'var(--text-md)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent)',
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'opacity var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={16} strokeWidth={2} />
          New Session
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - var(--header-height))', overflow: 'hidden' }}>
      {/* Focus overlay */}
      {isFocused && focusedSession && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-base)',
          }}
        >
          {/* Focus header bar - simplified (no Exit Focus button, that's in the sidebar) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 16px',
              background: 'var(--color-bg-elevated)',
              borderBottom: '1px solid var(--color-border-base)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {focusedSession.name}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {focusedSession.folderPath}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Tooltip content="New session in this folder" position="bottom">
                <button
                  onClick={() => onCloneSession(focusedSession.folderPath, focusedSession.agentType)}
                  style={focusBarBtnStyle}
                  aria-label="New session in this folder"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-surface)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Plus size={13} strokeWidth={2} />
                  Session
                </button>
              </Tooltip>
              <Tooltip content="Toggle diff view" position="bottom">
                <button
                  onClick={() => onToggleDiff(focusedSession.id)}
                  style={{
                    ...focusBarBtnStyle,
                    background: getDiffState(focusedSession.id).isOpen ? 'var(--color-accent)' : 'transparent',
                    color: getDiffState(focusedSession.id).isOpen ? '#ffffff' : 'var(--color-text-secondary)',
                    borderColor: getDiffState(focusedSession.id).isOpen ? 'transparent' : 'var(--color-border-subtle)',
                  }}
                  aria-label="Toggle diff view"
                  onMouseEnter={(e) => {
                    if (!getDiffState(focusedSession.id).isOpen)
                      e.currentTarget.style.background = 'var(--color-bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = getDiffState(focusedSession.id).isOpen
                      ? 'var(--color-accent)'
                      : 'transparent';
                  }}
                >
                  <GitBranch size={13} strokeWidth={1.75} />
                  Diff
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Two-panel content area: sidebar + terminal/diff */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>

            {/* Session sidebar */}
            <div
              style={{
                width: '200px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-surface)',
                borderRight: '1px solid var(--color-border-base)',
                overflow: 'hidden',
              }}
            >
              {/* Sidebar header */}
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
                <button
                  onClick={handleUnfocus}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'inline-flex',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'color var(--transition-fast)',
                  }}
                  title="Exit focus mode"
                  aria-label="Exit focus mode"
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>

              {/* Session list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                {sessions.map((s) => {
                  const isActive = s.id === focusedSessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSwitchFocus(s.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        width: '100%',
                        padding: '6px 8px',
                        border: 'none',
                        borderLeft: isActive
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                        borderRadius: 'var(--radius-sm)',
                        background: isActive
                          ? 'var(--color-surface-bright, var(--color-bg-surface))'
                          : 'transparent',
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
                            fontSize: 'var(--text-sm)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.name}
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

            {/* Terminal + Diff area */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!(getDiffState(focusedSession.id).isOpen && getDiffState(focusedSession.id).isFullscreen) && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'var(--space-2)' }}>
                  <TerminalPanel
                    session={focusedSession}
                    socket={socket}
                    theme={theme}
                    onDelete={onDeleteSession}
                    onToggleDiff={onToggleDiff}
                    isDiffOpen={getDiffState(focusedSession.id).isOpen}
                  />
                </div>
              )}
              {getDiffState(focusedSession.id).isOpen && (
                <div
                  style={{
                    maxHeight: '40%',
                    minHeight: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: '1px solid var(--color-border-base)',
                  }}
                >
                  <FocusedDiffWrapper
                    sessionId={focusedSession.id}
                    sessionStatus={focusedSession.status}
                    diffState={getDiffState(focusedSession.id)}
                    theme={theme}
                    onClose={() => onCloseDiff(focusedSession.id)}
                    onToggleFullscreen={() => onToggleDiffFullscreen(focusedSession.id)}
                  />
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Grouped grid view */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groupSortableIds} strategy={verticalListSortingStrategy}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(500px, 100%), 1fr))`,
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              height: '100%',
              overflow: 'hidden',
              visibility: isFocused ? 'hidden' : 'visible',
              pointerEvents: isFocused ? 'none' : 'auto',
            }}
          >
            {groupKeys.map((folderPath) => (
              <SessionGroup
                key={folderPath}
                folderPath={folderPath}
                sessions={groups.get(folderPath)!}
                socket={socket}
                theme={theme}
                onDeleteSession={onDeleteSession}
                onCloneSession={onCloneSession}
                onFocusSession={onFocusSession}
                onToggleDiff={onToggleDiff}
                focusedSessionId={focusedSessionId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

const focusBarBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  fontSize: 'var(--text-sm)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  transition: 'background var(--transition-fast)',
  fontWeight: 500,
};
