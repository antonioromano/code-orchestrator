import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import tsxLang from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescriptLang from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascriptLang from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import jsxLang from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import jsonLang from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import cssLang from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import scssLang from 'react-syntax-highlighter/dist/esm/languages/prism/scss';
import lessLang from 'react-syntax-highlighter/dist/esm/languages/prism/less';
import markupLang from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import bashLang from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import pythonLang from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rubyLang from 'react-syntax-highlighter/dist/esm/languages/prism/ruby';
import rustLang from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import goLang from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import javaLang from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import cLang from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cppLang from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharpLang from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import phpLang from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import swiftLang from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
import kotlinLang from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import yamlLang from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import tomlLang from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import sqlLang from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import graphqlLang from 'react-syntax-highlighter/dist/esm/languages/prism/graphql';
import hclLang from 'react-syntax-highlighter/dist/esm/languages/prism/hcl';
import dockerLang from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import makefileLang from 'react-syntax-highlighter/dist/esm/languages/prism/makefile';
import { syntaxTheme } from '../utils/syntaxTheme';
import { langFromPath } from '../utils/langFromPath';
import { FolderOpen, FileText, File, FileCode, FileJson, RefreshCw, Copy, Check, Search, Link, BookOpen, Code, Pencil, Save, X as XIcon } from 'lucide-react';
import type { SessionInfo, FileContentResponse, FileSearchResult } from '@remote-orchestrator/shared';
import { ExplorerFolderTree } from './ExplorerFolderTree.js';
import { SessionSidebar } from './SessionSidebar.js';
import { Tooltip } from './primitives/Tooltip.js';
import { api } from '../services/api.js';

SyntaxHighlighter.registerLanguage('tsx', tsxLang);
SyntaxHighlighter.registerLanguage('typescript', typescriptLang);
SyntaxHighlighter.registerLanguage('javascript', javascriptLang);
SyntaxHighlighter.registerLanguage('jsx', jsxLang);
SyntaxHighlighter.registerLanguage('json', jsonLang);
SyntaxHighlighter.registerLanguage('css', cssLang);
SyntaxHighlighter.registerLanguage('scss', scssLang);
SyntaxHighlighter.registerLanguage('less', lessLang);
SyntaxHighlighter.registerLanguage('markup', markupLang);
SyntaxHighlighter.registerLanguage('bash', bashLang);
SyntaxHighlighter.registerLanguage('python', pythonLang);
SyntaxHighlighter.registerLanguage('ruby', rubyLang);
SyntaxHighlighter.registerLanguage('rust', rustLang);
SyntaxHighlighter.registerLanguage('go', goLang);
SyntaxHighlighter.registerLanguage('java', javaLang);
SyntaxHighlighter.registerLanguage('c', cLang);
SyntaxHighlighter.registerLanguage('cpp', cppLang);
SyntaxHighlighter.registerLanguage('csharp', csharpLang);
SyntaxHighlighter.registerLanguage('php', phpLang);
SyntaxHighlighter.registerLanguage('swift', swiftLang);
SyntaxHighlighter.registerLanguage('kotlin', kotlinLang);
SyntaxHighlighter.registerLanguage('yaml', yamlLang);
SyntaxHighlighter.registerLanguage('toml', tomlLang);
SyntaxHighlighter.registerLanguage('markdown', markdownLang);
SyntaxHighlighter.registerLanguage('sql', sqlLang);
SyntaxHighlighter.registerLanguage('graphql', graphqlLang);
SyntaxHighlighter.registerLanguage('hcl', hclLang);
SyntaxHighlighter.registerLanguage('docker', dockerLang);
SyntaxHighlighter.registerLanguage('makefile', makefileLang);

const NARROW_BREAKPOINT = 520;

