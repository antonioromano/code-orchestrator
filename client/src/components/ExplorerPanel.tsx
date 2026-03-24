import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, FileText, File, FileCode, FileJson, RefreshCw, Copy, Check, Search, Link } from 'lucide-react';
import type { SessionInfo, FileContentResponse, FileSearchResult } from '@remote-orchestrator/shared';
import { ExplorerFolderTree } from './ExplorerFolderTree.js';
import { SessionSidebar } from './SessionSidebar.js';
import { Tooltip } from './primitives/Tooltip.js';
import { api } from '../services/api.js';

const NARROW_BREAKPOINT = 520;

interface ExplorerPanelProps {
  sessions: SessionInfo[];
  theme: 'dark' | 'light';
}

function FileIcon({ ext }: { ext: string }) {
  const style = { width: 14, height: 14, flexShrink: 0 as const, color: 'var(--color-text-muted)' };
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') return <FileCode style={style} />;
  if (ext === '.json') return <FileJson style={style} />;
  return <FileText style={style} />;
}

interface SearchResultsListProps {
  results: FileSearchResult[] | null;
  isSearching: boolean;
  selectedFilePath: string | null;
  rootPath: string;
  onSelect: (filePath: string, ext: string) => void;
  onDoubleClick?: (filePath: string) => void;
}

