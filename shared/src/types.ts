export type SessionStatus = 'waiting' | 'running' | 'idle' | 'exited';

export type BuiltinAgentId = 'claude' | 'gemini' | 'codex';
export type AgentType = BuiltinAgentId | string;

export interface AgentDefinition {
  id: string;
  name: string;
  command: string;
  builtin: boolean;
  installCommand?: string;
  installUrl?: string;
}

export interface AgentFlag {
  id: string;        // crypto.randomUUID()
  value: string;     // e.g. "--model opus-4", "--verbose"
  enabled: boolean;  // sticky default (last-used state per agent)
}

export interface AppConfig {
  defaultAgent: AgentType;
  customAgents: AgentDefinition[];
  agentFlags: Record<string, AgentFlag[]>;  // keyed by agent ID
}

export interface AgentStatus {
  agent: AgentDefinition;
  installed: boolean;
  resolvedPath?: string;
}

export interface AgentDetectionResponse {
  agents: AgentStatus[];
}

export interface SessionInfo {
  id: string;
  name: string;
  folderPath: string;
  status: SessionStatus;
  createdAt: string;
  agentType: AgentType;
  flags: string[];  // flags this session was created with
}

export interface CreateSessionRequest {
  folderPath: string;
  name?: string;
  agentType?: AgentType;
  flags?: string[];  // resolved flag value strings to append to command
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
  'ngrok:status': (status: NgrokStatus) => void;
  'auth:required': (payload: { required: boolean }) => void;
  'update:available': (status: UpdateStatus) => void;
  'update:applying': () => void;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  changelog: string;
  releaseUrl: string;
}

export interface UpdateApplyResponse {
  success: boolean;
  error?: string;
}

export type NgrokTunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface NgrokStatus {
  installed: boolean;
  tunnelStatus: NgrokTunnelStatus;
  publicUrl: string | null;
  error: string | null;
  platform: string;
  authRequired: boolean;
}

export interface NgrokStartResponse {
  publicUrl: string;
  token: string;
}

export interface AuthStatus {
  required: boolean;
  authenticated?: boolean;
}

export interface AuthLoginResponse {
  token: string;
}

export interface GitDiffResponse {
  unstaged: string;
  staged: string;
  branch: string;
  untracked: string[];
  error?: string;
}

// Selective commit types

export interface ChunkSelection {
  chunkIndex: number;
  selectedChangeIndices: number[]; // 0-based indices into add/del changes only
}

export interface PatchSelectionRequest {
  filePath: string;     // file.to ?? file.from from parse-diff output
  fromPath?: string;    // for renames: file.from
  source: 'unstaged' | 'staged';
  chunks: ChunkSelection[];
}

export interface PatchOperationResponse {
  success: boolean;
  error?: string;    // raw git stderr on failure
  undoId?: string;   // UUID for the discard undo buffer (discard ops only)
}

export interface CommitRequest {
  message: string;
  amend: boolean;
}

export interface CommitResponse {
  success: boolean;
  error?: string;
  commitHash?: string; // short SHA on success
}

export interface GitLogResponse {
  lastMessage: string;
  isFirstCommit: boolean;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasChildren: boolean;
  isFile: boolean;
  ext: string;
  size?: number;
}

export interface DirectoryChildrenResponse {
  entries: DirectoryEntry[];
  parentPath: string;
}

export interface FileContentResponse {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
  truncated: boolean;
  mtimeMs: number;
}

export interface WriteFileRequest {
  sessionId: string;
  path: string;
  content: string;
  originalMtimeMs?: number;
}

export interface WriteFileResponse {
  success: boolean;
  size: number;
  mtimeMs: number;
  error?: string;
  conflict?: boolean;
}

export interface FileSearchResult {
  path: string;
  name: string;
  ext: string;
  matchType: 'filename' | 'content';
}

export interface FileSearchResponse {
  results: FileSearchResult[];
  query: string;
}
