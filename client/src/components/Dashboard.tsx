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
import { TerminalPanel } from './TerminalPanel.js';
import { SessionGroup } from './SessionGroup.js';
import { GitDiffPanel } from './GitDiffPanel.js';
import { useGitDiff } from '../hooks/useGitDiff.js';

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
  onCloneSession: (folderPath: string) => void;
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
  const isDark = theme === 'dark';
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

  // Handle unfocus with refit
  const handleUnfocus = () => {
    onUnfocusSession();
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
          height: 'calc(100vh - 60px)',
          color: isDark ? '#565f89' : '#8b8fa3',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>+</div>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>No active sessions</div>
        <button
          onClick={onCreateSession}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '8px',
            background: '#7aa2f7',
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Create Session
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Focus overlay - rendered on top when a session is focused */}
      {isFocused && focusedSession && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            background: isDark ? '#1a1b26' : '#f5f5f5',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 16px',
              background: isDark ? '#1e1f2e' : '#efefef',
              borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#c0caf5' : '#343b58' }}>
                {focusedSession.name}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'Menlo, Monaco, monospace',
                  color: isDark ? '#565f89' : '#8b8fa3',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {focusedSession.folderPath}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => onToggleDiff(focusedSession.id)}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                  borderRadius: '4px',
                  background: getDiffState(focusedSession.id).isOpen ? '#7aa2f7' : 'transparent',
                  color: getDiffState(focusedSession.id).isOpen ? '#ffffff' : (isDark ? '#a9b1d6' : '#565c73'),
                  cursor: 'pointer',
                }}
                title="Toggle diff view"
              >
                Diff
              </button>
              <button
                onClick={handleUnfocus}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                  borderRadius: '4px',
                  background: 'transparent',
                  color: isDark ? '#a9b1d6' : '#565c73',
                  cursor: 'pointer',
                }}
              >
                Exit Focus
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '8px', display: 'flex', flexDirection: 'row' }}>
            {/* Terminal — hidden when diff is fullscreen */}
            {!(getDiffState(focusedSession.id).isOpen && getDiffState(focusedSession.id).isFullscreen) && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
            {/* Diff panel */}
            {getDiffState(focusedSession.id).isOpen && (
              <FocusedDiffWrapper
                sessionId={focusedSession.id}
                sessionStatus={focusedSession.status}
                diffState={getDiffState(focusedSession.id)}
                theme={theme}
                onClose={() => onCloseDiff(focusedSession.id)}
                onToggleFullscreen={() => onToggleDiffFullscreen(focusedSession.id)}
              />
            )}
          </div>
        </div>
      )}

      {/* Grouped view - ALWAYS rendered, hidden behind focus overlay when focused */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groupSortableIds} strategy={verticalListSortingStrategy}>
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(${groupKeys.length}, 1fr)`,
              gap: '8px',
              padding: '8px',
              height: '100%',
              overflow: 'hidden',
              // When focused, keep in DOM but make non-interactive
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
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
