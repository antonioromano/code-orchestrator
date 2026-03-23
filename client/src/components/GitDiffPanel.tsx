import { useMemo, useRef, useState } from 'react';
import parseDiff from 'parse-diff';
import type { GitDiffResponse } from '@remote-orchestrator/shared';
import { DiffFileSection } from './DiffFileSection.js';

interface GitDiffPanelProps {
  diff: GitDiffResponse | null;
  theme: 'dark' | 'light';
  isLoading: boolean;
  error: string | null;
  isFullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onRefresh: () => void;
}

export function GitDiffPanel({
  diff,
  theme,
  isLoading,
  error,
  isFullscreen,
  onClose,
  onToggleFullscreen,
  onRefresh,
}: GitDiffPanelProps) {
  const isDark = theme === 'dark';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const { stagedFiles, unstagedFiles, branchFiles, totalFiles, totalAdditions, totalDeletions } = useMemo(() => {
    const staged = diff?.staged ? parseDiff(diff.staged) : [];
    const unstaged = diff?.unstaged ? parseDiff(diff.unstaged) : [];
    const branch = diff?.branch ? parseDiff(diff.branch) : [];
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
      totalFiles: staged.length + unstaged.length + branch.length,
      totalAdditions: adds,
      totalDeletions: dels,
    };
  }, [diff]);

  const defaultExpanded = totalFiles <= 20;

  const searchLower = searchQuery.toLowerCase();
  const filteredUnstaged = searchLower
    ? unstagedFiles.filter(f => (f.to ?? f.from ?? '').toLowerCase().includes(searchLower))
    : unstagedFiles;
  const filteredStaged = searchLower
    ? stagedFiles.filter(f => (f.to ?? f.from ?? '').toLowerCase().includes(searchLower))
    : stagedFiles;
  const filteredBranch = searchLower
    ? branchFiles.filter(f => (f.to ?? f.from ?? '').toLowerCase().includes(searchLower))
    : branchFiles;

  const headerBtnStyle = {
    background: 'none',
    border: 'none',
    color: isDark ? '#565f89' : '#8b8fa3',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    lineHeight: 1,
  };

  const isEmpty = !error && totalFiles === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        background: isDark ? '#1a1b26' : '#f5f5f5',
        borderLeft: isFullscreen ? 'none' : `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: isDark ? '#16161e' : '#e8e8e8',
          borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: isDark ? '#c0caf5' : '#343b58',
            }}
          >
            Git Diff
          </span>
          {!isEmpty && !error && (
            <span
              style={{
                fontSize: '11px',
                color: isDark ? '#565f89' : '#8b8fa3',
              }}
            >
              {totalFiles} file{totalFiles !== 1 ? 's' : ''}
              {totalAdditions > 0 && (
                <span style={{ color: isDark ? '#9ece6a' : '#1a7f37', marginLeft: '6px' }}>
                  +{totalAdditions}
                </span>
              )}
              {totalDeletions > 0 && (
                <span style={{ color: isDark ? '#f7768e' : '#cf222e', marginLeft: '4px' }}>
                  -{totalDeletions}
                </span>
              )}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={onRefresh}
            style={{
              ...headerBtnStyle,
              opacity: isLoading ? 0.5 : 1,
              transition: 'transform 0.3s',
              ...(isLoading ? { animation: 'none' } : {}),
            }}
            title="Refresh diff"
          >
            {'\u21BB'}
          </button>
          {totalFiles > 0 && !error && (
            <button
              onClick={() => setCollapseAllKey(k => k + 1)}
              style={headerBtnStyle}
              title="Collapse all"
            >
              {'\u2261'}
            </button>
          )}
          <button
            onClick={onToggleFullscreen}
            style={headerBtnStyle}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '\u2923' : '\u2922'}
          </button>
          <button onClick={onClose} style={headerBtnStyle} title="Close diff">
            {'\u2715'}
          </button>
        </div>
      </div>
      {totalFiles > 0 && !error && (
        <div
          style={{
            padding: '4px 12px 6px',
            background: isDark ? '#16161e' : '#e8e8e8',
            borderBottom: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            placeholder="Filter files…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '12px',
              padding: '3px 8px',
              border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
              borderRadius: '4px',
              background: isDark ? '#1a1b26' : '#fff',
              color: isDark ? '#c0caf5' : '#343b58',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Body */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
          minHeight: 0,
        }}
      >
        {error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: isDark ? '#565f89' : '#8b8fa3',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '14px' }}>{error}</span>
            <button
              onClick={onRefresh}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                borderRadius: '6px',
                background: 'transparent',
                color: isDark ? '#a9b1d6' : '#565c73',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!error && isEmpty && !isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: isDark ? '#565f89' : '#8b8fa3',
              fontSize: '14px',
            }}
          >
            No changes
          </div>
        )}

        {!error && isEmpty && isLoading && diff === null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: isDark ? '#565f89' : '#8b8fa3',
              fontSize: '14px',
            }}
          >
            Loading...
          </div>
        )}

        {!error && totalFiles > 20 && (
          <div
            style={{
              padding: '6px 12px',
              marginBottom: '8px',
              borderRadius: '6px',
              background: isDark ? '#2f2a1a' : '#fff8e6',
              color: isDark ? '#f59e0b' : '#92600a',
              fontSize: '12px',
            }}
          >
            {totalFiles} files changed — files are collapsed by default
          </div>
        )}

        {!error && filteredUnstaged.length > 0 && (
          <div>
            {stagedFiles.length > 0 && (
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isDark ? '#a9b1d6' : '#565c73',
                  textTransform: 'uppercase',
                  padding: '4px 4px 8px',
                  letterSpacing: '0.5px',
                }}
              >
                Unstaged Changes
              </div>
            )}
            {filteredUnstaged.map((file, i) => (
              <DiffFileSection
                key={`unstaged-${i}`}
                file={file}
                theme={theme}
                defaultExpanded={defaultExpanded}
                collapseAllKey={collapseAllKey}
              />
            ))}
          </div>
        )}

        {!error && filteredStaged.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: isDark ? '#a9b1d6' : '#565c73',
                textTransform: 'uppercase',
                padding: filteredUnstaged.length > 0 ? '12px 4px 8px' : '4px 4px 8px',
                letterSpacing: '0.5px',
              }}
            >
              Staged Changes
            </div>
            {filteredStaged.map((file, i) => (
              <DiffFileSection
                key={`staged-${i}`}
                file={file}
                theme={theme}
                defaultExpanded={defaultExpanded}
                collapseAllKey={collapseAllKey}
              />
            ))}
          </div>
        )}

        {!error && filteredBranch.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: isDark ? '#a9b1d6' : '#565c73',
                textTransform: 'uppercase',
                padding: (filteredUnstaged.length > 0 || filteredStaged.length > 0) ? '12px 4px 8px' : '4px 4px 8px',
                letterSpacing: '0.5px',
              }}
            >
              Branch Changes
            </div>
            {filteredBranch.map((file, i) => (
              <DiffFileSection
                key={`branch-${i}`}
                file={file}
                theme={theme}
                defaultExpanded={defaultExpanded}
                collapseAllKey={collapseAllKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
