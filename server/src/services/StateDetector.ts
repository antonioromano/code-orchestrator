import type { SessionStatus } from '@remote-orchestrator/shared';

// ECMA-48 compliant ANSI escape sequence stripper.
// The old CSI class [0-9;?>=]* was missing ':' (0x3A) and '<' (0x3C), causing
// modern sequences like \x1b[38:2:255:0:0m (colon-separated 24-bit color) to
// fail stripping and leave artifacts ([38:2:255:0:0m) in the buffer.
const STRIP_ANSI = new RegExp(
  [
    '\\x1b\\[[\\x30-\\x3f]*[\\x20-\\x2f]*[\\x40-\\x7e]', // CSI: full param range (0x30-0x3F incl. : and <)
    '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)',           // OSC sequences
    '\\x1b[P_^][^\\x1b]*\\x1b\\\\',                        // DCS, APC, PM string sequences
    '\\x1b[()#][A-Z0-9]',                                   // Character set designations
    '\\x1b[\\x20-\\x2f]*[\\x30-\\x7e]',                    // Other ESC sequences (Fp, Fe, Fs)
    '\\r',                                                   // Carriage returns
  ].join('|'),
  'g'
);

const AGENT_PROMPT_PATTERNS: Record<string, RegExp[]> = {
  claude: [
    />\s*$/,
    /\(y\/n\)\s*$/i,
    /\[Y\/n\]\s*$/,
    /\[y\/N\]\s*$/,
    /Press Enter to continue/i,
    /Allow once/i,
    /Do you want to/i,
    /Would you like to/i,
    /Esc to cancel/i,
    /Enter to confirm/i,
    /\?\s*$/,
    /Do you want to proceed/i,
    /don't ask again for/i,
    /auto-accept edits/i,
    /manually approve edits/i,
    /Tell Claude what to change/i,
    /shift\+tab to approve/i,
    /always allow access/i,
  ],
  gemini: [
    />\s*$/,
    /\(y\/n\)\s*$/i,
    /\[Y\/n\]\s*$/,
    /\[y\/N\]\s*$/,
    /Yes\s*\/\s*No/i,
    /Confirm/i,
  ],
  codex: [
    />\s*$/,
    /\(y\/n\)\s*$/i,
    /\[Y\/n\]\s*$/,
    /\[y\/N\]\s*$/,
    /approve/i,
  ],
};

const DEFAULT_PROMPT_PATTERNS: RegExp[] = [
  />\s*$/,
  /\$\s*$/,
  /#\s*$/,
  /\(y\/n\)\s*$/i,
  /\[Y\/n\]\s*$/,
  /\[y\/N\]\s*$/,
];

export class StateDetector {
  private buffer = '';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentStatus: SessionStatus = 'running';
  private onStatusChange: (status: SessionStatus) => void;
  private idleDelayMs: number;
  private promptPatterns: RegExp[];

  constructor(onStatusChange: (status: SessionStatus) => void, agentType: string = 'claude', idleDelayMs = 500) {
    this.onStatusChange = onStatusChange;
    this.idleDelayMs = idleDelayMs;
    this.promptPatterns = AGENT_PROMPT_PATTERNS[agentType] ?? DEFAULT_PROMPT_PATTERNS;
  }

  feed(data: string): void {
    // Replace escape sequences with a space (not empty string) to preserve word
    // boundaries. TUI apps like Claude Code's Ink renderer use cursor positioning
    // instead of literal space characters — stripping to '' merges words together,
    // making prompt patterns like /Do you want to/ fail to match.
    const stripped = data
      .replace(STRIP_ANSI, ' ')
      .replace(/\x1b/g, '')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
    this.buffer += stripped;

    // Keep buffer at reasonable size — must be larger than the tail check window (1500)
    if (this.buffer.length > 8000) {
      this.buffer = this.buffer.slice(-4000);
    }

    // Reset idle timer
    if (this.idleTimer) clearTimeout(this.idleTimer);

    // Check for prompt patterns immediately — handles cases where periodic output
    // (e.g. Claude Code's status bar re-rendering every second) prevents the idle
    // timer from ever firing, keeping the status stuck as 'running'.
    // Use 1500 chars: frequent small status bar updates accumulate and push the
    // actual prompt text beyond a 500-char window within seconds.
    const tail = this.buffer.slice(-1500).trim();
    const matched = this.promptPatterns.some(p => p.test(tail));
    if (process.env['DEBUG_STATE']) {
      console.log(`[StateDetector] matched=${matched} tail(last200)=${JSON.stringify(tail.slice(-200))}`);
    }
    if (matched) {
      this.updateStatus('waiting');
    } else {
      this.updateStatus('running');
    }

    // Also check after output settles as a fallback
    this.idleTimer = setTimeout(() => {
      this.checkForPrompt();
    }, this.idleDelayMs);
  }

  private checkForPrompt(): void {
    const tail = this.buffer.slice(-1500).trim();

    for (const pattern of this.promptPatterns) {
      if (pattern.test(tail)) {
        this.updateStatus('waiting');
        return;
      }
    }

    // Output stopped but no prompt detected — idle/done
    this.updateStatus('idle');
  }

  private updateStatus(status: SessionStatus): void {
    if (status !== this.currentStatus) {
      this.currentStatus = status;
      this.onStatusChange(status);
    }
  }

  getStatus(): SessionStatus {
    return this.currentStatus;
  }

  setExited(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.updateStatus('exited');
  }

  destroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }
}
