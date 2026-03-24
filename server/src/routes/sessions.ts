import { Router } from 'express';
import type { SessionManager } from '../services/SessionManager.js';
import type { OrderStore } from '../persistence/OrderStore.js';
import type { CreateSessionRequest } from '@remote-orchestrator/shared';

export function createSessionRoutes(manager: SessionManager, orderStore: OrderStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(manager.getAllSessions());
  });

  router.get('/order', async (_req, res) => {
    const order = await orderStore.load();
    res.json({ order });
  });

  router.put('/order', async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'order must be an array of session IDs' });
      return;
    }
    await orderStore.save(order);
    res.json({ order });
  });

  router.get('/:id', (req, res) => {
    const session = manager.getSessionInfo(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  router.post('/', async (req, res) => {
    const { folderPath, name, agentType } = req.body as CreateSessionRequest;

    if (!folderPath) {
      res.status(400).json({ error: 'folderPath is required' });
      return;
    }

    try {
      const session = await manager.createSession(folderPath, name, agentType);
      res.status(201).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      res.status(400).json({ error: message });
    }
  });

  router.patch('/:id/restart', async (req, res) => {
    try {
      const session = await manager.restartSession(req.params.id);
      res.json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restart session';
      res.status(404).json({ error: message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await manager.destroySession(req.params.id);
      res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      res.status(404).json({ error: message });
    }
  });

  return router;
}
