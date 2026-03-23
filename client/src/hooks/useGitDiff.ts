import { useState, useEffect, useCallback, useRef } from 'react';
import type { GitDiffResponse, SessionStatus } from '@remote-orchestrator/shared';
import { api } from '../services/api.js';

const POLL_INTERVAL_MS = 3000;

interface UseGitDiffOptions {
  sessionId: string;
  isOpen: boolean;
  sessionStatus: SessionStatus;
}

interface UseGitDiffResult {
  diff: GitDiffResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGitDiff({ sessionId, isOpen, sessionStatus }: UseGitDiffOptions): UseGitDiffResult {
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevDiffRef = useRef<string>('');
  const fetchingRef = useRef(false);

  const fetchDiff = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setIsLoading(true);
      const result = await api.getSessionDiff(sessionId);

      if (result.error) {
        setError(result.error);
        setDiff(result);
      } else {
        setError(null);
        // Only update state if diff content actually changed
        const newKey = result.unstaged + '||' + result.staged + '||' + result.branch;
        if (newKey !== prevDiffRef.current) {
          prevDiffRef.current = newKey;
          setDiff(result);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch diff');
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [sessionId]);

  // Fetch on open
  useEffect(() => {
    if (!isOpen) {
      prevDiffRef.current = '';
      return;
    }
    fetchDiff();
  }, [isOpen, fetchDiff]);

  // Poll when open and session is running
  useEffect(() => {
    if (!isOpen || sessionStatus !== 'running') return;

    const interval = setInterval(fetchDiff, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOpen, sessionStatus, fetchDiff]);

  return { diff, isLoading, error, refresh: fetchDiff };
}
