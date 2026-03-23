import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useSessions } from './hooks/useSessions.js';
import { useSessionOrder } from './hooks/useSessionOrder.js';
import { Dashboard } from './components/Dashboard.js';
import { CreateSessionModal } from './components/CreateSessionModal.js';
import { api } from './services/api.js';

type Theme = 'dark' | 'light';

interface DiffState {
  isOpen: boolean;
  isFullscreen: boolean;
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickedFolder, setPickedFolder] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [diffStates, setDiffStates] = useState<Map<string, DiffState>>(new Map());
  const socket = useSocket();
  const { sessions, createSession, deleteSession } = useSessions(socket);
  const { getOrderedSessions, reorder } = useSessionOrder();

  const isDark = theme === 'dark';

  useEffect(() => {
    document.body.style.background = isDark ? '#1a1b26' : '#f5f5f5';
    document.body.style.color = isDark ? '#c0caf5' : '#343b58';
    document.body.style.margin = '0';
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }, [isDark]);

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

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  const handleNewSession = useCallback(async () => {
    const path = await api.pickFolder();
    if (path) {
      setPickedFolder(path);
      setShowCreateModal(true);
    }
  }, []);

  const handleCreate = async (folderPath: string, name?: string) => {
    await createSession(folderPath, name);
  };

  const handleClone = useCallback(
    async (folderPath: string) => {
      await createSession(folderPath);
    },
    [createSession],
  );

  const handleDelete = async (id: string) => {
    if (window.confirm('Close this session? The Claude process will be terminated.')) {
      if (focusedSessionId === id) {
        setFocusedSessionId(null);
      }
      await deleteSession(id);
    }
  };

  const handleFocus = useCallback((id: string) => {
    setFocusedSessionId(id);
  }, []);

  const handleUnfocus = useCallback(() => {
    setFocusedSessionId(null);
  }, []);

  const handleToggleDiff = useCallback(
    (sessionId: string) => {
      const ds = getDiffState(sessionId);
      if (ds.isOpen) {
        setDiffState(sessionId, { isOpen: false, isFullscreen: false });
      } else {
        // In grid view, auto-focus first then open diff
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

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '52px',
          padding: '0 16px',
          background: isDark ? '#16161e' : '#e8e8e8',
          borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700 }}>Remote Orchestrator</span>
          <span
            style={{
              fontSize: '12px',
              color: isDark ? '#565f89' : '#8b8fa3',
              background: isDark ? '#1a1b26' : '#f0f0f0',
              padding: '2px 8px',
              borderRadius: '10px',
            }}
          >
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleTheme}
            style={{
              background: 'none',
              border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '14px',
              color: isDark ? '#a9b1d6' : '#565c73',
            }}
            title="Toggle theme"
          >
            {isDark ? '\u2600' : '\u263E'}
          </button>
          <button
            onClick={handleNewSession}
            style={{
              padding: '6px 14px',
              fontSize: '14px',
              border: 'none',
              borderRadius: '6px',
              background: '#7aa2f7',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            + New Session
          </button>
        </div>
      </header>

      <Dashboard
        sessions={orderedSessions}
        socket={socket}
        theme={theme}
        onDeleteSession={handleDelete}
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

      {showCreateModal && (
        <CreateSessionModal
          onClose={() => {
            setShowCreateModal(false);
            setPickedFolder(null);
          }}
          onCreate={handleCreate}
          theme={theme}
          initialFolderPath={pickedFolder}
        />
      )}
    </>
  );
}
