import type { SessionInfo, CreateSessionRequest, PathCompletionResponse, DirectoryChildrenResponse, FileContentResponse, FileSearchResponse, GitDiffResponse, NgrokStatus, NgrokStartResponse, AppConfig, AgentDetectionResponse, AuthStatus, AuthLoginResponse, UpdateStatus, UpdateApplyResponse, PatchSelectionRequest, PatchOperationResponse, CommitRequest, CommitResponse, GitLogResponse, WriteFileRequest, WriteFileResponse } from '@remote-orchestrator/shared';

const API_BASE = '/api';
const TOKEN_KEY = 'orchestrator_auth_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Authentication required');
  }
  return res;
}

export const api = {
  getSessions: async (): Promise<SessionInfo[]> => {
    const res = await authFetch(`${API_BASE}/sessions`);
    return res.json();
  },

  createSession: async (data: CreateSessionRequest): Promise<SessionInfo> => {
    const res = await authFetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create session');
    }
    return res.json();
  },

  deleteSession: async (id: string): Promise<void> => {
    await authFetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
  },

  restartSession: async (id: string): Promise<SessionInfo> => {
    const res = await authFetch(`${API_BASE}/sessions/${id}/restart`, { method: 'PATCH' });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Failed to restart session');
    }
    return res.json();
  },

  getPathCompletions: async (path: string): Promise<string[]> => {
    const res = await authFetch(`${API_BASE}/fs/autocomplete?path=${encodeURIComponent(path)}`);
    const data: PathCompletionResponse = await res.json();
    return data.completions;
  },

  pickFolder: async (): Promise<string | null> => {
    const res = await authFetch(`${API_BASE}/fs/pick-folder`, { method: 'POST' });
    const data = await res.json();
    return data.path;
  },

  getDirectoryChildren: async (dirPath?: string, includeFiles = false): Promise<DirectoryChildrenResponse> => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    if (includeFiles) params.set('includeFiles', 'true');
    const res = await authFetch(`${API_BASE}/fs/children?${params}`);
    return res.json();
  },

  searchFiles: async (rootPath: string, query: string): Promise<FileSearchResponse> => {
    const params = new URLSearchParams({ path: rootPath, q: query });
    const res = await authFetch(`${API_BASE}/fs/search?${params}`);
    return res.json();
  },

  getFileContent: async (filePath: string): Promise<FileContentResponse> => {
    const res = await authFetch(`${API_BASE}/fs/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error);
    }
    return res.json();
  },

  writeFile: async (data: WriteFileRequest): Promise<WriteFileResponse> => {
    const res = await authFetch(`${API_BASE}/fs/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getSessionOrder: async (): Promise<string[]> => {
    const res = await authFetch(`${API_BASE}/sessions/order`);
    const data = await res.json();
    return data.order;
  },

  saveSessionOrder: async (order: string[]): Promise<void> => {
    await authFetch(`${API_BASE}/sessions/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  },

  getSessionDiff: async (sessionId: string): Promise<GitDiffResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/diff`);
    return res.json();
  },

  stagePatch: async (sessionId: string, selection: PatchSelectionRequest): Promise<PatchOperationResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-stage-patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    return res.json();
  },

  discardPatch: async (sessionId: string, selection: PatchSelectionRequest): Promise<PatchOperationResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-discard-patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    return res.json();
  },

  undoDiscard: async (sessionId: string, undoId: string): Promise<PatchOperationResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-undo-discard/${undoId}`, {
      method: 'POST',
    });
    return res.json();
  },

  gitCommit: async (sessionId: string, data: CommitRequest): Promise<CommitResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  gitUnstage: async (sessionId: string, filePath: string): Promise<PatchOperationResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-unstage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    return res.json();
  },

  getGitLog: async (sessionId: string): Promise<GitLogResponse> => {
    const res = await authFetch(`${API_BASE}/sessions/${sessionId}/git-log`);
    return res.json();
  },

  getNgrokStatus: async (): Promise<NgrokStatus> => {
    const res = await fetch(`${API_BASE}/ngrok/status`);
    return res.json();
  },

  startNgrok: async (port: number = 5173, password?: string): Promise<NgrokStartResponse> => {
    const res = await authFetch(`${API_BASE}/ngrok/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, password }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Failed to start ngrok');
    }
    const data: NgrokStartResponse = await res.json();
    setToken(data.token);
    window.dispatchEvent(new CustomEvent('auth:authenticated'));
    return data;
  },

  stopNgrok: async (): Promise<void> => {
    const res = await authFetch(`${API_BASE}/ngrok/stop`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Failed to stop ngrok');
    }
  },

  recheckNgrok: async (): Promise<NgrokStatus> => {
    const res = await authFetch(`${API_BASE}/ngrok/recheck`, { method: 'POST' });
    return res.json();
  },

  getConfig: async (): Promise<AppConfig> => {
    const res = await authFetch(`${API_BASE}/config`);
    return res.json();
  },

  updateConfig: async (data: Partial<AppConfig>): Promise<AppConfig> => {
    const res = await authFetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  detectAgents: async (): Promise<AgentDetectionResponse> => {
    const res = await authFetch(`${API_BASE}/agents/detect`);
    return res.json();
  },

  getAuthStatus: async (): Promise<AuthStatus> => {
    const res = await fetch(`${API_BASE}/auth/status`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    return res.json();
  },

  login: async (password: string): Promise<AuthLoginResponse> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },

  checkUpdate: async (): Promise<UpdateStatus> => {
    const res = await authFetch(`${API_BASE}/update/check`);
    return res.json();
  },

  applyUpdate: async (): Promise<UpdateApplyResponse> => {
    const res = await authFetch(`${API_BASE}/update/apply`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Failed to apply update');
    }
    return res.json();
  },
};
