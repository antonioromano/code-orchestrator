import { useMemo } from 'react';
import type { SessionInfo } from '@remote-orchestrator/shared';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TerminalPanel } from './TerminalPanel.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SessionGroupProps {
  folderPath: string;
  sessions: SessionInfo[];
  socket: TypedSocket;
  theme: 'dark' | 'light';
  onDeleteSession: (id: string) => void;
  onCloneSession: (folderPath: string) => void;
  onFocusSession?: (id: string) => void;
  onToggleDiff?: (id: string) => void;
}

export function SessionGroup({
  folderPath,
  sessions,
  socket,
  theme,
  onDeleteSession,
  onCloneSession,
  onFocusSession,
  onToggleDiff,
}: SessionGroupProps) {
  const isDark = theme === 'dark';
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `group::${folderPath}`,
  });

  const sessionSortableIds = useMemo(
    () => sessions.map((s) => `session::${s.id}`),
    [sessions],
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeft: `3px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
        borderRadius: '8px',
        padding: '8px',
        background: isDark ? '#1e1f2e' : '#efefef',
        overflow: 'hidden',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          marginBottom: '4px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              fontSize: '14px',
              color: isDark ? '#565f89' : '#8b8fa3',
              flexShrink: 0,
              userSelect: 'none',
            }}
            title="Drag to reorder group"
          >
            {'\u2807'}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'Menlo, Monaco, monospace',
              color: isDark ? '#a9b1d6' : '#565c73',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folderPath}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: isDark ? '#565f89' : '#8b8fa3',
              background: isDark ? '#1a1b26' : '#e0e0e0',
              padding: '1px 6px',
              borderRadius: '8px',
              flexShrink: 0,
            }}
          >
            {sessions.length}
          </span>
        </div>
        <button
          onClick={() => onCloneSession(folderPath)}
          style={{
            background: 'none',
            border: 'none',
            color: isDark ? '#565f89' : '#8b8fa3',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="New session in this folder"
        >
          +
        </button>
      </div>
      <SortableContext items={sessionSortableIds} strategy={rectSortingStrategy}>
        <div
          style={{
            display: 'grid',
            gap: '8px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))',
            gridAutoRows: '1fr',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {sessions.map((session) => (
            <TerminalPanel
              key={session.id}
              session={session}
              socket={socket}
              theme={theme}
              onDelete={onDeleteSession}
              onFocus={onFocusSession}
              onToggleDiff={onToggleDiff}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