interface ExplorerPanelProps {
  sessions: SessionInfo[];
  theme: 'dark' | 'light';
  onSelectSession?: (id: string) => void;
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

export function ExplorerPanel({ sessions, onSelectSession }: ExplorerPanelProps) {
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
  const [mdPreview, setMdPreview] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [originalMtimeMs, setOriginalMtimeMs] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

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

  const doSessionSelect = useCallback((id: string) => {
    setSelectedSessionId(id);
    setSelectedFilePath(null);
    setFileContent(null);
    setFileError(null);
    setSearchQuery('');
    setSearchResults(null);
    setIsEditMode(false);
    setEditContent('');
    setOriginalMtimeMs(null);
    onSelectSession?.(id);
  }, [onSelectSession]);

  const handleSessionSelect = useCallback((id: string) => {
    if (isEditMode && editContent !== fileContent?.content) {
      pendingNavRef.current = () => doSessionSelect(id);
      setShowUnsavedModal(true);
    } else {
      doSessionSelect(id);
    }
  }, [isEditMode, editContent, fileContent, doSessionSelect]);

  const doFileSelect = useCallback(async (filePath: string, _ext: string) => {
    const id = ++fetchIdRef.current;
    setSelectedFilePath(filePath);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);
    setMdPreview(false);
    setIsEditMode(false);
    setEditContent('');
    setOriginalMtimeMs(null);
    if (isNarrow) setIsTreeVisible(false);
    try {
      const content = await api.getFileContent(filePath);
      if (fetchIdRef.current === id) {
        setFileContent(content);
        setOriginalMtimeMs(content.mtimeMs);
      }
    } catch (err) {
      if (fetchIdRef.current === id) {
        setFileError(err instanceof Error ? err.message : 'Failed to load file');
      }
    } finally {
      if (fetchIdRef.current === id) setFileLoading(false);
    }
  }, [isNarrow]);

