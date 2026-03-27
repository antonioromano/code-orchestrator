import { Router } from 'express';
import type { SessionManager } from '../services/SessionManager.js';
import { GitService } from '../services/GitService.js';
import type { PatchSelectionRequest, CommitRequest } from '@remote-orchestrator/shared';

export function createGitRoutes(manager: SessionManager): Router {
  const router = Router();
  const gitService = new GitService();

  router.get('/sessions/:id/diff', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const diff = await gitService.getDiff(session.folderPath);

    if (diff.error === 'Not a git repository') {
      res.status(400).json(diff);
      return;
    }

    if (diff.error) {
      res.status(500).json(diff);
      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.json(diff);
  });

  router.post('/sessions/:id/git-add', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { filePath } = req.body as { filePath?: string };
    if (!filePath) {
      res.status(400).json({ error: 'filePath required' });
      return;
    }

    const result = await gitService.stageFile(session.folderPath, filePath);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/sessions/:id/git-stage-patch', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const selection = req.body as PatchSelectionRequest;
    if (!selection?.filePath || !Array.isArray(selection?.chunks)) {
      res.status(400).json({ success: false, error: 'Invalid selection descriptor' });
      return;
    }

    const result = await gitService.stagePatch(session.folderPath, selection);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/sessions/:id/git-discard-patch', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const selection = req.body as PatchSelectionRequest;
    if (!selection?.filePath || !Array.isArray(selection?.chunks)) {
      res.status(400).json({ success: false, error: 'Invalid selection descriptor' });
      return;
    }

    const result = await gitService.discardPatch(session.folderPath, selection);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/sessions/:id/git-undo-discard/:undoId', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const result = await gitService.undoDiscard(req.params.undoId);
    res.status(result.success ? 200 : 404).json(result);
  });

  router.post('/sessions/:id/git-commit', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { message, amend } = req.body as CommitRequest;
    if (!message?.trim()) {
      res.status(400).json({ success: false, error: 'Commit message required' });
      return;
    }

    const result = await gitService.commit(session.folderPath, message, !!amend);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/sessions/:id/git-unstage', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { filePath } = req.body as { filePath?: string };
    if (!filePath) {
      res.status(400).json({ success: false, error: 'filePath required' });
      return;
    }

    const result = await gitService.unstageFile(session.folderPath, filePath);
    res.status(result.success ? 200 : 400).json(result);
  });

  router.get('/sessions/:id/git-log', async (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const result = await gitService.getLastCommit(session.folderPath);
    res.json(result);
  });

  return router;
}
