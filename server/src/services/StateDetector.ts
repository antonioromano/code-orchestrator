import type { SessionStatus } from '@remote-orchestrator/shared';

const STRIP_ANSI = /\x1b\[[0-9;?>=]*[a-zA-Z~]|\x1b\].*?(\x07|\x1b\\)|\x1b[()#][A-Z0-9]|\x1b[\x20-\x2f]*[\x30-\x7e]|\r/g;

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
    const stripped = data.replace(STRIP_ANSI, '').replace(/\x1b/g, '');
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
    if (this.promptPatterns.some(p => p.test(tail))) {
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
