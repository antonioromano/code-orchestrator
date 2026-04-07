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
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private runningTimer: ReturnType<typeof setTimeout> | null = null;
  private feedCount = 0;
  private currentStatus: SessionStatus = 'running';
  private pendingStatus: SessionStatus | null = null;
  private onStatusChange: (status: SessionStatus) => void;
  private idleDelayMs: number;
  private debounceMs: number;
  private promptPatterns: RegExp[];

  constructor(onStatusChange: (status: SessionStatus) => void, agentType: string = 'claude', idleDelayMs = 800) {
    this.onStatusChange = onStatusChange;
    this.idleDelayMs = idleDelayMs;
    this.debounceMs = 300;
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

    // Only check for prompt patterns here — never set 'running' directly from
    // feed(). Periodic re-renders (status bar, resize redraws) produce small
    // output bursts that don't mean the agent is actively working. Instead,
    // 'running' is set only after sustained output (see runningTimer below).
    const tail = this.buffer.slice(-1500).trim();
    const matched = this.promptPatterns.some(p => p.test(tail));
    if (process.env['DEBUG_STATE']) {
      console.log(`[StateDetector] matched=${matched} tail(last200)=${JSON.stringify(tail.slice(-200))}`);
    }
    if (matched) {
      this.scheduleStatus('waiting');
    }

    // Track sustained output — only transition to 'running' if we receive
    // multiple feed() calls within a short window, indicating real activity
    // rather than a one-off re-render.
    this.feedCount++;
    if (this.runningTimer) clearTimeout(this.runningTimer);
    this.runningTimer = setTimeout(() => {
      // If we got several feed() calls in quick succession and no prompt
      // was matched, that's real output → mark as running.
      if (this.feedCount >= 3 && !matched) {
        this.scheduleStatus('running');
      }
      this.feedCount = 0;
      this.runningTimer = null;
    }, 150);

    // Check after output settles for idle/waiting detection
    this.idleTimer = setTimeout(() => {
      this.checkForPrompt();
    }, this.idleDelayMs);
  }

  private checkForPrompt(): void {
    const tail = this.buffer.slice(-1500).trim();

    for (const pattern of this.promptPatterns) {
      if (pattern.test(tail)) {
        this.scheduleStatus('waiting');
        return;
      }
    }

    // Output stopped but no prompt detected — idle/done.
    // Goes through debounce so that a brief pause followed by more output
    // (e.g. startup renders, status bar repaints) doesn't flicker to idle.
    this.scheduleStatus('idle');
  }

  /**
   * Debounced status scheduling — prevents rapid flickering by requiring the
   * desired status to remain consistent for `debounceMs` before emitting.
   */
  private scheduleStatus(status: SessionStatus): void {
    // If this is already what we'd emit, nothing to do
    if (status === this.currentStatus && this.pendingStatus === null) return;

    // If the pending status is the same, let the existing timer run
    if (status === this.pendingStatus) return;

    this.pendingStatus = status;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.pendingStatus !== null && this.pendingStatus !== this.currentStatus) {
        this.currentStatus = this.pendingStatus;
        this.onStatusChange(this.currentStatus);
      }
      this.pendingStatus = null;
    }, this.debounceMs);
  }

  /** Immediate status update — bypasses debounce (used for exited, idle from timer). */
  private updateStatus(status: SessionStatus): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.pendingStatus = null;
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
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.runningTimer) clearTimeout(this.runningTimer);
  }
}
