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

/** Ambient glow shadows for session card status (used alongside a solid border). */
export const STATUS_GLOW_SHADOWS: Record<SessionStatus, string> = {
  running: '0 0 10px rgba(174,198,255,0.4)',
  waiting: '0 0 10px rgba(245,158,11,0.4)',
  idle:    '0 0 8px rgba(165,213,112,0.35)',
  exited:  'none',
};
