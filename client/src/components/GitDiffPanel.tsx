import { useEffect, useMemo, useRef, useState } from 'react';
import parseDiff from 'parse-diff';
import type { GitDiffResponse, SessionInfo } from '@remote-orchestrator/shared';
import { DiffHunk } from './DiffHunk.js';
import { DiffFileSection } from './DiffFileSection.js';
import { SessionSidebar } from './SessionSidebar.js';

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
  const [isNarrow, setIsNarrow] = useState(false);
  const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullKey, setShowFullKey] = useState<string | null>(null);
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());
  const [untrackedContent, setUntrackedContent] = useState<Map<string, string | 'loading' | 'error'>>(new Map());

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
    for (const f of [...staged, ...unstaged, ...branch]) {
      adds += f.additions;
      dels += f.deletions;
    }
    return {
      stagedFiles: staged,
      unstagedFiles: unstaged,
      branchFiles: branch,
      untrackedFiles: untracked,
      totalFiles: staged.length + unstaged.length + branch.length + untracked.length,
      totalAdditions: adds,
      totalDeletions: dels,
    };
  }, [diff]);

  const defaultExpanded = totalFiles <= 20;

  const searchLower = searchQuery.toLowerCase();
  const fileMatchesSearch = (f: parseDiff.File, query: string): boolean => {
    if ((f.to ?? f.from ?? '').toLowerCase().includes(query)) return true;
    return f.chunks.some(chunk =>
      chunk.changes.some(change => change.content.slice(1).toLowerCase().includes(query))
    );
  };
  const filteredUnstaged  = searchLower ? unstagedFiles.filter(f => fileMatchesSearch(f, searchLower))         : unstagedFiles;
  const filteredStaged    = searchLower ? stagedFiles.filter(f => fileMatchesSearch(f, searchLower))           : stagedFiles;
  const filteredBranch    = searchLower ? branchFiles.filter(f => fileMatchesSearch(f, searchLower))           : branchFiles;
  const filteredUntracked = searchLower ? untrackedFiles.filter(p => p.toLowerCase().includes(searchLower))    : untrackedFiles;

  // Wide layout: sidebar selection state
  const allEntries: AnyEntry[] = useMemo(() => {
    const entries: AnyEntry[] = [];
    filteredUnstaged.forEach((file) =>
      entries.push({ key: `unstaged:${file.to ?? file.from ?? ''}`, category: 'unstaged', file }),
    );
    filteredStaged.forEach((file) =>
      entries.push({ key: `staged:${file.to ?? file.from ?? ''}`, category: 'staged', file }),
    );
    filteredBranch.forEach((file) =>
      entries.push({ key: `branch:${file.to ?? file.from ?? ''}`, category: 'branch', file }),
    );
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
    const absPath = `${folderPath}/${filePath}`;
    fetch(`/api/filesystem/file?path=${encodeURIComponent(absPath)}`)
      .then(res => res.json())
      .then((data: { content?: string; error?: string }) => {
        setUntrackedContent(prev => new Map(prev).set(filePath, data.content ?? 'error'));
      })
      .catch(() => {
        setUntrackedContent(prev => new Map(prev).set(filePath, 'error'));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry, folderPath]);

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
            <span style={{ fontSize: '11px', fontWeight: 600, color: categoryColor.untracked, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>untracked</span>
            <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {entry.filePath}
            </span>
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
                          whiteSpace: 'pre',
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
    const fileName = file.to === '/dev/null' ? file.from : file.to;
    const isBinary = file.chunks.length === 0 && file.additions === 0 && file.deletions === 0;
    const isNew = file.new;
    const isDeleted = file.deleted;
    const totalLines = file.chunks.reduce((sum, c) => sum + c.changes.length, 0);
    const isTruncated = showFullKey !== entry.key && totalLines > MAX_LINES_BEFORE_TRUNCATE;

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
              return <DiffHunk key={i} chunk={chunk} theme={theme} searchQuery={searchLower || undefined} />;
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

  const searchInput = (
    <div style={{ padding: '4px 8px 6px', borderBottom: '1px solid var(--color-border-base)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <input
        className="diff-search-input"
        type="text"
        placeholder="Search files and content…"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onClick={e => e.stopPropagation()}
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
                  {s.name} — {s.folderPath.split('/').slice(-2).join('/')}
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
          {searchInput}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px', minHeight: 0 }}>
            {error && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{error}</span>
                <button onClick={onRefresh} style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            )}
            {!error && isEmpty && !isLoading && (
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
                {!collapsedSections.has('unstaged') && filteredUnstaged.map((file, i) => (
                  <DiffFileSection key={`unstaged-${i}`} file={file} theme={theme} defaultExpanded={defaultExpanded} collapseAllKey={collapseAllKey} searchQuery={searchLower || undefined} />
                ))}
              </div>
            )}
            {!error && filteredStaged.length > 0 && (
              <div>
                {sectionHeader('staged', 'Staged Changes', filteredStaged.length, filteredUnstaged.length > 0)}
                {!collapsedSections.has('staged') && filteredStaged.map((file, i) => (
                  <DiffFileSection key={`staged-${i}`} file={file} theme={theme} defaultExpanded={defaultExpanded} collapseAllKey={collapseAllKey} searchQuery={searchLower || undefined} />
                ))}
              </div>
            )}
            {!error && filteredBranch.length > 0 && (
              <div>
                {sectionHeader('branch', 'Branch Changes', filteredBranch.length, filteredUnstaged.length > 0 || filteredStaged.length > 0)}
                {!collapsedSections.has('branch') && filteredBranch.map((file, i) => (
                  <DiffFileSection key={`branch-${i}`} file={file} theme={theme} defaultExpanded={defaultExpanded} collapseAllKey={collapseAllKey} searchQuery={searchLower || undefined} />
                ))}
              </div>
            )}
            {!error && filteredUntracked.length > 0 && (
              <div>
                {sectionHeader('untracked', 'Untracked Files', filteredUntracked.length, filteredUnstaged.length > 0 || filteredStaged.length > 0 || filteredBranch.length > 0)}
                {!collapsedSections.has('untracked') && filteredUntracked.map((filePath, i) => (
                  <UntrackedFileRow key={`untracked-${i}`} filePath={filePath} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Wide layout: session sidebar | file list | content */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
          {/* Session sidebar (200px) */}
          {showSessionSelector && (
            <SessionSidebar
              sessions={sessions ?? []}
              activeSessionId={currentSessionId}
              onSelectSession={onSelectSession}
            />
          )}

          {/* File list sidebar */}
          <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border-base)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                className="diff-search-input"
                type="text"
                placeholder="Search files and content…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, boxSizing: 'border-box', fontSize: '12px', padding: '3px 8px', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', outline: 'none' }}
              />
              <button onClick={onRefresh} style={{ ...headerBtnStyle, opacity: isLoading ? 0.5 : 1, flexShrink: 0 }} title="Refresh diff">
                {'\u21BB'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {(error || (isEmpty && !isLoading)) && (
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
                    return <FileRow key={key} fileName={fileName ?? 'unknown'} isNew={!!file.new} isDeleted={!!file.deleted} additions={file.additions} deletions={file.deletions} isActive={selectedKey === key} onClick={() => setUserSelectedKey(key)} />;
                  })}
                </div>
              )}
              {filteredStaged.length > 0 && (
                <div>
                  <SidebarSectionHeader label="Staged" count={filteredStaged.length} isCollapsed={collapsedSections.has('staged')} onToggle={() => toggleSection('staged')} topPad={filteredUnstaged.length > 0} />
                  {!collapsedSections.has('staged') && filteredStaged.map((file) => {
                    const key = `staged:${file.to ?? file.from ?? ''}`;
                    const fileName = file.to === '/dev/null' ? file.from : file.to;
                    return <FileRow key={key} fileName={fileName ?? 'unknown'} isNew={!!file.new} isDeleted={!!file.deleted} additions={file.additions} deletions={file.deletions} isActive={selectedKey === key} onClick={() => setUserSelectedKey(key)} />;
                  })}
                </div>
              )}
              {filteredBranch.length > 0 && (
                <div>
                  <SidebarSectionHeader label="Branch" count={filteredBranch.length} isCollapsed={collapsedSections.has('branch')} onToggle={() => toggleSection('branch')} topPad={filteredUnstaged.length > 0 || filteredStaged.length > 0} />
                  {!collapsedSections.has('branch') && filteredBranch.map((file) => {
                    const key = `branch:${file.to ?? file.from ?? ''}`;
                    const fileName = file.to === '/dev/null' ? file.from : file.to;
                    return <FileRow key={key} fileName={fileName ?? 'unknown'} isNew={!!file.new} isDeleted={!!file.deleted} additions={file.additions} deletions={file.deletions} isActive={selectedKey === key} onClick={() => setUserSelectedKey(key)} />;
                  })}
                </div>
              )}
              {filteredUntracked.length > 0 && (
                <div>
                  <SidebarSectionHeader label="Untracked" count={filteredUntracked.length} isCollapsed={collapsedSections.has('untracked')} onToggle={() => toggleSection('untracked')} topPad={filteredUnstaged.length > 0 || filteredStaged.length > 0 || filteredBranch.length > 0} />
                  {!collapsedSections.has('untracked') && filteredUntracked.map((filePath) => {
                    const key = `untracked:${filePath}`;
                    const shortName = filePath.split('/').pop() ?? filePath;
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
                        <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
                        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: selectedKey === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {shortName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {error && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{error}</span>
                <button onClick={onRefresh} style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>Retry</button>
              </div>
            )}
            {!error && isEmpty && !isLoading && (
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
          </div>
        </div>
      )}
    </div>
  );
}

function UntrackedFileRow({ filePath }: { filePath: string }) {
  const shortName = filePath.split('/').pop() ?? filePath;
  return (
    <div
      title={filePath}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 12px 3px 12px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <span style={{ fontSize: '9px', color: 'var(--color-warning)', fontWeight: 700, flexShrink: 0 }}>??</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName}</span>
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
}

function FileRow({ fileName, isNew, isDeleted, additions, deletions, isActive, onClick }: FileRowProps) {
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
    >
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
