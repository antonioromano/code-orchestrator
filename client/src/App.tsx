import { useState, useEffect, useCallback } from 'react';
import { useTheme } from './context/ThemeContext.js';
import { Styleguide } from './components/styleguide/Styleguide.js';
import { useSocket, useSocketStatus, reconnectSocket } from './hooks/useSocket.js';
import { useSessions } from './hooks/useSessions.js';
import { useSessionOrder } from './hooks/useSessionOrder.js';
import { useNgrok } from './hooks/useNgrok.js';
import { useConfig } from './hooks/useConfig.js';
import { useGitDiff } from './hooks/useGitDiff.js';
import type { SessionInfo } from '@remote-orchestrator/shared';
import { Dashboard } from './components/Dashboard.js';
import { CreateSessionModal } from './components/CreateSessionModal.js';
import { CloneSessionModal } from './components/CloneSessionModal.js';
import { NgrokModal } from './components/NgrokModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { PasswordGate } from './components/PasswordGate.js';
import { GitDiffPanel } from './components/GitDiffPanel.js';
import { ExplorerPanel } from './components/ExplorerPanel.js';
import { NavTabs } from './components/NavTabs.js';
import type { AppTab } from './components/NavTabs.js';
import { MobileBottomNav } from './components/MobileBottomNav.js';
import { api, setToken } from './services/api.js';
import { WifiOff } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary.js';

interface DiffState {
  isOpen: boolean;
  isFullscreen: boolean;
}

