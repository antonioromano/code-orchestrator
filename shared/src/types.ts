export type SessionStatus = 'waiting' | 'running' | 'idle' | 'exited';

export interface SessionInfo {
  id: string;
  name: string;
  folderPath: string;
  status: SessionStatus;
  createdAt: string;
}

export interface CreateSessionRequest {
  folderPath: string;
  name?: string;
}

export interface CreateSessionResponse extends SessionInfo {}

export interface PathCompletionResponse {
  completions: string[];
}

// Socket.io typed events
export interface ClientToServerEvents {
  'session:join': (sessionId: string) => void;
  'session:leave': (sessionId: string) => void;
  'session:input': (payload: { sessionId: string; data: string }) => void;
  'session:resize': (payload: { sessionId: string; cols: number; rows: number }) => void;
}

export interface ServerToClientEvents {
  'session:output': (payload: { sessionId: string; data: string }) => void;
  'session:status': (payload: { sessionId: string; status: SessionStatus }) => void;
  'session:exit': (payload: { sessionId: string; exitCode: number }) => void;
  'session:created': (session: SessionInfo) => void;
  'session:deleted': (payload: { sessionId: string }) => void;
}

export interface GitDiffResponse {
  unstaged: string;
  staged: string;
  branch: string;
  error?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasChildren: boolean;
}

export interface DirectoryChildrenResponse {
  entries: DirectoryEntry[];
  parentPath: string;
}
