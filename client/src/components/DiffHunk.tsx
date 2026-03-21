import type parseDiff from 'parse-diff';

interface DiffHunkProps {
  chunk: parseDiff.Chunk;
  theme: 'dark' | 'light';
}

const COLORS = {
  dark: {
    addBg: '#1a2f1a',
    addText: '#9ece6a',
    addGutter: '#2a3f2a',
    delBg: '#2f1a1a',
    delText: '#f7768e',
    delGutter: '#3f2a2a',
    contextText: '#a9b1d6',
    hunkBg: '#1e1f2e',
    hunkText: '#565f89',
    lineNum: '#565f89',
  },
  light: {
    addBg: '#e6ffed',
    addText: '#1a7f37',
    addGutter: '#ccffd8',
    delBg: '#ffeef0',
    delText: '#cf222e',
    delGutter: '#ffd7d5',
    contextText: '#343b58',
    hunkBg: '#f0f0f0',
    hunkText: '#8b8fa3',
    lineNum: '#8b8fa3',
  },
};

export function DiffHunk({ chunk, theme }: DiffHunkProps) {
  const c = COLORS[theme];

  return (
    <div>
      <div
        style={{
          padding: '4px 12px',
          background: c.hunkBg,
          color: c.hunkText,
          fontSize: '12px',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        }}
      >
        {chunk.content}
      </div>
      {chunk.changes.map((change, i) => {
        let bg = 'transparent';
        let gutterBg = 'transparent';
        let textColor = c.contextText;
        let oldLn = '';
        let newLn = '';
        let prefix = ' ';

        if (change.type === 'add') {
          bg = c.addBg;
          gutterBg = c.addGutter;
          textColor = c.addText;
          newLn = String(change.ln);
          prefix = '+';
        } else if (change.type === 'del') {
          bg = c.delBg;
          gutterBg = c.delGutter;
          textColor = c.delText;
          oldLn = String(change.ln);
          prefix = '-';
        } else {
          oldLn = String(change.ln1);
          newLn = String(change.ln2);
        }

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              background: bg,
              fontSize: '12px',
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              lineHeight: '20px',
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
                color: textColor,
                padding: '0 8px',
                whiteSpace: 'pre',
                overflow: 'hidden',
              }}
            >
              {change.content.slice(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
