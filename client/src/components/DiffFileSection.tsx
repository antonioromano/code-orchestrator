import { useState, useMemo, useEffect } from 'react';
import type parseDiff from 'parse-diff';
import { DiffHunk } from './DiffHunk.js';

const MAX_LINES_BEFORE_TRUNCATE = 500;

interface DiffFileSectionProps {
  file: parseDiff.File;
  theme: 'dark' | 'light';
  defaultExpanded: boolean;
  collapseAllKey?: number;
}

export function DiffFileSection({ file, theme, defaultExpanded, collapseAllKey }: DiffFileSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (collapseAllKey) setExpanded(false);
  }, [collapseAllKey]);
  const isDark = theme === 'dark';

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
        border: `1px solid ${isDark ? '#2f3549' : '#d0d0d0'}`,
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
          background: isDark ? '#16161e' : '#e8e8e8',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            color: isDark ? '#565f89' : '#8b8fa3',
            width: '12px',
            textAlign: 'center',
          }}
        >
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
        <span
          style={{
            fontSize: '12px',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            color: isDark ? '#c0caf5' : '#343b58',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName || 'unknown'}
        </span>
        {isNew && (
          <span style={{ fontSize: '10px', color: '#9ece6a', fontWeight: 600 }}>NEW</span>
        )}
        {isDeleted && (
          <span style={{ fontSize: '10px', color: '#f7768e', fontWeight: 600 }}>DELETED</span>
        )}
        <span style={{ fontSize: '11px', display: 'flex', gap: '6px', flexShrink: 0 }}>
          {file.additions > 0 && (
            <span style={{ color: isDark ? '#9ece6a' : '#1a7f37' }}>+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span style={{ color: isDark ? '#f7768e' : '#cf222e' }}>-{file.deletions}</span>
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
                color: isDark ? '#565f89' : '#8b8fa3',
                fontStyle: 'italic',
              }}
            >
              Binary file changed
            </div>
          ) : (
            <>
              {file.chunks.map((chunk, i) => {
                if (isTruncated) {
                  // Count lines up to this chunk
                  let linesBefore = 0;
                  for (let j = 0; j < i; j++) {
                    linesBefore += file.chunks[j].changes.length;
                  }
                  if (linesBefore >= MAX_LINES_BEFORE_TRUNCATE) return null;
                }
                return <DiffHunk key={i} chunk={chunk} theme={theme} />;
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
                      border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                      borderRadius: '4px',
                      background: 'transparent',
                      color: isDark ? '#7aa2f7' : '#3b82f6',
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