export default function App() {
  const socket = useSocket();
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Check auth status once on mount
  useEffect(() => {
    api.getAuthStatus().then((status) => {
      setAuthRequired(status.required);
      setAuthenticated(status.authenticated ?? !status.required);
      setAuthChecked(true);
    }).catch(() => {
      // If auth check fails, assume no auth required so local users aren't locked out
      setAuthRequired(false);
      setAuthenticated(true);
      setAuthChecked(true);
    });
  }, []);

  // Listen for auth:required socket event
  useEffect(() => {
    const handleAuthRequired = (payload: { required: boolean }) => {
      setAuthRequired(payload.required);
      if (!payload.required) {
        // Tunnel stopped — clear auth
        setAuthenticated(true);
        setToken(null);
      }
      // When required becomes true, do NOT force authenticated=false.
      // Local user is already authenticated=true; remote user is already false.
    };
    socket.on('auth:required', handleAuthRequired);
    return () => { socket.off('auth:required', handleAuthRequired); };
  }, [socket]);

  // Listen for auth:authenticated (dispatched by startNgrok after storing token)
  useEffect(() => {
    const handler = () => {
      setAuthenticated(true);
      reconnectSocket();
    };
    window.addEventListener('auth:authenticated', handler);
    return () => window.removeEventListener('auth:authenticated', handler);
  }, []);

  // Listen for 401 from API calls
  useEffect(() => {
    const handler = () => setAuthenticated(false);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  if (!authChecked) return null;

  if (authRequired && !authenticated) {
    return (
      <PasswordGate onAuthenticated={() => {
        setAuthenticated(true);
        reconnectSocket();
      }} />
    );
  }

  return <AppInner />;
}

const BUILTIN_AGENTS = [
  { id: 'claude', name: 'Claude', command: 'claude', builtin: true as const },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', builtin: true as const },
  { id: 'codex', name: 'Codex', command: 'codex', builtin: true as const },
];

function AppInner() {
  const { theme, isDark, toggle: toggleTheme } = useTheme();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickedFolder, setPickedFolder] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [diffStates, setDiffStates] = useState<Map<string, DiffState>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNgrokModal, setShowNgrokModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [cloneModalState, setCloneModalState] = useState<{ folderPath: string; agentType?: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('sessions');
  const socket = useSocket();
  const socketConnected = useSocketStatus();
  const { sessions, createSession, deleteSession } = useSessions(socket);
  const ngrok = useNgrok(socket);
  const { config, updateConfig } = useConfig();
  const { getOrderedSessions, reorder } = useSessionOrder();

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const triggerRefit = useCallback(() => {
    for (const delay of [50, 150, 350]) {
      setTimeout(() => window.dispatchEvent(new Event('terminal:refit')), delay);
    }
  }, []);

  const getDiffState = useCallback(
    (sessionId: string): DiffState => diffStates.get(sessionId) || { isOpen: false, isFullscreen: false },
    [diffStates],
  );

  const setDiffState = useCallback((sessionId: string, update: Partial<DiffState>) => {
    setDiffStates((prev) => {
      const next = new Map(prev);
      const current = next.get(sessionId) || { isOpen: false, isFullscreen: false };
      next.set(sessionId, { ...current, ...update });
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
    triggerRefit();
  }, [triggerRefit]);

  // Escape key priority: diff fullscreen → diff close → exit focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (focusedSessionId) {
        const ds = getDiffState(focusedSessionId);
        if (ds.isOpen && ds.isFullscreen) {
          setDiffState(focusedSessionId, { isFullscreen: false });
          triggerRefit();
          return;
        }
        if (ds.isOpen) {
          setDiffState(focusedSessionId, { isOpen: false, isFullscreen: false });
          triggerRefit();
          return;
        }
        setFocusedSessionId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedSessionId, getDiffState, setDiffState, triggerRefit]);

  const handleNewSession = useCallback(async () => {
    const path = await api.pickFolder();
    if (path) {
      setPickedFolder(path);
      setShowCreateModal(true);
    }
  }, []);

  const handleCreate = async (folderPath: string, name?: string, agentType?: string) => {
    await createSession(folderPath, name, agentType);
  };

  const handleClone = useCallback((folderPath: string, agentType?: string) => {
    setCloneModalState({ folderPath, agentType });
  }, []);

  const handleCloneConfirm = async (folderPath: string, agentType: string) => {
    await createSession(folderPath, undefined, agentType);
  };

  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleRestart = useCallback(async (id: string) => {
    await api.restartSession(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!pendingDeleteId) return;
    if (focusedSessionId === pendingDeleteId) {
      setFocusedSessionId(null);
    }
    await deleteSession(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, focusedSessionId, deleteSession]);

  const handleFocus = useCallback((id: string) => {
    setFocusedSessionId(id);
  }, []);

  const handleUnfocus = useCallback(() => {
    setFocusedSessionId(null);
  }, []);

  const handleToggleDiff = useCallback(
    (sessionId: string) => {
      // On mobile, navigate to the git-diff tab rather than splitting the card
      if (window.innerWidth < 768) {
        setFocusedSessionId(sessionId);
        setActiveTab('git-diff');
        return;
      }
      const ds = getDiffState(sessionId);
      if (ds.isOpen) {
        setDiffState(sessionId, { isOpen: false, isFullscreen: false });
      } else {
        if (focusedSessionId !== sessionId) {
          setFocusedSessionId(sessionId);
        }
        setDiffState(sessionId, { isOpen: true, isFullscreen: false });
      }
      triggerRefit();
    },
    [focusedSessionId, getDiffState, setDiffState, triggerRefit],
  );

  const handleToggleDiffFullscreen = useCallback(
    (sessionId: string) => {
      const ds = getDiffState(sessionId);
      setDiffState(sessionId, { isFullscreen: !ds.isFullscreen });
      triggerRefit();
    },
    [getDiffState, setDiffState, triggerRefit],
  );

  const handleCloseDiff = useCallback(
    (sessionId: string) => {
      setDiffState(sessionId, { isOpen: false, isFullscreen: false });
      triggerRefit();
    },
    [setDiffState, triggerRefit],
  );

  const orderedSessions = getOrderedSessions(sessions);
  const isStyleguide = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('styleguide');

  const ngrokBorderColor = ngrok.status?.tunnelStatus === 'connected'
    ? 'var(--color-success)'
    : 'var(--color-border-subtle)';
  const ngrokColor = ngrok.status?.tunnelStatus === 'connected'
    ? 'var(--color-success)'
    : 'var(--color-text-secondary)';

  if (isStyleguide) {
    return (
      <div style={{ height: '100vh', background: 'var(--color-bg-base)', overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: 'var(--header-height)',
          padding: '0 var(--space-4)',
          background: 'var(--color-bg-header)',
          borderBottom: '1px solid var(--color-border-base)',
          gap: 'var(--space-3)',
        }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Code Orchestrator
          </span>
          <span style={{
            fontSize: 'var(--text-sm)',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 500,
          }}>
            Design System
          </span>
        </div>
        <div style={{ height: 'calc(100vh - var(--header-height))', overflowY: 'auto' }}>
          <Styleguide />
        </div>
      </div>
    );
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 'var(--header-height)',
          padding: '0 var(--space-4)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'var(--color-bg-header)',
          borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Code Orchestrator
          </span>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-base)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* Settings — hidden on mobile (moved to bottom nav) */}
          <span className="header-settings-btn">
            <HeaderButton onClick={() => setShowSettingsModal(true)} title="Settings">
              {'\u2699'}
            </HeaderButton>
          </span>

          {/* Fullscreen — hidden on mobile (Fullscreen API unsupported on iOS) */}
          <span className="header-fullscreen-btn">
            <HeaderButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
              {isFullscreen ? '\u2716' : '\u26F6'}
            </HeaderButton>
          </span>

          {/* Remote access */}
          <HeaderButton
            onClick={() => setShowNgrokModal(true)}
            title={ngrok.status?.tunnelStatus === 'connected' ? `Remote: ${ngrok.status.publicUrl}` : 'Remote Access'}
            style={{ position: 'relative', borderColor: ngrokBorderColor, color: ngrokColor }}
          >
            {'\uD83C\uDF10'}
            {ngrok.status?.tunnelStatus === 'connected' && (
              <span style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--color-success)',
                border: '2px solid var(--color-bg-header)',
              }} />
            )}
          </HeaderButton>

          {/* Theme toggle */}
          <HeaderButton onClick={toggleTheme} title="Toggle theme">
            {isDark ? '\u2600' : '\u263E'}
          </HeaderButton>

          {/* New Session */}
          <button
            onClick={handleNewSession}
            style={{
              padding: '0 14px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 'var(--text-md)',
              border: '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #aec6ff 0%, #7aa2f7 100%)',
              color: '#002e6b',
              cursor: 'pointer',
              fontWeight: 600,
              gap: '6px',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            + New Session
          </button>
        </div>
      </header>

      {!socketConnected && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '6px 16px',
          background: 'var(--color-warning-subtle, rgba(255,180,0,0.12))',
          borderBottom: '1px solid var(--color-warning, #f0a500)',
          color: 'var(--color-warning, #f0a500)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          flexShrink: 0,
        }}>
          <WifiOff size={13} strokeWidth={2} />
          Connection lost — reconnecting…
        </div>
      )}

      <NavTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sessionCount={sessions.length}
      />

      {activeTab === 'sessions' && (
        <ErrorBoundary variant="tab" label="Sessions">
          <Dashboard
            sessions={orderedSessions}
            socket={socket}
            theme={theme}
            onDeleteSession={handleDelete}
            onRestartSession={handleRestart}
            onCreateSession={handleNewSession}
            onCloneSession={handleClone}
            onReorder={reorder}
            focusedSessionId={focusedSessionId}
            onFocusSession={handleFocus}
            onUnfocusSession={handleUnfocus}
            getDiffState={getDiffState}
            onToggleDiff={handleToggleDiff}
            onToggleDiffFullscreen={handleToggleDiffFullscreen}
            onCloseDiff={handleCloseDiff}
          />
        </ErrorBoundary>
      )}
      {activeTab === 'git-diff' && sessions.length > 0 && (
        <ErrorBoundary variant="tab" label="Git Diff">
          <GlobalGitDiffView
            sessionId={focusedSessionId ?? sessions[0].id}
            sessionStatus={sessions.find(s => s.id === (focusedSessionId ?? sessions[0].id))?.status ?? 'idle'}
            theme={theme}
            sessions={sessions}
            currentSessionId={focusedSessionId ?? sessions[0].id}
            onSelectSession={setFocusedSessionId}
          />
        </ErrorBoundary>
      )}
      {activeTab === 'git-diff' && sessions.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: `calc(100vh - var(--header-height) - var(--nav-tabs-height))`,
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-md)',
        }}>
          No sessions — create a session to view git diff
        </div>
      )}
      {activeTab === 'explorer' && (
        <ErrorBoundary variant="tab" label="Explorer">
          <ExplorerPanel sessions={orderedSessions} theme={theme} />
        </ErrorBoundary>
      )}

      {showCreateModal && (
        <CreateSessionModal
          onClose={() => {
            setShowCreateModal(false);
            setPickedFolder(null);
          }}
          onCreate={handleCreate}
          theme={theme}
          initialFolderPath={pickedFolder}
          defaultAgentType={config?.defaultAgent}
          agents={config ? [...BUILTIN_AGENTS, ...config.customAgents] : []}
        />
      )}

      {cloneModalState && (
        <CloneSessionModal
          folderPath={cloneModalState.folderPath}
          currentAgentType={cloneModalState.agentType}
          defaultAgentType={config?.defaultAgent}
          agents={config ? [...BUILTIN_AGENTS, ...config.customAgents] : []}
          theme={theme}
          onClone={handleCloneConfirm}
          onClose={() => setCloneModalState(null)}
        />
      )}

      {showSettingsModal && config && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettingsModal(false)}
          onSave={updateConfig}
          theme={theme}
        />
      )}

      {showNgrokModal && (
        <NgrokModal
          onClose={() => setShowNgrokModal(false)}
          theme={theme}
          status={ngrok.status}
          loading={ngrok.loading}
          error={ngrok.error}
          onStart={ngrok.startTunnel}
          onStop={ngrok.stopTunnel}
          onRecheck={ngrok.recheckInstallation}
        />
      )}

      {/* Confirm delete dialog */}
      {pendingDeleteId && (
        <div
          onClick={() => setPendingDeleteId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal-top)' as unknown as number,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-modal)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6)',
              width: '360px',
              maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              border: '1px solid var(--color-border-base)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Close Session?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--text-md)', color: 'var(--color-text-secondary)' }}>
              The Claude process will be terminated.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingDeleteId(null)}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-md)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-surface)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-md)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-error)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'opacity var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Close Session
              </button>
            </div>
          </div>
        </div>
      )}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewSession={handleNewSession}
        onSettings={() => setShowSettingsModal(true)}
      />
    </>
  );
}

/** Full-width git diff view for the Git Diff tab. */
function GlobalGitDiffView({
  sessionId,
  sessionStatus,
  theme,
  sessions,
  currentSessionId,
  onSelectSession,
}: {
  sessionId: string;
  sessionStatus: string;
  theme: 'dark' | 'light';
  sessions: SessionInfo[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
}) {
  const { diff, isLoading, error, refresh } = useGitDiff({
    sessionId,
    isOpen: true,
    sessionStatus: sessionStatus as 'running' | 'waiting' | 'idle' | 'exited',
  });

  return (
    <div style={{ height: `calc(100vh - var(--header-height) - var(--nav-tabs-height))`, display: 'flex' }}>
      <GitDiffPanel
        diff={diff}
        theme={theme}
        isLoading={isLoading}
        error={error}
        isFullscreen={false}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
        onClose={() => {}}
        onToggleFullscreen={() => {}}
        onRefresh={refresh}
        showHeaderControls={false}
      />
    </div>
  );
}

/** Small icon button used in the app header. */
function HeaderButton({
  onClick,
  title,
  children,
  style,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 'var(--text-md)',
        color: 'var(--color-text-secondary)',
        transition: 'background var(--transition-fast)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-surface)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      {children}
    </button>
  );
}
