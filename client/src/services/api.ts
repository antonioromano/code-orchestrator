import type { SessionInfo, CreateSessionRequest, PathCompletionResponse, DirectoryChildrenResponse, GitDiffResponse } from '@remote-orchestrator/shared';

const API_BASE = '/api';

export const api = {
  getSessions: async (): Promise<SessionInfo[]> => {
    const res = await fetch(`${API_BASE}/sessions`);
    return res.json();
  },

  createSession: async (data: CreateSessionRequest): Promise<SessionInfo> => {
    const res = await fetch(`${API_BASE}/sessions`, {
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
    await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
  },

  getPathCompletions: async (path: string): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/fs/autocomplete?path=${encodeURIComponent(path)}`);
    const data: PathCompletionResponse = await res.json();
    return data.completions;
  },

  pickFolder: async (): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/fs/pick-folder`, { method: 'POST' });
    const data = await res.json();
    return data.path;
  },

  getDirectoryChildren: async (dirPath?: string): Promise<DirectoryChildrenResponse> => {
    const url = dirPath
      ? `${API_BASE}/fs/children?path=${encodeURIComponent(dirPath)}`
      : `${API_BASE}/fs/children`;
    const res = await fetch(url);
    return res.json();
  },

  getSessionOrder: async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/sessions/order`);
    const data = await res.json();
    return data.order;
  },

  saveSessionOrder: async (order: string[]): Promise<void> => {
    await fetch(`${API_BASE}/sessions/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  },

  getSessionDiff: async (sessionId: string): Promise<GitDiffResponse> => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/diff`);
    return res.json();
  },
};
