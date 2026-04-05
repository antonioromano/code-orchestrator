import { useMemo, useRef, useEffect } from 'react';
import { useResizablePanel } from '../hooks/useResizablePanel.js';
import { ResizeDivider } from './ResizeDivider.js';
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
import { Plus, GitBranch, FolderOpen, X, AlertTriangle } from 'lucide-react';
import { TerminalPanel } from './TerminalPanel.js';
import { SessionGroup } from './SessionGroup.js';
import { GitDiffPanel } from './GitDiffPanel.js';
import { ExplorerPanel } from './ExplorerPanel.js';
import { useGitDiff } from '../hooks/useGitDiff.js';
import { Tooltip } from './primitives/index.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { SessionSidebar } from './SessionSidebar.js';
import { CollapsedChipRow } from './CollapsedChipRow.js';
import { useCollapsedSessions } from '../hooks/useCollapsedSessions.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Keeps the client in a session's socket room so status events still arrive. */
function CollapsedRoomKeeper({ sessionId, socket }: { sessionId: string; socket: TypedSocket }) {
  useEffect(() => {
    socket.emit('session:join', sessionId);
    return () => { socket.emit('session:leave', sessionId); };
  }, [sessionId, socket]);
  return null;
}

interface DiffState {
  isOpen: boolean;
  isFullscreen: boolean;
}

interface DashboardProps {
  sessions: SessionInfo[];
  socket: TypedSocket;
  theme: 'dark' | 'light';
  onDeleteSession: (id: string) => void;
  onRestartSession: (id: string) => void;
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
  getExplorerState: (sessionId: string) => DiffState;
  onToggleExplorer: (sessionId: string) => void;
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

let refitTimer: ReturnType<typeof setTimeout> | undefined;
function triggerRefit() {
  if (refitTimer) clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    window.dispatchEvent(new Event('terminal:refit'));
  }, 150);
}

function FocusedDiffWrapper({
  sessionId,
  sessionStatus,
  sessions,
  onSelectSession,
  diffState,
  theme,
  onClose,
  onToggleFullscreen,
}: {
  sessionId: string;
  sessionStatus: string;
  sessions: SessionInfo[];
  onSelectSession: (id: string) => void;
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
      sessions={sessions}
      currentSessionId={sessionId}
      onSelectSession={onSelectSession}
      onClose={onClose}
      onToggleFullscreen={onToggleFullscreen}
      onRefresh={refresh}
      showSessionSelector={false}
    />
  );
}

function GitDirtyIcon() {
  return (
    <Tooltip content="Uncommitted changes" position="bottom">
      <AlertTriangle size={13} color="var(--color-status-waiting)" strokeWidth={2} style={{ flexShrink: 0 }} />
    </Tooltip>
  );
}

