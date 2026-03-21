import { useState } from 'react';
import type parseDiff from 'parse-diff';
import { DiffHunk } from './DiffHunk.js';

interface DiffFileSectionProps {
  file: parseDiff.File;
  theme: 'dark' | 'light';
  defaultExpanded: boolean;
}

export function DiffFileSection({ file, theme, defaultExpanded }: DiffFileSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isDark = theme === 'dark';

  const fileName = file.to === '/dev/null' ? file.from : file.to;
  const isBinary = file.chunks.length === 0 && (file.additions === 0 && file.deletions === 0);
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
            file.chunks.map((chunk, i) => (
              <DiffHunk key={i} chunk={chunk} theme={theme} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
