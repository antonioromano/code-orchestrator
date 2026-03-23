import type { SessionStatus } from '@remote-orchestrator/shared';

/** Canonical status colors — reference CSS tokens so they auto-switch with theme. */
export const STATUS_COLORS: Record<SessionStatus, string> = {
  waiting: 'var(--color-status-waiting)',
  running: 'var(--color-status-running)',
  idle:    'var(--color-status-idle)',
  exited:  'var(--color-status-exited)',
};

/** Human-readable status labels. */
export const STATUS_LABELS: Record<SessionStatus, string> = {
  waiting: 'Waiting for input',
  running: 'Running',
  idle:    'Idle',
  exited:  'Exited',
};

/** Box-shadow glows for session card status — combines border ring + ambient glow. */
export const STATUS_GLOW_SHADOWS: Record<SessionStatus, string> = {
  running: '0 0 0 2px #aec6ff, 0 0 12px rgba(174,198,255,0.25)',
  waiting: '0 0 0 2px #f59e0b, 0 0 12px rgba(245,158,11,0.25)',
  idle:    '0 0 0 2px #a5d570, 0 0 10px rgba(165,213,112,0.2)',
  exited:  '0 0 0 1px rgba(107,114,128,0.3)',
};
