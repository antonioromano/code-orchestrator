import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import parseDiff from 'parse-diff';
import { GitCommit, EyeOff, WrapText } from 'lucide-react';
import type { GitDiffResponse, SessionInfo, GitBranchesResponse } from '@remote-orchestrator/shared';
import { api } from '../services/api.js';
import { DiffHunk } from './DiffHunk.js';
import { DiffFileSection } from './DiffFileSection.js';
import { SessionSidebar } from './SessionSidebar.js';
import { ResizeDivider } from './ResizeDivider.js';
import { CommitBar } from './CommitBar.js';
import { TriStateCheckbox } from './primitives/index.js';
import { useCommitMode, fileTriState } from '../hooks/useCommitMode.js';
import type { FileMeta, TriState } from '../hooks/useCommitMode.js';
import { useResizablePanel } from '../hooks/useResizablePanel.js';

const MAX_LINES_BEFORE_TRUNCATE = 500;
const NARROW_BREAKPOINT = 520;

interface GitDiffPanelProps {
  diff: GitDiffResponse | null;
  theme: 'dark' | 'light';
  isLoading: boolean;
  error: string | null;
  isFullscreen: boolean;
  sessions: SessionInfo[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onRefresh: () => void;
  showHeaderControls?: boolean;
  showSessionSelector?: boolean;
}

type SectionKey = 'unstaged' | 'staged' | 'branch' | 'untracked';

interface DiffEntry {
  key: string;
  category: 'unstaged' | 'staged' | 'branch';
  file: parseDiff.File;
}

interface UntrackedEntry {
  key: string;
  category: 'untracked';
  filePath: string;
}

type AnyEntry = DiffEntry | UntrackedEntry;

export function GitDiffPanel({
  diff,
  theme,
  isLoading,
  error,
  isFullscreen,
  sessions,
  currentSessionId,
  onSelectSession,
  onClose,
  onToggleFullscreen,
  onRefresh,
  showHeaderControls = true,
  showSessionSelector = true,
}: GitDiffPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  const { size: sidebarWidth, isDragging: isSidebarDragging, handleMouseDown: handleSidebarMouseDown } = useResizablePanel({
    containerRef,
    defaultSize: 200,
    minSize: 120,
    maxSize: 350,
    direction: 'left',
    unit: 'px',
    storageKey: 'gitdiff-sidebar-width',
  });

  const { size: fileListWidth, isDragging: isFileListDragging, handleMouseDown: handleFileListMouseDown } = useResizablePanel({
    containerRef: fileListRef,
    defaultSize: 220,
    minSize: 150,
    maxSize: 500,
    direction: 'left',
    unit: 'px',
    storageKey: 'gitdiff-filelist-width',
  });
  const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullKey, setShowFullKey] = useState<string | null>(null);
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('gitdiff-word-wrap') === 'true');
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());
  const [untrackedContent, setUntrackedContent] = useState<Map<string, string | 'loading' | 'error'>>(new Map());
  const [trackingFile, setTrackingFile] = useState<string | null>(null);
  const [ignoringFile, setIgnoringFile] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [behindCount, setBehindCount] = useState<number | undefined>(undefined);
  const [branchLoading, setBranchLoading] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchError, setBranchError] = useState('');

  const commitModeResult = useCommitMode();
  const { commitMode, actions, selectedFileCount } = commitModeResult;
  const commitModeActive = commitMode.isActive;

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [sheetOpen, setSheetOpen] = useState(false);
  const touchStartRef = useRef(0);

  const folderPath = sessions.find(s => s.id === currentSessionId)?.folderPath ?? '';

  function toggleSection(key: SectionKey) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Detect container width to switch between sidebar and accordion layouts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setIsNarrow(entries[0].contentRect.width < NARROW_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { stagedFiles, unstagedFiles, branchFiles, untrackedFiles, totalFiles, totalAdditions, totalDeletions } = useMemo(() => {
    const staged = diff?.staged ? parseDiff(diff.staged) : [];
    const unstaged = diff?.unstaged ? parseDiff(diff.unstaged) : [];
    const branch = diff?.branch ? parseDiff(diff.branch) : [];
    const untracked = diff?.untracked ?? [];
    let adds = 0;
    let dels = 0;
    for (const f of [...staged, ...unstaged]) {
      adds += f.additions;
      dels += f.deletions;
    }
    return {
      stagedFiles: staged,
      unstagedFiles: unstaged,
      branchFiles: branch,
      untrackedFiles: untracked,
      totalFiles: staged.length + unstaged.length + untracked.length,
      totalAdditions: adds,
      totalDeletions: dels,
    };
  }, [diff]);

  // Build FileMeta for unstaged files (for commit mode)
  const unstagedFileMetas = useMemo((): FileMeta[] =>
    unstagedFiles.map(file => ({
      filePath: file.to === '/dev/null' ? (file.from ?? '') : (file.to ?? ''),
      hunks: file.chunks.map((chunk, i) => ({
        chunkIndex: i,
        totalChanges: chunk.changes.filter(c => c.type === 'add' || c.type === 'del').length,
      })),
      isBinary: file.chunks.length === 0 && file.additions === 0 && file.deletions === 0,
    })),
  [unstagedFiles]);

  const untrackedFileMetas = useMemo((): FileMeta[] =>
    untrackedFiles.map(fp => ({ filePath: fp, hunks: [], isUntracked: true })),
  [untrackedFiles]);

  const allCommitFileMetas = useMemo(() =>
    [...unstagedFileMetas, ...untrackedFileMetas],
  [unstagedFileMetas, untrackedFileMetas]);

  const hasOnlyUntrackedSelected = useMemo(() => {
    if (!commitModeActive || commitMode.selections.size === 0) return false;
    for (const [fp] of commitMode.selections) {
      if (!untrackedFiles.includes(fp)) return false;
    }
    return true;
  }, [commitModeActive, commitMode.selections, untrackedFiles]);

  // Notify stale diff when diff changes while commit mode is active
  const prevDiffRef = useRef<GitDiffResponse | null | undefined>(undefined);
  useEffect(() => {
    if (prevDiffRef.current !== undefined && prevDiffRef.current !== diff) {
      actions.notifyDiffRefreshed();
    }
    prevDiffRef.current = diff;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff]);

  // Track mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close sheet when commit mode exits (e.g., after successful commit)
  useEffect(() => {
    if (!commitModeActive) setSheetOpen(false);
  }, [commitModeActive]);

  const handleToggleCommitMode = () => {
    if (!commitModeActive) {
      actions.loadGitInfo(currentSessionId);
    }
    actions.toggleCommitMode();
  };

  const defaultExpanded = totalFiles <= 20;

  const searchLower = searchQuery.toLowerCase();
  const fileMatchesSearch = (f: parseDiff.File, query: string): boolean => {
    if ((f.to ?? f.from ?? '').toLowerCase().includes(query)) return true;
    return f.chunks.some(chunk =>
      chunk.changes.some(change => change.content.slice(1).toLowerCase().includes(query))
    );
  };
  const filteredUnstaged  = searchLower ? unstagedFiles.filter(f => fileMatchesSearch(f, searchLower))      : unstagedFiles;
  const filteredStaged    = searchLower ? stagedFiles.filter(f => fileMatchesSearch(f, searchLower))        : stagedFiles;
  const filteredBranch    = searchLower ? branchFiles.filter(f => fileMatchesSearch(f, searchLower))        : branchFiles;
  const filteredUntracked = searchLower ? untrackedFiles.filter(p => p.toLowerCase().includes(searchLower)) : untrackedFiles;

  // Wide layout: sidebar selection state
  const allEntries: AnyEntry[] = useMemo(() => {
    const entries: AnyEntry[] = [];
    filteredUnstaged.forEach((file) =>
      entries.push({ key: `unstaged:${file.to ?? file.from ?? ''}`, category: 'unstaged', file }),
    );
    filteredStaged.forEach((file) =>
      entries.push({ key: `staged:${file.to ?? file.from ?? ''}`, category: 'staged', file }),
    );
    // branch section intentionally omitted — already reflected in unstaged group
    filteredUntracked.forEach((filePath) =>
      entries.push({ key: `untracked:${filePath}`, category: 'untracked', filePath }),
    );
    return entries;
  }, [filteredUnstaged, filteredStaged, filteredBranch, filteredUntracked]);

  const selectedKey = useMemo(() => {
    if (allEntries.length === 0) return null;
    const stillValid = allEntries.some(e => e.key === userSelectedKey);
    return stillValid ? userSelectedKey : allEntries[0].key;
  }, [allEntries, userSelectedKey]);

  const selectedEntry: AnyEntry | null = allEntries.find(e => e.key === selectedKey) ?? null;

  // Fetch untracked file content when selected
  useEffect(() => {
    if (!selectedEntry || selectedEntry.category !== 'untracked') return;
    const { filePath } = selectedEntry;
    if (untrackedContent.has(filePath)) return;
    if (!folderPath) return;

    setUntrackedContent(prev => new Map(prev).set(filePath, 'loading'));
    const absPath = `${folderPath.replace(/\/$/, '')}/${filePath}`;
    fetch(`/api/fs/file?path=${encodeURIComponent(absPath)}`)
      .then(res => res.json())
      .then((data: { content?: string; error?: string }) => {
        setUntrackedContent(prev => new Map(prev).set(filePath, data.content ?? 'error'));
      })
      .catch(() => {
        setUntrackedContent(prev => new Map(prev).set(filePath, 'error'));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry, folderPath]);

  async function handleTrackFile(filePath: string) {
    if (trackingFile) return;
    setTrackingFile(filePath);
    try {
      await fetch(`/api/sessions/${currentSessionId}/git-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      onRefresh();
    } finally {
      setTrackingFile(null);
    }
  }

  async function handleIgnoreFile(filePath: string) {
    if (ignoringFile) return;
    setIgnoringFile(filePath);
    try {
      await fetch(`/api/sessions/${currentSessionId}/git-ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      onRefresh();
    } finally {
      setIgnoringFile(null);
    }
  }

  const loadBranches = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      const data: GitBranchesResponse = await api.getGitBranches(currentSessionId);
      setBranches(data.branches);
      setCurrentBranch(data.currentBranch);
      setBehindCount(data.behindCount);
    } catch {
      // silently ignore (non-git repos, etc.)
    }
  }, [currentSessionId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  async function handleBranchChange(branch: string) {
    if (branchLoading || branch === currentBranch) return;
    setBranchLoading(true);
    setBranchError('');
    try {
      const result = await api.gitCheckout(currentSessionId, branch);
      if (result.success) {
        await loadBranches();
        onRefresh();
      } else {
        setBranchError(result.error ?? 'Checkout failed');
        setTimeout(() => setBranchError(''), 5000);
      }
    } finally {
      setBranchLoading(false);
    }
  }

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    if (/\s/.test(name)) {
      setBranchError('Branch name cannot contain spaces');
      return;
    }
    setBranchLoading(true);
    setBranchError('');
    try {
      const result = await api.gitCreateBranch(currentSessionId, name);
      if (result.success) {
        setCreatingBranch(false);
        setNewBranchName('');
        await loadBranches();
        onRefresh();
      } else {
        setBranchError(result.error ?? 'Create branch failed');
      }
    } finally {
      setBranchLoading(false);
    }
  }

  async function handlePull() {
    if (branchLoading) return;
    setBranchLoading(true);
    setBranchError('');
    try {
      const result = await api.gitPull(currentSessionId);
      if (result.success) {
        await loadBranches();
        onRefresh();
      } else {
        setBranchError(result.error ?? 'Pull failed');
        setTimeout(() => setBranchError(''), 5000);
      }
    } finally {
      setBranchLoading(false);
    }
  }

  const headerBtnStyle = {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    lineHeight: 1,
  } as const;

  const isEmpty = !error && totalFiles === 0;

  const categoryColor: Record<SectionKey, string> = {
    unstaged: 'var(--color-warning)',
    staged: 'var(--color-success)',
    branch: 'var(--color-accent)',
    untracked: 'var(--color-text-muted)',
  };

  // Right-panel file content renderer (wide layout)
  const renderFileContent = (entry: AnyEntry) => {
    if (entry.category === 'untracked') {
      const contentVal = untrackedContent.get(entry.filePath);
      const untrackedMeta: FileMeta = { filePath: entry.filePath, hunks: [], isUntracked: true };
      const untrackedIsSelected = commitModeActive
        ? commitMode.selections.has(entry.filePath)
        : false;
      return (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'var(--color-bg-elevated)',
              borderBottom: '1px solid var(--color-border-base)',
              flexShrink: 0,
            }}
          >
            {commitModeActive && (
              <TriStateCheckbox
                checked={untrackedIsSelected}
                onChange={() => actions.toggleFile(entry.filePath, untrackedMeta)}
                size={11}
                label={`Toggle ${entry.filePath} selection`}
              />
            )}
            <span style={{ fontSize: '11px', fontWeight: 600, color: categoryColor.untracked, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>untracked</span>
            <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {entry.filePath}
            </span>
            <button
              title={ignoringFile === entry.filePath ? 'Ignoring…' : 'Add to .gitignore'}
              onClick={() => handleIgnoreFile(entry.filePath)}
              disabled={!!ignoringFile}
              style={{ background: 'none', border: 'none', cursor: ignoringFile === entry.filePath ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', lineHeight: 1, padding: '0 4px', flexShrink: 0, opacity: ignoringFile === entry.filePath ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
              onMouseEnter={(e) => { if (!ignoringFile) e.currentTarget.style.color = 'var(--color-warning)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
              {ignoringFile === entry.filePath ? '…' : <><EyeOff size={11} strokeWidth={1.75} /><span style={{ fontFamily: 'var(--font-mono)' }}>.gitignore</span></>}
            </button>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {contentVal === 'loading' || contentVal === undefined ? (
              <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Loading…</div>
            ) : contentVal === 'error' ? (
              <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Binary or unreadable file</div>
            ) : contentVal === '' ? (
              <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(empty file)</div>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <tbody>
                  {contentVal.split('\n').map((line, i) => (
                    <tr key={i} style={{ background: theme === 'dark' ? 'rgba(165,213,112,0.10)' : 'rgba(165,213,112,0.12)' }}>
                      <td
                        style={{
                          width: '48px',
                          minWidth: '48px',
                          padding: '0 8px',
                          textAlign: 'right',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-muted)',
                          userSelect: 'none',
                          verticalAlign: 'top',
                          lineHeight: '20px',
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{
                          padding: '0 8px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-primary)',
                          whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                          wordBreak: wordWrap ? 'break-all' : undefined,
                          overflowWrap: wordWrap ? 'break-word' : undefined,
                          lineHeight: '20px',
                          overflow: 'hidden',
                        }}
                      >
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      );
    }

    const { file } = entry;
    const filePath = file.to === '/dev/null' ? (file.from ?? '') : (file.to ?? '');
    const fileName = file.to === '/dev/null' ? file.from : file.to;
    const isBinary = file.chunks.length === 0 && file.additions === 0 && file.deletions === 0;
    const isNew = file.new;
    const isDeleted = file.deleted;
    const totalLines = file.chunks.reduce((sum, c) => sum + c.changes.length, 0);
    // In commit mode for unstaged files, always show the full diff
    const effectiveShowFull = commitModeActive && entry.category === 'unstaged';
    const isTruncated = !effectiveShowFull && showFullKey !== entry.key && totalLines > MAX_LINES_BEFORE_TRUNCATE;

    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--color-bg-elevated)',
            borderBottom: '1px solid var(--color-border-base)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: categoryColor[entry.category], textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
            {entry.category}
          </span>
          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {fileName || 'unknown'}
          </span>
          {isNew && <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600, flexShrink: 0 }}>NEW</span>}
          {isDeleted && <span style={{ fontSize: '10px', color: 'var(--color-error)', fontWeight: 600, flexShrink: 0 }}>DELETED</span>}
          <span style={{ fontSize: '11px', display: 'flex', gap: '6px', flexShrink: 0 }}>
            {file.additions > 0 && <span style={{ color: 'var(--color-success)' }}>+{file.additions}</span>}
            {file.deletions > 0 && <span style={{ color: 'var(--color-error)' }}>-{file.deletions}</span>}
          </span>
        </div>
        {isBinary ? (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Binary file changed
          </div>
        ) : (
          <>
            {file.chunks.map((chunk, i) => {
              if (isTruncated) {
                let linesBefore = 0;
                for (let j = 0; j < i; j++) linesBefore += file.chunks[j].changes.length;
                if (linesBefore >= MAX_LINES_BEFORE_TRUNCATE) return null;
              }
              const totalChanges = chunk.changes.filter(c => c.type === 'add' || c.type === 'del').length;
              const commitModeForHunk = commitModeActive && entry.category === 'unstaged' ? {
                chunkIndex: i,
                chunkSelection: commitMode.selections.get(filePath)?.get(i),
                totalChanges,
                onToggleChunk: () => actions.toggleChunk(filePath, i, totalChanges),
                onToggleLine: (ci: number) => actions.toggleLine(filePath, i, ci),
                onRevertChunk: async () => {
                  await actions.discardChunk(currentSessionId, filePath, i, totalChanges);
                  onRefresh();
                },
              } : undefined;
              const onRevertHunk = !commitModeActive && entry.category === 'unstaged' ? async () => {
                await actions.discardChunk(currentSessionId, filePath, i, totalChanges);
                onRefresh();
              } : undefined;
              return (
                <DiffHunk
                  key={i}
                  chunk={chunk}
                  theme={theme}
                  searchQuery={searchLower || undefined}
                  commitMode={commitModeForHunk}
                  onRevertHunk={onRevertHunk}
                  wordWrap={wordWrap}
                />
              );
            })}
            {isTruncated && (
              <div style={{ padding: '8px 12px', textAlign: 'center' }}>
                <button
                  onClick={() => setShowFullKey(entry.key)}
                  style={{ padding: '4px 12px', fontSize: '11px', border: '1px solid var(--color-border-base)', borderRadius: '4px', background: 'transparent', color: 'var(--color-accent)', cursor: 'pointer' }}
                >
                  Show full diff ({totalLines} lines)
                </button>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const inputStyle = {
    flex: 1,
    boxSizing: 'border-box' as const,
    fontSize: '12px',
    padding: '3px 8px',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    background: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  };

  const branchRow = branches.length > 0 || creatingBranch ? (
    <div style={{ padding: '4px 8px 4px', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        {!creatingBranch ? (
          <>
            <select
              value={currentBranch}
              onChange={e => handleBranchChange(e.target.value)}
              disabled={branchLoading}
              style={{
                ...inputStyle,
                minWidth: 0,
                cursor: branchLoading ? 'not-allowed' : 'pointer',
                opacity: branchLoading ? 0.6 : 1,
              }}
            >
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
              {currentBranch && !branches.includes(currentBranch) && (
                <option value={currentBranch}>{currentBranch}</option>
              )}
            </select>
            <button
              onClick={handlePull}
              disabled={branchLoading}
              title={behindCount ? `Pull (${behindCount} commit${behindCount !== 1 ? 's' : ''} behind)` : 'Pull'}
              style={{ ...headerBtnStyle, flexShrink: 0, position: 'relative' }}
            >
              ↓
              {!!behindCount && behindCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-1px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                  pointerEvents: 'none',
                }} />
              )}
            </button>
            <button
              onClick={() => { setCreatingBranch(true); setNewBranchName(''); setBranchError(''); }}
              title="Create new branch"
              style={{ ...headerBtnStyle, flexShrink: 0 }}
            >+</button>
          </>
        ) : (
          <>
            <input
              autoFocus
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="new-branch-name"
              disabled={branchLoading}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateBranch(); }
                if (e.key === 'Escape') { setCreatingBranch(false); setBranchError(''); }
              }}
              style={{ ...inputStyle, minWidth: 0 }}
            />
            <button onClick={handleCreateBranch} disabled={branchLoading} title="Confirm" style={{ ...headerBtnStyle, flexShrink: 0 }}>✓</button>
            <button onClick={() => { setCreatingBranch(false); setBranchError(''); }} title="Cancel" style={{ ...headerBtnStyle, flexShrink: 0 }}>✕</button>
          </>
        )}
      </div>
      {branchError && (
        <div style={{ fontSize: '11px', color: 'var(--color-error)', marginTop: '2px', padding: '0 2px' }}>
          {branchError}
        </div>
      )}
    </div>
  ) : null;

  const searchInput = (
    <div style={{ padding: '4px 8px 6px', borderBottom: '1px solid var(--color-border-base)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <input
        className="diff-search-input"
        type="text"
        placeholder="Search files and content…"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (searchQuery) {
              setSearchQuery('');
            } else {
              (e.target as HTMLInputElement).blur();
            }
          }
        }}
        style={{
          flex: 1,
          boxSizing: 'border-box',
          fontSize: '12px',
          padding: '3px 8px',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '4px',
          background: 'var(--color-bg-input)',
          color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      />
      <button onClick={onRefresh} style={{ ...headerBtnStyle, opacity: isLoading ? 0.5 : 1, flexShrink: 0 }} title="Refresh diff">
        {'\u21BB'}
      </button>
    </div>
  );

  const sectionHeader = (key: SectionKey, text: string, count: number, topPad = false) => {
    const isCollapsed = collapsedSections.has(key);
    return (
      <button
        onClick={() => toggleSection(key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          width: '100%',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          padding: topPad ? '12px 4px 8px' : '4px 4px 8px',
          minHeight: '36px',
          color: 'var(--color-text-secondary)',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '10px', flexShrink: 0 }}>{isCollapsed ? '▸' : '▾'}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{text}</span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '2px' }}>({count})</span>
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        background: 'var(--color-bg-base)',
        borderLeft: isFullscreen ? 'none' : '1px solid var(--color-border-base)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--color-bg-header)',
          borderBottom: '1px solid var(--color-border-base)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', flexShrink: 0 }}>
              Git Diff
            </span>
            {!isEmpty && !error && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {totalFiles} file{totalFiles !== 1 ? 's' : ''}
                {totalAdditions > 0 && <span style={{ color: 'var(--color-success)', marginLeft: '6px' }}>+{totalAdditions}</span>}
                {totalDeletions > 0 && <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>-{totalDeletions}</span>}
              </span>
            )}
          </div>
          {showSessionSelector && isNarrow && (
            <select
              className="diff-session-select"
              value={currentSessionId}
              onChange={e => onSelectSession(e.target.value)}
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-input)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                padding: '1px 4px',
                cursor: 'pointer',
                maxWidth: '200px',
                outline: 'none',
              }}
            >
              {(sessions ?? []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.hasGitChanges ? '⚠ ' : ''}{s.name} — {s.folderPath.split('/').slice(-2).join('/')}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isNarrow && totalFiles > 0 && !error && (
            <button onClick={() => setCollapseAllKey(k => k + 1)} style={headerBtnStyle} title="Collapse all">
              {'\u2261'}
            </button>
          )}
          {!isEmpty && !error && (
            <button
              onClick={() => setWordWrap(w => { const next = !w; localStorage.setItem('gitdiff-word-wrap', String(next)); return next; })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: wordWrap ? 'var(--color-accent-subtle)' : 'none',
                border: wordWrap ? '1px solid var(--color-accent)' : '1px solid transparent',
                borderRadius: '4px',
                color: wordWrap ? 'var(--color-accent)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: wordWrap ? 600 : 400,
                padding: '2px 6px',
                lineHeight: 1,
              }}
              title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            >
              <WrapText size={11} strokeWidth={2} />
              Wrap
            </button>
          )}
          {/* Commit mode toggle — shown in all views */}
          {!isEmpty && !error && (
            <button
              onClick={handleToggleCommitMode}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: commitModeActive ? 'var(--color-accent-subtle)' : 'none',
                border: commitModeActive ? '1px solid var(--color-accent)' : '1px solid transparent',
                borderRadius: '4px',
                color: commitModeActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: commitModeActive ? 600 : 400,
                padding: '2px 6px',
                lineHeight: 1,
              }}
              title={commitModeActive ? 'Exit commit mode' : 'Stage and commit selected changes'}
            >
              <GitCommit size={11} strokeWidth={2} />
              {commitModeActive ? 'Exit' : 'Commit'}
            </button>
          )}
          {showHeaderControls && (
            <>
              <button onClick={onToggleFullscreen} style={headerBtnStyle} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? '\u2923' : '\u2922'}
              </button>
              <button onClick={onClose} style={headerBtnStyle} title="Close diff">
                {'\u2715'}
              </button>
            </>
          )}
        </div>
      </div>

      {isNarrow ? (
        /* Narrow layout: accordion file list */
        <>
          {branchRow}
          {searchInput}
          {commitModeActive && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderBottom: '1px solid var(--color-border-base)',
                flexShrink: 0,
              }}
            >
              <TriStateCheckbox
                checked={
                  selectedFileCount === 0 ? false
                  : selectedFileCount === allCommitFileMetas.length ? true
                  : 'indeterminate'
                }
                onChange={() => selectedFileCount === allCommitFileMetas.length ? actions.clearAll() : actions.selectAll(allCommitFileMetas)}
                size={11}
                label="Select all files"
              />
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Select all</span>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px', minHeight: 0 }}>
            {error && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{error}</span>
                <button onClick={onRefresh} style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            )}
            {!error && isEmpty && (diff !== null || !isLoading) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                No changes
              </div>
            )}
            {!error && isEmpty && isLoading && diff === null && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                Loading...
              </div>
            )}
            {!error && totalFiles > 20 && (
              <div style={{ padding: '6px 12px', marginBottom: '8px', borderRadius: '6px', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '12px' }}>
                {totalFiles} files changed — files are collapsed by default
              </div>
            )}
            {!error && filteredUnstaged.length > 0 && (
              <div>
                {sectionHeader('unstaged', 'Unstaged Changes', filteredUnstaged.length)}
                {!collapsedSections.has('unstaged') && filteredUnstaged.map((file, i) => {
                  const filePath = file.to === '/dev/null' ? (file.from ?? '') : (file.to ?? '');
                  const fileMeta = unstagedFileMetas.find(m => m.filePath === filePath);
                  const commitModeProps = commitModeActive && fileMeta ? {
                    fileSelection: commitMode.selections.get(filePath),
                    fileMeta,
                    fileTriState: fileTriState(commitMode.selections.get(filePath), fileMeta),
                    onToggleFile: () => actions.toggleFile(filePath, fileMeta),
                    onToggleChunk: (chunkIndex: number, totalChanges: number) => actions.toggleChunk(filePath, chunkIndex, totalChanges),
                    onToggleLine: (chunkIndex: number, changeIndex: number) => actions.toggleLine(filePath, chunkIndex, changeIndex),
                    onRevertChunk: async (chunkIndex: number, totalChanges: number) => {
                      await actions.discardChunk(currentSessionId, filePath, chunkIndex, totalChanges);
                      onRefresh();
                    },
                    isNarrow,
                  } : undefined;
                  return (
                    <DiffFileSection
                      key={`unstaged-${i}`}
                      file={file}
                      theme={theme}
                      defaultExpanded={defaultExpanded}
                      collapseAllKey={collapseAllKey}
                      searchQuery={searchLower || undefined}
                      commitMode={commitModeProps}
                      forceShowFull={commitModeActive}
                      wordWrap={wordWrap}
                      onRevertChunk={!commitModeActive ? async (chunkIndex, totalChanges) => {
                        await actions.discardChunk(currentSessionId, filePath, chunkIndex, totalChanges);
                        onRefresh();
                      } : undefined}
                    />
                  );
                })}
              </div>
            )}
            {!error && filteredStaged.length > 0 && (
              <div>
                {sectionHeader('staged', commitModeActive ? 'Already Staged' : 'Staged Changes', filteredStaged.length, filteredUnstaged.length > 0)}
                {!collapsedSections.has('staged') && filteredStaged.map((file, i) => (
                  <DiffFileSection key={`staged-${i}`} file={file} theme={theme} defaultExpanded={defaultExpanded} collapseAllKey={collapseAllKey} searchQuery={searchLower || undefined} wordWrap={wordWrap} />
                ))}
              </div>
            )}
            {!error && filteredUntracked.length > 0 && (
              <div>
                {sectionHeader('untracked', 'Untracked Files', filteredUntracked.length, filteredUnstaged.length > 0 || filteredStaged.length > 0)}
                {!collapsedSections.has('untracked') && filteredUntracked.map((filePath, i) => (
                  <UntrackedFileRow
                    key={`untracked-${i}`}
                    filePath={filePath}
                    folderPath={folderPath}
                    theme={theme}
                    onTrack={() => handleTrackFile(filePath)}
                    isTracking={trackingFile === filePath}
                    onIgnore={() => handleIgnoreFile(filePath)}
                    isIgnoring={ignoringFile === filePath}
                    commitModeToggle={commitModeActive ? {
                      isSelected: commitMode.selections.has(filePath),
                      onToggle: () => actions.toggleFile(filePath, { filePath, hunks: [], isUntracked: true }),
                    } : undefined}
                    wordWrap={wordWrap}
                  />
                ))}
              </div>
            )}
          </div>
          {commitModeActive && !isMobile && (
            <CommitBar
              sessionId={currentSessionId}
              fileMetas={allCommitFileMetas}
              untrackedFiles={untrackedFiles}
              commitModeResult={commitModeResult}
              onClose={actions.toggleCommitMode}
              onSelectAll={() => actions.selectAll(allCommitFileMetas)}
              onClearAll={actions.clearAll}
              hasOnlyUntrackedSelected={hasOnlyUntrackedSelected}
              onRefresh={onRefresh}
            />
          )}
        </>
      ) : (
        /* Wide layout: session sidebar | file list | content */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
          {/* Session sidebar (resizable) */}
          {showSessionSelector && (
            <>
              <SessionSidebar
                sessions={sessions ?? []}
                activeSessionId={currentSessionId}
                onSelectSession={onSelectSession}
                width={sidebarWidth}
              />
              <ResizeDivider isDragging={isSidebarDragging} onMouseDown={handleSidebarMouseDown} />
            </>
          )}

          {/* File list sidebar (resizable) */}
          <div ref={fileListRef} style={{ width: `${fileListWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
            {branchRow}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border-base)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                className="diff-search-input"
                type="text"
                placeholder="Search files and content…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    if (searchQuery) {
                      setSearchQuery('');
                    } else {
                      (e.target as HTMLInputElement).blur();
                    }
                  }
                }}
                style={{ flex: 1, boxSizing: 'border-box', fontSize: '12px', padding: '3px 8px', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', outline: 'none' }}
              />
              <button onClick={onRefresh} style={{ ...headerBtnStyle, opacity: isLoading ? 0.5 : 1, flexShrink: 0 }} title="Refresh diff">
                {'\u21BB'}
              </button>
            </div>
            {commitModeActive && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderBottom: '1px solid var(--color-border-base)',
                  flexShrink: 0,
                }}
              >
                <TriStateCheckbox
                  checked={
                    selectedFileCount === 0 ? false
                    : selectedFileCount === allCommitFileMetas.length ? true
                    : 'indeterminate'
                  }
                  onChange={() => selectedFileCount === allCommitFileMetas.length ? actions.clearAll() : actions.selectAll(allCommitFileMetas)}
                  size={11}
                  label="Select all files"
                />
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Select all</span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {(error || (isEmpty && (diff !== null || !isLoading))) && (
                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  {error ? 'Error loading' : 'No changes'}
                </div>
              )}
              {isEmpty && isLoading && diff === null && (
                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading...</div>
              )}
              {filteredUnstaged.length > 0 && (
                <div>
                  <SidebarSectionHeader label="Unstaged" count={filteredUnstaged.length} isCollapsed={collapsedSections.has('unstaged')} onToggle={() => toggleSection('unstaged')} topPad={false} />
                  {!collapsedSections.has('unstaged') && filteredUnstaged.map((file) => {
                    const key = `unstaged:${file.to ?? file.from ?? ''}`;
                    const fileName = file.to === '/dev/null' ? file.from : file.to;
                    const filePath = file.to === '/dev/null' ? (file.from ?? '') : (file.to ?? '');
                    const fileMeta = commitModeActive ? unstagedFileMetas.find(m => m.filePath === filePath) : undefined;
                    const triState = fileMeta ? fileTriState(commitMode.selections.get(filePath), fileMeta) : undefined;
                    return (
                      <FileRow
                        key={key}
                        fileName={fileName ?? 'unknown'}
                        isNew={!!file.new}
                        isDeleted={!!file.deleted}
                        additions={file.additions}
                        deletions={file.deletions}
                        isActive={selectedKey === key}
                        onClick={() => setUserSelectedKey(key)}
                        checkboxState={triState}
                        onToggleCheckbox={fileMeta ? () => actions.toggleFile(filePath, fileMeta) : undefined}
                      />
                    );
                  })}
                </div>
              )}
              {filteredStaged.length > 0 && (
                <div>
                  <SidebarSectionHeader
                    label={commitModeActive ? 'Already Staged' : 'Staged'}
                    count={filteredStaged.length}
                    isCollapsed={collapsedSections.has('staged')}
                    onToggle={() => toggleSection('staged')}
                    topPad={filteredUnstaged.length > 0}
                  />
                  {!collapsedSections.has('staged') && filteredStaged.map((file) => {
                    const key = `staged:${file.to ?? file.from ?? ''}`;
                    const fileName = file.to === '/dev/null' ? file.from : file.to;
                    return <FileRow key={key} fileName={fileName ?? 'unknown'} isNew={!!file.new} isDeleted={!!file.deleted} additions={file.additions} deletions={file.deletions} isActive={selectedKey === key} onClick={() => setUserSelectedKey(key)} />;
                  })}
                </div>
              )}
              {filteredUntracked.length > 0 && (
                <div>
                  <SidebarSectionHeader label="Untracked" count={filteredUntracked.length} isCollapsed={collapsedSections.has('untracked')} onToggle={() => toggleSection('untracked')} topPad={filteredUnstaged.length > 0 || filteredStaged.length > 0} />
                  {!collapsedSections.has('untracked') && filteredUntracked.map((filePath) => {
                    const key = `untracked:${filePath}`;
                    const shortName = filePath.split('/').pop() ?? filePath;
                    const isSelected = commitModeActive ? commitMode.selections.has(filePath) : false;
                    return (
                      <button
                        key={key}
                        title={filePath}
                        onClick={() => setUserSelectedKey(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          width: '100%',
                          padding: '4px 8px 4px 10px',
                          border: 'none',
                          borderLeft: selectedKey === key ? '2px solid var(--color-accent)' : '2px solid transparent',
                          borderRadius: 'var(--radius-sm)',
                          background: selectedKey === key ? 'var(--color-bg-elevated)' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background var(--transition-fast)',
                          boxSizing: 'border-box',
                        }}
                        onMouseEnter={(e) => { if (selectedKey !== key) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
                        onMouseLeave={(e) => { if (selectedKey !== key) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {commitModeActive && (
                          <TriStateCheckbox
                            checked={isSelected}
                            onChange={() => actions.toggleFile(filePath, { filePath, hunks: [], isUntracked: true })}
                            size={11}
                            label={`Toggle ${filePath}`}
                          />
                        )}
                        <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
                        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: selectedKey === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {shortName}
                        </span>
                        <button
                          title={trackingFile === filePath ? 'Adding…' : 'Track file (git add)'}
                          onClick={(e) => { e.stopPropagation(); handleTrackFile(filePath); }}
                          disabled={!!trackingFile}
                          style={{ background: 'none', border: 'none', cursor: trackingFile === filePath ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: trackingFile === filePath ? 0.4 : 1 }}
                          onMouseEnter={(e) => { if (!trackingFile) e.currentTarget.style.color = 'var(--color-success)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                        >{trackingFile === filePath ? '…' : '+'}</button>
                        <button
                          title={ignoringFile === filePath ? 'Ignoring…' : 'Add to .gitignore'}
                          onClick={(e) => { e.stopPropagation(); handleIgnoreFile(filePath); }}
                          disabled={!!ignoringFile}
                          style={{ background: 'none', border: 'none', cursor: ignoringFile === filePath ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: ignoringFile === filePath ? 0.4 : 1, display: 'inline-flex', alignItems: 'center' }}
                          onMouseEnter={(e) => { if (!ignoringFile) e.currentTarget.style.color = 'var(--color-warning)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                        >{ignoringFile === filePath ? '…' : <EyeOff size={11} strokeWidth={1.75} />}</button>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <ResizeDivider isDragging={isFileListDragging} onMouseDown={handleFileListMouseDown} />

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {error && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{error}</span>
                <button onClick={onRefresh} style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>Retry</button>
              </div>
            )}
            {!error && isEmpty && (diff !== null || !isLoading) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: '14px' }}>No changes</div>
            )}
            {!error && isEmpty && isLoading && diff === null && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading...</div>
            )}
            {!error && selectedEntry && (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {renderFileContent(selectedEntry)}
              </div>
            )}
            {commitModeActive && !isMobile && (
              <CommitBar
                sessionId={currentSessionId}
                fileMetas={allCommitFileMetas}
                untrackedFiles={untrackedFiles}
                commitModeResult={commitModeResult}
                onClose={actions.toggleCommitMode}
                onSelectAll={() => actions.selectAll(allCommitFileMetas)}
                onClearAll={actions.clearAll}
                hasOnlyUntrackedSelected={hasOnlyUntrackedSelected}
                onRefresh={onRefresh}
              />
            )}
          </div>
        </div>
      )}

      {/* Mobile FAB — opens bottom sheet */}
      {commitModeActive && isMobile && (
        <button className="commit-fab" onClick={() => setSheetOpen(true)} aria-label="Open commit panel">
          <GitCommit size={22} strokeWidth={2} />
          {selectedFileCount > 0 && (
            <span className="commit-fab-badge">{selectedFileCount}</span>
          )}
        </button>
      )}

      {/* Mobile bottom sheet */}
      {commitModeActive && isMobile && sheetOpen && (
        <>
          <div className="commit-sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div
            className="commit-sheet"
            onTouchStart={(e) => { touchStartRef.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (e.changedTouches[0].clientY - touchStartRef.current > 60) setSheetOpen(false);
            }}
          >
            <div className="commit-sheet-handle" />
            <CommitBar
              sessionId={currentSessionId}
              fileMetas={allCommitFileMetas}
              untrackedFiles={untrackedFiles}
              commitModeResult={commitModeResult}
              onClose={() => { setSheetOpen(false); actions.toggleCommitMode(); }}
              onSelectAll={() => actions.selectAll(allCommitFileMetas)}
              onClearAll={actions.clearAll}
              hasOnlyUntrackedSelected={hasOnlyUntrackedSelected}
              onRefresh={onRefresh}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface UntrackedFileRowProps {
  filePath: string;
  folderPath: string;
  theme: 'dark' | 'light';
  onTrack: () => void;
  isTracking?: boolean;
  onIgnore: () => void;
  isIgnoring?: boolean;
  commitModeToggle?: { isSelected: boolean; onToggle: () => void };
  wordWrap?: boolean;
}

function UntrackedFileRow({ filePath, folderPath, theme, onTrack, isTracking, onIgnore, isIgnoring, commitModeToggle, wordWrap }: UntrackedFileRowProps) {
  const shortName = filePath.split('/').pop() ?? filePath;
  const [expanded, setExpanded] = useState(false);
  // null = not fetched yet, 'error' = failed/binary, string = content
  const [content, setContent] = useState<string | 'error' | null>(null);

  useEffect(() => {
    if (!expanded || content !== null || !folderPath) return;
    let cancelled = false;
    const absPath = `${folderPath.replace(/\/$/, '')}/${filePath}`;
    fetch(`/api/fs/file?path=${encodeURIComponent(absPath)}`)
      .then(res => res.json())
      .then((data: { content?: string; error?: string }) => {
        if (!cancelled) setContent(data.content ?? 'error');
      })
      .catch(() => { if (!cancelled) setContent('error'); });
    return () => { cancelled = true; };
  }, [expanded, content, folderPath, filePath]);

  return (
    <div style={{ borderRadius: '6px', border: '1px solid var(--color-border-base)', overflow: 'hidden', marginBottom: '4px' }}>
      <div
        title={filePath}
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 12px 3px 8px',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          background: 'var(--color-bg-elevated)',
          userSelect: 'none',
        }}
      >
        {commitModeToggle && (
          <TriStateCheckbox
            checked={commitModeToggle.isSelected}
            onChange={commitModeToggle.onToggle}
            size={11}
            label={`Toggle ${filePath}`}
          />
        )}
        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{shortName}</span>
        <button
          title={isTracking ? 'Adding…' : 'Track file (git add)'}
          onClick={e => { e.stopPropagation(); onTrack(); }}
          disabled={isTracking}
          style={{ background: 'none', border: 'none', cursor: isTracking ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: isTracking ? 0.4 : 1 }}
          onMouseEnter={(e) => { if (!isTracking) e.currentTarget.style.color = 'var(--color-success)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
        >{isTracking ? '…' : '+'}</button>
        <button
          title={isIgnoring ? 'Ignoring…' : 'Add to .gitignore'}
          onClick={e => { e.stopPropagation(); onIgnore(); }}
          disabled={isIgnoring}
          style={{ background: 'none', border: 'none', cursor: isIgnoring ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: isIgnoring ? 0.4 : 1, display: 'inline-flex', alignItems: 'center' }}
          onMouseEnter={(e) => { if (!isIgnoring) e.currentTarget.style.color = 'var(--color-warning)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
        >{isIgnoring ? '…' : <EyeOff size={11} strokeWidth={1.75} />}</button>
      </div>
      {expanded && (
        <div style={{ overflow: 'auto', maxHeight: '300px' }}>
          {content === null ? (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Loading…</div>
          ) : content === 'error' ? (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Binary or unreadable file</div>
          ) : content === '' ? (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(empty file)</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
              <tbody>
                {content.split('\n').map((line, i) => (
                  <tr key={i} style={{ background: theme === 'dark' ? 'rgba(165,213,112,0.10)' : 'rgba(165,213,112,0.12)' }}>
                    <td style={{ width: '40px', minWidth: '40px', padding: '0 4px', textAlign: 'right', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', userSelect: 'none', lineHeight: '20px' }}>{i + 1}</td>
                    <td style={{ padding: '0 8px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', whiteSpace: wordWrap ? 'pre-wrap' : 'pre', wordBreak: wordWrap ? 'break-all' : undefined, overflowWrap: wordWrap ? 'break-word' : undefined, lineHeight: '20px', overflow: 'hidden' }}>{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

interface SidebarSectionHeaderProps {
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  topPad: boolean;
}

function SidebarSectionHeader({ label, count, isCollapsed, onToggle, topPad }: SidebarSectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        width: '100%',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        padding: topPad ? '8px 10px 2px' : '6px 10px 2px',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{isCollapsed ? '▸' : '▾'}</span>
      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginLeft: '2px' }}>({count})</span>
    </button>
  );
}

interface FileRowProps {
  fileName: string;
  isNew: boolean;
  isDeleted: boolean;
  additions: number;
  deletions: number;
  isActive: boolean;
  onClick: () => void;
  checkboxState?: TriState;
  onToggleCheckbox?: () => void;
}

function FileRow({ fileName, isNew, isDeleted, additions, deletions, isActive, onClick, checkboxState, onToggleCheckbox }: FileRowProps) {
  const shortName = fileName.split('/').pop() ?? fileName;
  return (
    <button
      onClick={onClick}
      title={fileName}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        width: '100%',
        padding: '4px 8px 4px 10px',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
        borderRadius: 'var(--radius-sm)',
        background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background var(--transition-fast)',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      onMouseDown={(e) => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(99,102,241,0.12))'; }}
      onMouseUp={(e) => { e.currentTarget.style.background = isActive ? 'var(--color-bg-elevated)' : 'var(--color-bg-elevated)'; }}
    >
      {checkboxState !== undefined && onToggleCheckbox && (
        <TriStateCheckbox
          checked={checkboxState === 'all' ? true : checkboxState === 'partial' ? 'indeterminate' : false}
          onChange={onToggleCheckbox}
          size={11}
          label={`Toggle ${fileName} selection`}
        />
      )}
      <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {shortName}
      </span>
      {isNew && <span style={{ fontSize: '9px', color: 'var(--color-success)', fontWeight: 700, flexShrink: 0 }}>N</span>}
      {isDeleted && <span style={{ fontSize: '9px', color: 'var(--color-error)', fontWeight: 700, flexShrink: 0 }}>D</span>}
      <span style={{ fontSize: '10px', display: 'flex', gap: '3px', flexShrink: 0 }}>
        {additions > 0 && <span style={{ color: 'var(--color-success)' }}>+{additions}</span>}
        {deletions > 0 && <span style={{ color: 'var(--color-error)' }}>-{deletions}</span>}
      </span>
    </button>
  );
}
