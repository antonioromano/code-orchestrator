import { useState, useMemo, useEffect } from 'react';
import type parseDiff from 'parse-diff';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DiffHunk } from './DiffHunk.js';
import { TriStateCheckbox } from './primitives/index.js';
import type { FileSelection, FileMeta, TriState } from '../hooks/useCommitMode.js';

const MAX_LINES_BEFORE_TRUNCATE = 500;

interface CommitModeFileSectionProps {
  fileSelection: FileSelection | undefined;
  fileMeta: FileMeta;
  fileTriState: TriState;
  onToggleFile: () => void;
  onToggleChunk: (chunkIndex: number, totalChanges: number) => void;
  onToggleLine: (chunkIndex: number, changeIndex: number) => void;
  onRevertChunk: (chunkIndex: number, totalChanges: number) => void;
  isNarrow: boolean; // narrow layout: file-level only
}

interface DiffFileSectionProps {
  file: parseDiff.File;
  theme: 'dark' | 'light';
  defaultExpanded: boolean;
  collapseAllKey?: number;
  searchQuery?: string;
  commitMode?: CommitModeFileSectionProps;
  forceShowFull?: boolean;
  wordWrap?: boolean;
  onRevertChunk?: (chunkIndex: number, totalChanges: number) => void;
}

export function DiffFileSection({ file, theme, defaultExpanded, collapseAllKey, searchQuery, commitMode, forceShowFull, wordWrap, onRevertChunk }: DiffFileSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showFull, setShowFull] = useState(forceShowFull ?? false);

  useEffect(() => {
    if (collapseAllKey) setExpanded(false);
  }, [collapseAllKey]);

  useEffect(() => {
    if (forceShowFull) setShowFull(true);
  }, [forceShowFull]);

  const fileName = file.to === '/dev/null' ? file.from : file.to;
  const isBinary = file.chunks.length === 0 && (file.additions === 0 && file.deletions === 0);

  const totalLines = useMemo(
    () => file.chunks.reduce((sum, c) => sum + c.changes.length, 0),
    [file.chunks],
  );
  const isTruncated = !showFull && totalLines > MAX_LINES_BEFORE_TRUNCATE;
  const isNew = file.new;
  const isDeleted = file.deleted;

  return (
    <div
      style={{
        borderRadius: '6px',
        border: '1px solid var(--color-border-base)',
        overflow: 'hidden',
        marginBottom: '8px',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'var(--color-bg-elevated)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* File-level checkbox in commit mode */}
        {commitMode && (
          <TriStateCheckbox
            checked={
              commitMode.fileTriState === 'all' ? true :
              commitMode.fileTriState === 'partial' ? 'indeterminate' :
              false
            }
            onChange={commitMode.onToggleFile}
            label={`Toggle ${fileName} selection`}
          />
        )}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            width: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          {expanded
            ? <ChevronDown size={12} strokeWidth={2} />
            : <ChevronRight size={12} strokeWidth={2} />}
        </span>
        <span
          style={{
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName || 'unknown'}
        </span>
        {isNew && (
          <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>NEW</span>
        )}
        {isDeleted && (
          <span style={{ fontSize: '10px', color: 'var(--color-error)', fontWeight: 600 }}>DELETED</span>
        )}
        <span style={{ fontSize: '11px', display: 'flex', gap: '6px', flexShrink: 0 }}>
          {file.additions > 0 && (
            <span style={{ color: 'var(--color-success)' }}>+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span style={{ color: 'var(--color-error)' }}>-{file.deletions}</span>
          )}
        </span>
      </div>
      {expanded && (
        <div style={{ overflow: 'auto' }}>
          {isBinary ? (
            <div
              style={{
                padding: '12px',
                fontSize: '12px',
                color: 'var(--color-text-muted)',
                fontStyle: 'italic',
              }}
            >
              Binary file changed
            </div>
          ) : (
            <>
              {commitMode?.isNarrow && (
                <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-base)', fontStyle: 'italic' }}>
                  Widen panel for line-level selection
                </div>
              )}
              {file.chunks.map((chunk, i) => {
                if (isTruncated) {
                  let linesBefore = 0;
                  for (let j = 0; j < i; j++) {
                    linesBefore += file.chunks[j].changes.length;
                  }
                  if (linesBefore >= MAX_LINES_BEFORE_TRUNCATE) return null;
                }

                // Count add/del changes in this chunk for tri-state
                const totalChanges = chunk.changes.filter(c => c.type === 'add' || c.type === 'del').length;

                return (
                  <DiffHunk
                    key={i}
                    chunk={chunk}
                    theme={theme}
                    searchQuery={searchQuery}
                    commitMode={
                      commitMode && !commitMode.isNarrow
                        ? {
                            chunkIndex: i,
                            chunkSelection: commitMode.fileSelection?.get(i),
                            totalChanges,
                            onToggleChunk: () => commitMode.onToggleChunk(i, totalChanges),
                            onToggleLine: (ci) => commitMode.onToggleLine(i, ci),
                            onRevertChunk: () => commitMode.onRevertChunk(i, totalChanges),
                          }
                        : undefined
                    }
                    onRevertHunk={!commitMode && onRevertChunk ? () => onRevertChunk(i, totalChanges) : undefined}
                    wordWrap={wordWrap}
                  />
                );
              })}
              {isTruncated && (
                <div
                  style={{
                    padding: '8px 12px',
                    textAlign: 'center',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFull(true);
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: '11px',
                      border: '1px solid var(--color-border-base)',
                      borderRadius: '4px',
                      background: 'transparent',
                      color: 'var(--color-accent)',
                      cursor: 'pointer',
                    }}
                  >
                    Show full diff ({totalLines} lines)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