  const handleFileSelect = useCallback((filePath: string, ext: string) => {
    if (isEditMode && editContent !== fileContent?.content) {
      pendingNavRef.current = () => doFileSelect(filePath, ext);
      setShowUnsavedModal(true);
    } else {
      doFileSelect(filePath, ext);
    }
  }, [isEditMode, editContent, fileContent, doFileSelect]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const handleCopy = useCallback(() => {
    const text = isEditMode ? editContent : fileContent?.content;
    if (text === undefined) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Content copied');
    });
  }, [isEditMode, editContent, fileContent, showToast]);

  const handleFileDoubleClick = useCallback((filePath: string) => {
    navigator.clipboard.writeText(filePath).then(() => showToast('File path copied'));
  }, [showToast]);

  const handleCopyFilePath = useCallback(() => {
    if (!selectedFilePath) return;
    navigator.clipboard.writeText(selectedFilePath).then(() => showToast('File path copied'));
  }, [selectedFilePath, showToast]);

  const handleEnterEdit = useCallback(() => {
    if (!fileContent) return;
    setEditContent(fileContent.content);
    setIsEditMode(true);
  }, [fileContent]);

  const handleCancelEdit = useCallback(() => {
    const isDirty = editContent !== fileContent?.content;
    if (isDirty) {
      pendingNavRef.current = () => {
        setIsEditMode(false);
        setEditContent('');
      };
      setShowUnsavedModal(true);
    } else {
      setIsEditMode(false);
      setEditContent('');
    }
  }, [editContent, fileContent]);

  const handleSave = useCallback(async (overwrite = false) => {
    if (!selectedFilePath || !selectedSessionId) return;
    setIsSaving(true);
    try {
      const result = await api.writeFile({
        sessionId: selectedSessionId,
        path: selectedFilePath,
        content: editContent,
        originalMtimeMs: overwrite ? undefined : (originalMtimeMs ?? undefined),
      });
      if (result.conflict) {
        setShowConflictModal(true);
        return;
      }
      if (!result.success) {
        showToast(result.error ?? 'Save failed', 'error');
        return;
      }
      // Update local state to reflect saved content
      setOriginalMtimeMs(result.mtimeMs);
      setFileContent(prev => prev ? { ...prev, content: editContent, size: result.size, mtimeMs: result.mtimeMs } : prev);
      setIsEditMode(false);
      showToast('File saved');
    } catch {
      showToast('Save failed — network error', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedFilePath, selectedSessionId, editContent, originalMtimeMs, showToast]);

  // Ctrl+S / Cmd+S to save; Escape to cancel
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancelEdit();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [isEditMode, handleSave, handleCancelEdit]);

  // Warn on browser close when dirty
  useEffect(() => {
    const isDirty = isEditMode && editContent !== fileContent?.content;
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditMode, editContent, fileContent]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const isSearchActive = searchQuery.trim().length > 0;
  const isMd = selectedFilePath?.toLowerCase().endsWith('.md') ?? false;
  const isDirty = isEditMode && editContent !== fileContent?.content;

  const language = useMemo(
    () => selectedFilePath ? langFromPath(selectedFilePath) : undefined,
    [selectedFilePath],
  );
  const lineCount = useMemo(
    () => fileContent?.content.split('\n').length ?? 0,
    [fileContent],
  );
  const tooManyLines = lineCount > 5000;
  const tooLargeBytes = (fileContent?.size ?? 0) > 200_000;
  const useHighlight = !!language && !tooManyLines && !tooLargeBytes;

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
              {isDirty && <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>●</span>}
            </span>
            {isEditMode ? (
              /* Edit mode toolbar */
              <>
                <Tooltip content="Save (Ctrl+S)" position="bottom">
                  <button
                    onClick={() => handleSave()}
                    disabled={isSaving}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'var(--color-accent)',
                      border: 'none',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      color: '#fff',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      opacity: isSaving ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >
                    <Save size={12} strokeWidth={2} />
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </Tooltip>
                <Tooltip content="Cancel (Esc)" position="bottom">
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: '1px solid var(--color-border-base)',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    <XIcon size={12} strokeWidth={2} />
                    Cancel
                  </button>
                </Tooltip>
              </>
            ) : (
              /* View mode buttons */
              fileContent && (
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
                  {isMd && (
                    <Tooltip content={mdPreview ? 'View raw' : 'Preview markdown'} position="bottom">
                      <button
                        onClick={() => setMdPreview(p => !p)}
                        style={{
                          background: mdPreview ? 'var(--color-accent-subtle)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'inline-flex',
                          borderRadius: 'var(--radius-sm)',
                          color: mdPreview ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          transition: 'color var(--transition-fast)',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { if (!mdPreview) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                        onMouseLeave={(e) => { if (!mdPreview) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                      >
                        {mdPreview ? <Code size={13} strokeWidth={1.75} /> : <BookOpen size={13} strokeWidth={1.75} />}
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content={fileContent.truncated ? 'File too large to edit' : 'Edit file'} position="bottom">
                    <button
                      onClick={handleEnterEdit}
                      disabled={fileContent.truncated}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: fileContent.truncated ? 'not-allowed' : 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        borderRadius: 'var(--radius-sm)',
                        color: fileContent.truncated ? 'var(--color-text-disabled, var(--color-text-muted))' : 'var(--color-text-muted)',
                        opacity: fileContent.truncated ? 0.4 : 1,
                        transition: 'color var(--transition-fast)',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { if (!fileContent.truncated) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                      onMouseLeave={(e) => { if (!fileContent.truncated) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                  </Tooltip>
                </>
              )
            )}
            {isNarrow && selectedFilePath && !isEditMode && (
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
          <div style={{ flex: 1, overflow: isEditMode ? 'hidden' : 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
                {isEditMode ? (
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const next = editContent.substring(0, start) + '  ' + editContent.substring(end);
                        setEditContent(next);
                        // Restore cursor after state update
                        requestAnimationFrame(() => {
                          const el = e.currentTarget;
                          el.selectionStart = start + 2;
                          el.selectionEnd = start + 2;
                        });
                      }
                    }}
                    style={{
                      flex: 1,
                      width: '100%',
                      minHeight: 0,
                      margin: 0,
                      padding: '16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 1.6,
                      color: 'var(--color-text-primary)',
                      background: 'var(--color-bg-code)',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box',
                      whiteSpace: 'pre',
                      overflow: 'auto',
                    }}
                    spellCheck={false}
                  />
                ) : isMd && mdPreview ? (
                  <div style={{
                    padding: '16px 20px',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.7,
                    color: 'var(--color-text-primary)',
                    maxWidth: '80ch',
                  }} className="md-preview">
                    <ReactMarkdown>{fileContent.content}</ReactMarkdown>
                  </div>
                ) : (
                  <>
                    {!!language && (tooManyLines || tooLargeBytes) && (
                      <div style={{
                        padding: '6px 14px',
                        fontSize: 'var(--text-xs)',
                        background: 'rgba(224, 175, 104, 0.1)',
                        color: 'var(--color-status-warning, #e0af68)',
                        borderBottom: '1px solid var(--color-border-base)',
                        flexShrink: 0,
                      }}>
                        File too large for syntax highlighting — showing plain text
                      </div>
                    )}
                    {useHighlight ? (
                      <SyntaxHighlighter
                        language={language}
                        style={syntaxTheme}
                        showLineNumbers
                        lineNumberStyle={{
                          minWidth: '2.5em',
                          paddingRight: '1em',
                          color: 'var(--color-text-muted)',
                          userSelect: 'none' as const,
                          fontSize: 'var(--text-xs)',
                        }}
                        customStyle={{
                          margin: 0,
                          padding: '16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                          lineHeight: 1.6,
                          background: 'var(--color-bg-code)',
                          borderRadius: 0,
                          overflowX: 'auto',
                          whiteSpace: 'pre',
                        }}
                        wrapLongLines={false}
                      >
                        {fileContent.content}
                      </SyntaxHighlighter>
                    ) : (
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
                    )}
                  </>
                )}
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
      {/* Unsaved changes modal */}
      {showUnsavedModal && (
        <div
          onClick={() => setShowUnsavedModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(12,13,24,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-header)',
              border: '1px solid var(--color-border-base)',
              borderRadius: 'var(--radius-xl)',
              padding: '24px',
              maxWidth: '360px',
              width: '90vw',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
              Unsaved changes
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              You have unsaved changes. Discard them?
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowUnsavedModal(false)}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-base)',
                  background: 'none', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
                }}
              >
                Keep editing
              </button>
              <button
                onClick={() => {
                  setShowUnsavedModal(false);
                  pendingNavRef.current?.();
                  pendingNavRef.current = null;
                }}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--color-status-error, #f7768e)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: '#fff',
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict modal */}
      {showConflictModal && (
        <div
          onClick={() => setShowConflictModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(12,13,24,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-header)',
              border: '1px solid var(--color-border-base)',
              borderRadius: 'var(--radius-xl)',
              padding: '24px',
              maxWidth: '400px',
              width: '90vw',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
              File modified externally
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              This file was changed since you started editing. What would you like to do?
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowConflictModal(false)}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-base)',
                  background: 'none', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  if (selectedFilePath) doFileSelect(selectedFilePath, '');
                }}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-base)',
                  background: 'none', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                }}
              >
                Reload file
              </button>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  handleSave(true);
                }}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--color-status-error, #f7768e)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: '#fff',
                }}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastVisible && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toastType === 'error' ? 'rgba(247,118,142,0.15)' : 'var(--color-bg-success, #d4f5e2)',
          border: `1px solid ${toastType === 'error' ? 'var(--color-status-error, #f7768e)' : 'var(--color-border-success, #48c774)'}`,
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
          {toastType === 'error'
            ? <XIcon size={13} strokeWidth={2.5} style={{ color: 'var(--color-status-error, #f7768e)', flexShrink: 0 }} />
            : <Check size={13} strokeWidth={2.5} style={{ color: 'var(--color-text-success, #1a7a40)', flexShrink: 0 }} />
          }
          <span style={{ color: toastType === 'error' ? 'var(--color-status-error, #f7768e)' : 'var(--color-text-success, #1a7a40)' }}>
            {toastMessage}
          </span>
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
