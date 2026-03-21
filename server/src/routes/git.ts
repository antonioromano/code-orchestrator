import { Router } from 'express';
import type { SessionManager } from '../services/SessionManager.js';
import { GitService } from '../services/GitService.js';

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

  return router;
}
