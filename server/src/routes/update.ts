import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UpdateService } from '../services/UpdateService.js';

export function createUpdateRoutes(updateService: UpdateService): Router {
  const router = Router();

  // Returns cached update status — fast, no live API call
  router.get('/check', (_req: Request, res: Response) => {
    res.json(updateService.getStatus());
  });

  // Applies the update: guards dirty tree, runs git pull, exits process
  router.post('/apply', async (_req: Request, res: Response) => {
    const result = await updateService.applyUpdate();
    if (!result.success) {
      const status = result.error === 'Update already in progress' ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
