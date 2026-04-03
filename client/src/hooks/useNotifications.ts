import { useEffect, useRef } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';

interface UseNotificationsOptions {
  sessions: SessionInfo[];
  enabled: boolean;
  onFocusSession: (id: string) => void;
  onSwitchToSessionsTab: () => void;
}

export function useNotifications({
  sessions,
  enabled,
  onFocusSession,
  onSwitchToSessionsTab,
}: UseNotificationsOptions) {
  const activeNotifs = useRef<Map<string, Notification>>(new Map());
  const prevStatuses = useRef<Map<string, string>>(new Map());
  // Track sessions that need a notification but haven't shown one yet (transitioned while focused)
  const pendingNotifs = useRef<Set<string>>(new Set());
  const sessionsRef = useRef(sessions);
  const onFocusRef = useRef(onFocusSession);
  const onSwitchRef = useRef(onSwitchToSessionsTab);

  useEffect(() => {
    sessionsRef.current = sessions;
    onFocusRef.current = onFocusSession;
    onSwitchRef.current = onSwitchToSessionsTab;
  }, [sessions, onFocusSession, onSwitchToSessionsTab]);

  const fireNotification = (session: SessionInfo) => {
    if (activeNotifs.current.has(session.id)) return;

    const folderName = session.folderPath.split('/').pop() || session.folderPath;
    const notif = new Notification(session.name, {
      body: folderName,
      tag: `session-${session.id}`,
    });

    notif.onclick = () => {
      window.focus();
      onSwitchRef.current();
      onFocusRef.current(session.id);
      notif.close();
      activeNotifs.current.delete(session.id);
    };

    activeNotifs.current.set(session.id, notif);
    pendingNotifs.current.delete(session.id);
  };

  // Fire notifications on status transitions
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') {
      for (const session of sessions) {
        prevStatuses.current.set(session.id, session.status);
      }
      return;
    }

    for (const session of sessions) {
      const prev = prevStatuses.current.get(session.id);
      const curr = session.status;

      // Transition TO waiting
      if (curr === 'waiting' && prev !== 'waiting' && prev !== undefined) {
        if (!document.hasFocus()) {
          fireNotification(session);
        } else {
          // Mark as pending — will fire once when user switches away
          pendingNotifs.current.add(session.id);
        }
      }

      // Transition AWAY from waiting — clean up everything
      if (curr !== 'waiting' && prev === 'waiting') {
        pendingNotifs.current.delete(session.id);
        const existing = activeNotifs.current.get(session.id);
        if (existing) {
          existing.close();
          activeNotifs.current.delete(session.id);
        }
      }

      prevStatuses.current.set(session.id, curr);
    }

    // Close notifications for deleted sessions
    const currentIds = new Set(sessions.map((s) => s.id));
    for (const [id, notif] of activeNotifs.current) {
      if (!currentIds.has(id)) {
        notif.close();
        activeNotifs.current.delete(id);
        prevStatuses.current.delete(id);
        pendingNotifs.current.delete(id);
      }
    }
  }, [sessions, enabled]);

  // Fire pending notifications once when user switches away
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;

    const handleBlur = () => {
      if (pendingNotifs.current.size === 0) return;
      for (const session of sessionsRef.current) {
        if (pendingNotifs.current.has(session.id) && session.status === 'waiting') {
          fireNotification(session);
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    const notifs = activeNotifs.current;
    return () => {
      notifs.forEach((n) => n.close());
      notifs.clear();
    };
  }, []);
}