function SearchResultsList({ results, isSearching, selectedFilePath, rootPath, onSelect, onDoubleClick }: SearchResultsListProps) {
  if (isSearching) {
    return (
      <div style={{ padding: '8px 4px' }}>
        {[80, 60, 90, 50, 70].map((w, i) => (
          <div key={i} style={{
            height: '28px',
            margin: '2px 0',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            width: `${w}%`,
            opacity: 0.5,
          }} />
        ))}
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '8px',
        color: 'var(--color-text-muted)',
        padding: '24px 16px',
      }}>
        <Search size={24} strokeWidth={1} />
        <span style={{ fontSize: 'var(--text-sm)' }}>
          {results === null ? '' : 'No files found'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {results.map((result) => {
        const isSelected = selectedFilePath === result.path;
        const relativePath = result.path.startsWith(rootPath)
          ? result.path.slice(rootPath.length + 1)
          : result.path;
        const dir = relativePath.includes('/')
          ? relativePath.slice(0, relativePath.lastIndexOf('/'))
          : '';

        return (
          <div
            key={result.path}
            onClick={() => onSelect(result.path, result.ext)}
            onDoubleClick={() => onDoubleClick?.(result.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              cursor: 'pointer',
              background: isSelected ? 'var(--color-surface-bright, var(--color-bg-elevated))' : 'transparent',
              borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
              transition: 'background var(--transition-fast)',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-elevated)';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'transparent';
            }}
          >
            <FileIcon ext={result.ext} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {result.name}
              </div>
              {dir && (
                <div style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {dir}
                </div>
              )}
            </div>
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              color: result.matchType === 'filename' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              background: result.matchType === 'filename' ? 'var(--color-accent-subtle)' : 'var(--color-bg-elevated)',
              padding: '1px 4px',
              borderRadius: 'var(--radius-sm)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {result.matchType === 'filename' ? 'name' : 'content'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ExplorerPanel({ sessions }: ExplorerPanelProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContentResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const fetchIdRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isTreeVisible, setIsTreeVisible] = useState(true);

  // Detect container width to switch between wide and narrow layouts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setIsNarrow(entries[0].contentRect.width < NARROW_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-select first session when sessions change or component mounts
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !sessions.find(s => s.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Debounced file search
  useEffect(() => {
    const selectedSession = sessions.find(s => s.id === selectedSessionId);
    if (!searchQuery.trim() || !selectedSession?.folderPath) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await api.searchFiles(selectedSession.folderPath, searchQuery.trim());
        setSearchResults(resp.results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedSessionId, sessions]);

  const handleSessionSelect = useCallback((id: string) => {
    setSelectedSessionId(id);
    setSelectedFilePath(null);
    setFileContent(null);
    setFileError(null);
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const handleFileSelect = useCallback(async (filePath: string, _ext: string) => {
    const id = ++fetchIdRef.current;
    setSelectedFilePath(filePath);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);
    if (isNarrow) setIsTreeVisible(false);
    try {
      const content = await api.getFileContent(filePath);
      if (fetchIdRef.current === id) setFileContent(content);
    } catch (err) {
      if (fetchIdRef.current === id) {
        setFileError(err instanceof Error ? err.message : 'Failed to load file');
      }
    } finally {
      if (fetchIdRef.current === id) setFileLoading(false);
    }
  }, [isNarrow]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const handleCopy = useCallback(() => {
    if (!fileContent) return;
    navigator.clipboard.writeText(fileContent.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Content copied');
    });
  }, [fileContent, showToast]);

  const handleFileDoubleClick = useCallback((filePath: string) => {
    navigator.clipboard.writeText(filePath).then(() => showToast('File path copied'));
  }, [showToast]);

  const handleCopyFilePath = useCallback(() => {
    if (!selectedFilePath) return;
    navigator.clipboard.writeText(selectedFilePath).then(() => showToast('File path copied'));
  }, [selectedFilePath, showToast]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const isSearchActive = searchQuery.trim().length > 0;

  if (sessions.length === 0) {
    return (
      <div style={{
        height: `calc(100vh - var(--header-height) - var(--nav-tabs-height))`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        color: 'var(--color-text-muted)',
      }}>
        <FolderOpen size={40} strokeWidth={1} />
        <span style={{ fontSize: 'var(--text-md)' }}>No sessions — create a session to use Explorer</span>
      </div>
    );
  }

  const filePreviewPanel = (
    <div style={{
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--color-bg-base)',
    }}>
      {!selectedFilePath ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          color: 'var(--color-text-muted)',
        }}>
          <FileText size={36} strokeWidth={1} />
          <span style={{ fontSize: 'var(--text-sm)' }}>Select a file to preview</span>
        </div>
      ) : (
        <>
          {/* Preview header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderBottom: '1px solid var(--color-border-base)',
            flexShrink: 0,
            background: 'var(--color-bg-header)',
            minHeight: '36px',
          }}>
            <span style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {selectedFilePath.split('/').pop()}
            </span>
            {fileContent && (
              <>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-bg-elevated)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>
                  {formatSize(fileContent.size)}
                </span>
                <Tooltip content="Copy file content" position="bottom">
                  <button
                    onClick={handleCopy}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'inline-flex',
                      borderRadius: 'var(--radius-sm)',
                      color: copied ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      transition: 'color var(--transition-fast)',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                    onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                  >
                    {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
                  </button>
                </Tooltip>
              </>
            )}
            {isNarrow && selectedFilePath && (
              <Tooltip content="Copy file path" position="bottom">
                <button
                  onClick={handleCopyFilePath}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'inline-flex',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-muted)',
                    transition: 'color var(--transition-fast)',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                >
                  <Link size={13} strokeWidth={1.75} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Preview content */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {fileLoading && (
              <div style={{
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                {[95, 80, 60, 88, 70, 50, 75].map((w, i) => (
                  <div key={i} style={{
                    height: '16px',
                    background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    width: `${w}%`,
                    opacity: 0.5,
                  }} />
                ))}
              </div>
            )}

            {!fileLoading && fileError === 'binary' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                height: '100%',
                color: 'var(--color-text-muted)',
              }}>
                <File size={36} strokeWidth={1} />
                <span style={{ fontSize: 'var(--text-sm)' }}>Binary file — preview not available</span>
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                  {selectedFilePath.split('/').pop()}
                </span>
              </div>
            )}

            {!fileLoading && fileError && fileError !== 'binary' && (
              <div style={{
                padding: '16px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-status-error, #f7768e)',
              }}>
                {fileError}
              </div>
            )}

            {!fileLoading && fileContent && (
              <>
                {fileContent.truncated && (
                  <div style={{
                    padding: '6px 14px',
                    fontSize: 'var(--text-xs)',
                    background: 'rgba(224, 175, 104, 0.1)',
                    color: 'var(--color-status-warning, #e0af68)',
                    borderBottom: '1px solid var(--color-border-base)',
                    flexShrink: 0,
                  }}>
                    Showing first 512 KB — file truncated
                  </div>
                )}
                <pre style={{
                  margin: 0,
                  padding: '16px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.6,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                }}>
                  {fileContent.content}
                </pre>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  const searchInput = (
    <input
      className="diff-search-input"
      type="text"
      placeholder="Search files and content…"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        fontSize: '12px',
        padding: '3px 8px',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '4px',
        background: 'var(--color-bg-input)',
        color: 'var(--color-text-primary)',
        outline: 'none',
        fontFamily: 'var(--font-sans)',
      }}
    />
  );

  return (
    <div
      ref={containerRef}
      style={{
        height: `calc(100vh - var(--header-height) - var(--nav-tabs-height))`,
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        overflow: 'hidden',
      }}
    >
      {isNarrow ? (
        /* Narrow layout: dropdown + search + collapsible tree + preview */
        <>
          {/* Narrow header row 1: session select + controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderBottom: '1px solid var(--color-border-base)',
            background: 'var(--color-bg-header)',
            flexShrink: 0,
            minHeight: '36px',
          }}>
            <select
              className="diff-session-select"
              value={selectedSessionId ?? ''}
              onChange={e => handleSessionSelect(e.target.value)}
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
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.folderPath.split('/').slice(-2).join('/')}
                </option>
              ))}
            </select>
            <button
              onClick={() => setTreeKey(k => k + 1)}
              title="Refresh tree"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                width: '28px',
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
              }}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setIsTreeVisible(v => !v)}
              title={isTreeVisible ? 'Collapse file tree' : 'Expand file tree'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                width: '28px',
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
              }}
            >
              {isTreeVisible ? '\u2304' : '\u2261'}
            </button>
          </div>

          {/* Narrow header row 2: search input */}
          <div style={{
            padding: '5px 10px',
            borderBottom: '1px solid var(--color-border-base)',
            background: 'var(--color-bg-header)',
            flexShrink: 0,
          }}>
            {searchInput}
          </div>

          {/* Collapsible file tree or search results */}
          {isTreeVisible && (
            <div style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-bg-base)',
              borderBottom: '1px solid var(--color-border-base)',
              maxHeight: '45vh',
              overflow: 'hidden',
            }}>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!selectedSession?.folderPath ? (
                  <div style={{
                    padding: '16px 12px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-muted)',
                    fontStyle: 'italic',
                  }}>
                    Session has no working directory set
                  </div>
                ) : isSearchActive ? (
                  <SearchResultsList
                    results={searchResults}
                    isSearching={isSearching}
                    selectedFilePath={selectedFilePath}
                    rootPath={selectedSession.folderPath}
                    onSelect={handleFileSelect}
                    onDoubleClick={handleFileDoubleClick}
                  />
                ) : (
                  <ExplorerFolderTree
                    key={`${selectedSessionId}-${treeKey}`}
                    rootPath={selectedSession.folderPath}
                    onFileSelect={handleFileSelect}
                    onFileDoubleClick={handleFileDoubleClick}
                    selectedFilePath={selectedFilePath}
                  />
                )}
              </div>
            </div>
          )}

          {/* File preview */}
          {filePreviewPanel}
        </>
      ) : (
        /* Wide layout: session sidebar | file tree + search | file preview */
        <>
          {/* Left: Session sidebar (200px) */}
          <SessionSidebar
            sessions={sessions}
            activeSessionId={selectedSessionId}
            onSelectSession={handleSessionSelect}
          />

          {/* Middle: File tree with search (260px) */}
          <div style={{
            width: '260px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-base)',
            borderRight: '1px solid var(--color-border-base)',
            overflow: 'hidden',
          }}>
            {/* Tree header: search + folder path + refresh */}
            <div style={{
              padding: '6px 8px',
              borderBottom: '1px solid var(--color-border-base)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                {searchInput}
                <button
                  onClick={() => setTreeKey(k => k + 1)}
                  title="Refresh tree"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'inline-flex',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-muted)',
                    transition: 'color var(--transition-fast)',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                >
                  <RefreshCw size={13} strokeWidth={1.75} />
                </button>
              </div>
              <div style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {selectedSession?.folderPath || '—'}
              </div>
            </div>

            {/* Tree body or search results */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedSession?.folderPath ? (
                <div style={{
                  padding: '16px 12px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-muted)',
                  fontStyle: 'italic',
                }}>
                  Session has no working directory set
                </div>
              ) : isSearchActive ? (
                <SearchResultsList
                  results={searchResults}
                  isSearching={isSearching}
                  selectedFilePath={selectedFilePath}
                  rootPath={selectedSession.folderPath}
                  onSelect={handleFileSelect}
                  onDoubleClick={handleFileDoubleClick}
                />
              ) : (
                <ExplorerFolderTree
                  key={`${selectedSessionId}-${treeKey}`}
                  rootPath={selectedSession.folderPath}
                  onFileSelect={handleFileSelect}
                  onFileDoubleClick={handleFileDoubleClick}
                  selectedFilePath={selectedFilePath}
                />
              )}
            </div>
          </div>

          {/* Right: File preview (flex: 1) */}
          {filePreviewPanel}
        </>
      )}
      {/* Toast */}
      {toastVisible && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-bg-success, #d4f5e2)',
          border: '1px solid var(--color-border-success, #48c774)',
          borderRadius: 'var(--radius-md)',
          padding: '7px 14px',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-primary)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Check size={13} strokeWidth={2.5} style={{ color: 'var(--color-text-success, #1a7a40)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-text-success, #1a7a40)' }}>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