export function Dashboard({
  sessions,
  socket,
  theme,
  onDeleteSession,
  onRestartSession,
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
  getExplorerState,
  onToggleExplorer,
}: DashboardProps) {
  const isFocused = !!focusedSessionId;
  const focusedSession = isFocused ? sessions.find((s) => s.id === focusedSessionId) : null;

  const { isCollapsed, collapse, uncollapse } = useCollapsedSessions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const visibleSessions = useMemo(
    () => sessions.filter((s) => !isCollapsed(s.id)),
    [sessions, isCollapsed],
  );
  const collapsedSessions = useMemo(
    () => sessions.filter((s) => isCollapsed(s.id)),
    [sessions, isCollapsed],
  );

  const groups = useMemo(() => groupSessionsByFolder(visibleSessions), [visibleSessions]);
  const groupKeys = useMemo(() => Array.from(groups.keys()), [groups]);
  const groupSortableIds = useMemo(() => groupKeys.map((k) => `group::${k}`), [groupKeys]);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const focusPanelRef = useRef<HTMLDivElement>(null);

  const { size: diffPanelWidth, isDragging, handleMouseDown: handleDividerMouseDown } = useResizablePanel({
    containerRef: splitContainerRef,
    defaultSize: 40,
    minSize: 20,
    maxSize: 70,
    direction: 'right',
    unit: '%',
    storageKey: 'dashboard-diff-width',
  });

  const { size: explorerPanelWidth, isDragging: isExplorerDragging, handleMouseDown: handleExplorerDividerMouseDown } = useResizablePanel({
    containerRef: splitContainerRef,
    defaultSize: 50,
    minSize: 25,
    maxSize: 75,
    direction: 'right',
    unit: '%',
    storageKey: 'dashboard-explorer-width',
  });

  const { size: sidebarWidth, isDragging: isSidebarDragging, handleMouseDown: handleSidebarDividerMouseDown } = useResizablePanel({
    containerRef: focusPanelRef,
    defaultSize: 200,
    minSize: 120,
    maxSize: 350,
    direction: 'left',
    unit: 'px',
    storageKey: 'dashboard-sidebar-width',
  });

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

      // Reorder among visible sessions, then merge collapsed sessions back at end
      const visibleOrder = visibleSessions.map((s) => s.id);
      const oldIndex = visibleOrder.indexOf(activeSessionId);
      const newIndex = visibleOrder.indexOf(overSessionId);
      if (oldIndex === -1 || newIndex === -1) return;

      const newVisibleOrder = [...visibleOrder];
      newVisibleOrder.splice(oldIndex, 1);
      newVisibleOrder.splice(newIndex, 0, activeSessionId);

      // Append collapsed session IDs at the end (they keep their relative order)
      const collapsedOrder = collapsedSessions.map((s) => s.id);
      onReorder([...newVisibleOrder, ...collapsedOrder]);
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
          height: 'calc(100vh - var(--header-height) - var(--nav-tabs-height))',
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
    <div className="dashboard-outer" style={{ position: 'relative', height: 'calc(100vh - var(--header-height) - var(--nav-tabs-height))', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-deepest)' }}>
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
          {/* Focus header bar — desktop only (hidden on mobile via CSS) */}
          <div
            className="focus-header-desktop"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 16px',
              background: 'var(--color-bg-elevated)',
              borderBottom: '1px solid var(--color-border-ghost)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {focusedSession.name}
              </span>
              {focusedSession.hasGitChanges && (
                <GitDirtyIcon />
              )}
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
              <Tooltip content="Toggle explorer view" position="bottom">
                <button
                  onClick={() => onToggleExplorer(focusedSession.id)}
                  style={{
                    ...focusBarBtnStyle,
                    background: getExplorerState(focusedSession.id).isOpen ? 'var(--color-accent)' : 'transparent',
                    color: getExplorerState(focusedSession.id).isOpen ? '#ffffff' : 'var(--color-text-secondary)',
                    borderColor: getExplorerState(focusedSession.id).isOpen ? 'transparent' : 'var(--color-border-subtle)',
                  }}
                  aria-label="Toggle explorer view"
                  onMouseEnter={(e) => {
                    if (!getExplorerState(focusedSession.id).isOpen)
                      e.currentTarget.style.background = 'var(--color-bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = getExplorerState(focusedSession.id).isOpen
                      ? 'var(--color-accent)'
                      : 'transparent';
                  }}
                >
                  <FolderOpen size={13} strokeWidth={1.75} />
                  Explorer
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Mobile focus header — visible only on mobile via CSS */}
          <div
            className="focus-header-mobile"
            style={{
              display: 'none',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: 'var(--color-bg-elevated)',
              borderBottom: '1px solid var(--color-border-ghost)',
              flexShrink: 0,
            }}
          >
            <select
              className="diff-session-select"
              aria-label="Switch session"
              value={focusedSessionId ?? ''}
              onChange={(e) => handleSwitchFocus(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-input)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                padding: '1px 4px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.hasGitChanges ? '⚠ ' : ''}{s.name} — {s.folderPath.split('/').slice(-2).join('/')}
                </option>
              ))}
            </select>
            <button
              onClick={() => onCloneSession(focusedSession.folderPath, focusedSession.agentType)}
              style={{ ...focusBarBtnStyle, padding: '4px 8px' }}
              aria-label="New session in this folder"
            >
              <Plus size={13} strokeWidth={2} />
            </button>
            <button
              onClick={() => onToggleDiff(focusedSession.id)}
              style={{
                ...focusBarBtnStyle,
                padding: '4px 8px',
                background: getDiffState(focusedSession.id).isOpen ? 'var(--color-accent)' : 'transparent',
                color: getDiffState(focusedSession.id).isOpen ? '#ffffff' : 'var(--color-text-secondary)',
                borderColor: getDiffState(focusedSession.id).isOpen ? 'transparent' : 'var(--color-border-subtle)',
              }}
              aria-label="Toggle diff view"
            >
              <GitBranch size={13} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => onToggleExplorer(focusedSession.id)}
              style={{
                ...focusBarBtnStyle,
                padding: '4px 8px',
                background: getExplorerState(focusedSession.id).isOpen ? 'var(--color-accent)' : 'transparent',
                color: getExplorerState(focusedSession.id).isOpen ? '#ffffff' : 'var(--color-text-secondary)',
                borderColor: getExplorerState(focusedSession.id).isOpen ? 'transparent' : 'var(--color-border-subtle)',
              }}
              aria-label="Toggle explorer view"
            >
              <FolderOpen size={13} strokeWidth={1.75} />
            </button>
            <button
              onClick={handleUnfocus}
              style={{ ...focusBarBtnStyle, padding: '4px 8px', color: 'var(--color-text-muted)' }}
              aria-label="Exit focus mode"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>

          {/* Two-panel content area: sidebar + terminal/diff */}
          <div ref={focusPanelRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>

            {/* Session sidebar — hidden on mobile via CSS */}
            <SessionSidebar
              className="focus-sidebar"
              sessions={sessions}
              activeSessionId={focusedSessionId}
              onSelectSession={handleSwitchFocus}
              width={sidebarWidth}
              headerAction={
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
              }
            />
            <ResizeDivider isDragging={isSidebarDragging} onMouseDown={handleSidebarDividerMouseDown} />

            {/* Terminal + Diff/Explorer split area */}
            <div
              ref={splitContainerRef}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'row',
                overflow: 'hidden',
                cursor: (isDragging || isExplorerDragging) ? 'col-resize' : undefined,
                userSelect: (isDragging || isExplorerDragging) ? 'none' : undefined,
              }}
            >
              {(() => {
                const diffState = getDiffState(focusedSession.id);
                const explorerState = getExplorerState(focusedSession.id);
                const diffFullscreen = diffState.isOpen && diffState.isFullscreen;
                const explorerFullscreen = explorerState.isOpen && explorerState.isFullscreen;
                const showTerminal = !diffFullscreen && !explorerFullscreen;
                const splitPanelWidth = diffState.isOpen ? diffPanelWidth : explorerState.isOpen ? explorerPanelWidth : 0;

                return (
                  <>
                    {showTerminal && (
                      <div
                        style={{
                          width: (diffState.isOpen || explorerState.isOpen) ? `${100 - splitPanelWidth}%` : undefined,
                          flex: (diffState.isOpen || explorerState.isOpen) ? undefined : 1,
                          minHeight: 0,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          padding: 'var(--space-2)',
                        }}
                      >
                        <ErrorBoundary key={focusedSession.id} label={focusedSession.name}>
                          <TerminalPanel
                            session={focusedSession}
                            socket={socket}
                            theme={theme}
                            onDelete={onDeleteSession}
                            onRestart={onRestartSession}
                            onUnfocus={handleUnfocus}
                            onToggleDiff={onToggleDiff}
                            isDiffOpen={diffState.isOpen}
                            onToggleExplorer={onToggleExplorer}
                            isExplorerOpen={explorerState.isOpen}
                          />
                        </ErrorBoundary>
                      </div>
                    )}
                    {diffState.isOpen && !diffFullscreen && (
                      <ResizeDivider isDragging={isDragging} onMouseDown={handleDividerMouseDown} />
                    )}
                    {diffState.isOpen && (
                      <div
                        style={{
                          width: `${diffPanelWidth}%`,
                          minWidth: '200px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <FocusedDiffWrapper
                          sessionId={focusedSession.id}
                          sessionStatus={focusedSession.status}
                          sessions={sessions}
                          onSelectSession={handleSwitchFocus}
                          diffState={diffState}
                          theme={theme}
                          onClose={() => onCloseDiff(focusedSession.id)}
                          onToggleFullscreen={() => onToggleDiffFullscreen(focusedSession.id)}
                        />
                      </div>
                    )}
                    {explorerState.isOpen && !explorerFullscreen && (
                      <ResizeDivider isDragging={isExplorerDragging} onMouseDown={handleExplorerDividerMouseDown} />
                    )}
                    {explorerState.isOpen && (
                      <div
                        style={{
                          width: `${explorerPanelWidth}%`,
                          minWidth: '200px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <ExplorerPanel
                          embedded
                          sessions={sessions}
                          theme={theme}
                          focusedSessionId={focusedSession.id}
                          socket={socket}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* Room keepers — maintain socket room membership for collapsed sessions so status events keep flowing */}
      {collapsedSessions.map((s) => (
        <CollapsedRoomKeeper key={s.id} sessionId={s.id} socket={socket} />
      ))}

      {/* Collapsed chip row — shown above grid when sessions are minimized */}
      {!isFocused && collapsedSessions.length > 0 && (
        <CollapsedChipRow
          sessions={collapsedSessions}
          onUncollapse={(id) => { uncollapse(id); triggerRefit(); }}
        />
      )}

      {/* Grouped grid view */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={groupSortableIds} strategy={verticalListSortingStrategy}>
            <div
              className="dashboard-grid"
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
              {visibleSessions.length === 0 && collapsedSessions.length > 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-md)',
                    gap: 'var(--space-2)',
                  }}
                >
                  All sessions minimized — click a chip above to restore
                </div>
              ) : (
                groupKeys.map((folderPath) => (
                  <SessionGroup
                    key={folderPath}
                    folderPath={folderPath}
                    sessions={groups.get(folderPath)!}
                    socket={socket}
                    theme={theme}
                    onDeleteSession={onDeleteSession}
                    onRestartSession={onRestartSession}
                    onCloneSession={onCloneSession}
                    onFocusSession={onFocusSession}
                    onCollapse={collapse}
                    onToggleDiff={onToggleDiff}
                    onToggleExplorer={onToggleExplorer}
                    focusedSessionId={focusedSessionId}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
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
