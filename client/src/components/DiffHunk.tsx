import type { ReactNode } from 'react';
import type parseDiff from 'parse-diff';
import { Undo2 } from 'lucide-react';
import { TriStateCheckbox } from './primitives/index.js';
import { chunkTriState } from '../hooks/useCommitMode.js';
import type { TriState } from '../hooks/useCommitMode.js';

interface CommitModeHunkProps {
  chunkIndex: number;
  chunkSelection: Set<number> | undefined;
  totalChanges: number;
  onToggleChunk: () => void;
  onToggleLine: (changeIndex: number) => void;
  onRevertChunk: () => void;
}

interface DiffHunkProps {
  chunk: parseDiff.Chunk;
  theme: 'dark' | 'light';
  searchQuery?: string;
  commitMode?: CommitModeHunkProps;
  onRevertHunk?: () => void;
  wordWrap?: boolean;
}

function highlightText(text: string, query: string): ReactNode {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const parts: ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(queryLower, last);
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark
        key={idx}
        style={{
          background: 'rgba(255, 213, 79, 0.55)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    last = idx + query.length;
    idx = lower.indexOf(queryLower, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const COLORS = {
  dark: {
    addBg: 'rgba(165,213,112,0.1)',
    addText: '#a5d570',
    addGutter: 'rgba(165,213,112,0.15)',
    addBorder: '#a5d570',
    delBg: 'rgba(255,180,171,0.1)',
    delText: '#ffb4ab',
    delGutter: 'rgba(255,180,171,0.15)',
    delBorder: '#ffb4ab',
    contextText: '#c3c6d3',
    hunkBg: '#1e1f2a',
    hunkText: '#8d909d',
    lineNum: '#8d909d',
    selectedHighlight: 'rgba(99,102,241,0.15)',
  },
  light: {
    addBg: 'rgba(165,213,112,0.12)',
    addText: '#2d6a0e',
    addGutter: 'rgba(165,213,112,0.2)',
    addBorder: '#7ab648',
    delBg: 'rgba(255,180,171,0.12)',
    delText: '#ba1a1a',
    delGutter: 'rgba(255,180,171,0.2)',
    delBorder: '#e05a4a',
    contextText: '#43474f',
    hunkBg: '#ebedf8',
    hunkText: '#747780',
    lineNum: '#747780',
    selectedHighlight: 'rgba(99,102,241,0.12)',
  },
};

function triStateToChecked(state: TriState): boolean | 'indeterminate' {
  if (state === 'all') return true;
  if (state === 'partial') return 'indeterminate';
  return false;
}

export function DiffHunk({ chunk, theme, searchQuery, commitMode, onRevertHunk, wordWrap }: DiffHunkProps) {
  const c = COLORS[theme];
  const showCommit = !!commitMode;
  const showRevert = showCommit || !!onRevertHunk;

  // Compute hunk-level tri-state
  const hunkState = showCommit
    ? chunkTriState(commitMode!.chunkSelection, commitMode!.totalChanges)
    : 'none';

  return (
    <div>
      {/* Hunk header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: showRevert ? '4px 4px 4px 8px' : '4px 12px',
          background: c.hunkBg,
          color: c.hunkText,
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          gap: showRevert ? '6px' : 0,
        }}
      >
        {showCommit && (
          <TriStateCheckbox
            checked={triStateToChecked(hunkState)}
            onChange={commitMode!.onToggleChunk}
            label={`Toggle hunk selection`}
          />
        )}
        {showRevert && (
          <button
            onClick={(e) => { e.stopPropagation(); showCommit ? commitMode!.onRevertChunk() : onRevertHunk!(); }}
            title="Revert this hunk"
            aria-label="Revert this hunk"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              minWidth: '28px',
              minHeight: '28px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              opacity: 0.85,
              flexShrink: 0,
              transition: 'opacity 0.15s, background 0.15s',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(128,128,128,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.background = 'none'; }}
          >
            <Undo2 size={11} strokeWidth={2} />
          </button>
        )}
        <span style={{ flex: 1 }}>{chunk.content}</span>
      </div>

      {/* Change rows */}
      {(() => {
        let changeIndex = 0; // tracks add/del line index for commit mode
        return chunk.changes.map((change, i) => {
          let bg = 'transparent';
          let gutterBg = 'transparent';
          let textColor = c.contextText;
          let oldLn = '';
          let newLn = '';
          let prefix = ' ';
          const isChangeLine = change.type === 'add' || change.type === 'del';
          const thisChangeIndex = isChangeLine ? changeIndex++ : -1;

          const isSelected = showCommit && isChangeLine
            ? commitMode!.chunkSelection?.has(thisChangeIndex) ?? false
            : false;

          if (change.type === 'add') {
            bg = isSelected ? c.selectedHighlight : c.addBg;
            gutterBg = c.addGutter;
            textColor = c.addText;
            newLn = String(change.ln);
            prefix = '+';
          } else if (change.type === 'del') {
            bg = isSelected ? c.selectedHighlight : c.delBg;
            gutterBg = c.delGutter;
            textColor = c.delText;
            oldLn = String(change.ln);
            prefix = '-';
          } else {
            oldLn = String(change.ln1);
            newLn = String(change.ln2);
          }

          const borderLeft = change.type === 'add'
            ? `2px solid ${c.addBorder}`
            : change.type === 'del'
            ? `2px solid ${c.delBorder}`
            : 'none';

          return (
            <div
              key={i}
              onClick={
                showCommit && isChangeLine
                  ? () => commitMode!.onToggleLine(thisChangeIndex)
                  : undefined
              }
              style={{
                display: 'flex',
                background: bg,
                borderLeft,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                lineHeight: '20px',
                cursor: showCommit && isChangeLine ? 'pointer' : undefined,
              }}
            >

              <span
                style={{
                  width: '44px',
                  minWidth: '44px',
                  textAlign: 'right',
                  padding: '0 4px',
                  color: c.lineNum,
                  background: gutterBg,
                  userSelect: 'none',
                }}
              >
                {oldLn}
              </span>
              <span
                style={{
                  width: '44px',
                  minWidth: '44px',
                  textAlign: 'right',
                  padding: '0 4px',
                  color: c.lineNum,
                  background: gutterBg,
                  userSelect: 'none',
                }}
              >
                {newLn}
              </span>
              <span
                style={{
                  width: '18px',
                  minWidth: '18px',
                  textAlign: 'center',
                  color: textColor,
                  userSelect: 'none',
                  fontWeight: 600,
                }}
              >
                {prefix}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: textColor,
                  padding: '0 8px',
                  whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                  wordBreak: wordWrap ? 'break-all' : undefined,
                  overflowWrap: wordWrap ? 'break-word' : undefined,
                  overflow: 'hidden',
                  cursor: showCommit && isChangeLine ? undefined : 'text',
                  userSelect: showCommit ? undefined : 'text',
                }}
              >
                {searchQuery ? highlightText(change.content.slice(1), searchQuery) : change.content.slice(1)}
              </span>
            </div>
          );
        });
      })()}
    </div>
  );
}
