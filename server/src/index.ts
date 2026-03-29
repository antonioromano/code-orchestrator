import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import { SessionManager } from './services/SessionManager.js';
import { OrderStore } from './persistence/OrderStore.js';
import { ConfigStore } from './persistence/ConfigStore.js';
import { AgentRegistry } from './services/AgentRegistry.js';
import { AuthService } from './services/AuthService.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createFilesystemRoutes } from './routes/filesystem.js';
import { createGitRoutes } from './routes/git.js';
import { createNgrokRoutes } from './routes/ngrok.js';
import { createAuthRoutes } from './routes/auth.js';
import { NgrokService } from './services/NgrokService.js';
import { UpdateService } from './services/UpdateService.js';
import { createConfigRoutes, createAgentRoutes } from './routes/config.js';
import { createUpdateRoutes } from './routes/update.js';
import { setupSocketHandler } from './socket/handler.js';
import { createAuthMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

// Config store & agent registry
const configStore = new ConfigStore(path.join(dataDir, 'config.json'));
const agentRegistry = new AgentRegistry();

// Session manager
const sessionManager = new SessionManager(dataDir, configStore);
sessionManager.setIo(io);

// Order store
const orderStore = new OrderStore(path.join(dataDir, 'order.json'));

// Auth service
const authService = new AuthService();
authService.setIo(io);

// Auth middleware — before routes
app.use(createAuthMiddleware(authService));

// Ngrok service
const ngrokService = new NgrokService();
ngrokService.setIo(io);
ngrokService.getAuthRequired = () => authService.enabled;
ngrokService.onDisconnect = () => authService.clearAuth();

// Update service
const updateService = new UpdateService();
updateService.setIo(io);

// Temporary screenshot-save endpoint (dev only)
import fs from 'fs';
const screenshotsDir = path.resolve(__dirname, '..', '..', 'docs', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
app.post('/api/screenshot', (req: express.Request, res: express.Response) => {
  const { name, data } = req.body as { name: string; data: string };
  const b64 = data.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(path.join(screenshotsDir, name), Buffer.from(b64, 'base64'));
  console.log(`[screenshot] saved ${name}`);
  res.json({ ok: true });
});

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/sessions', createSessionRoutes(sessionManager, orderStore, configStore));
app.use('/api/fs', createFilesystemRoutes(sessionManager));
app.use('/api', createGitRoutes(sessionManager));
app.use('/api/ngrok', createNgrokRoutes(ngrokService, authService));
app.use('/api/auth', createAuthRoutes(authService));
app.use('/api/config', createConfigRoutes(configStore));
app.use('/api/agents', createAgentRoutes(agentRegistry));
app.use('/api/update', createUpdateRoutes(updateService));

// Socket.io
setupSocketHandler(io, sessionManager, authService, updateService);

// Start
const PORT = 5400;

let listenRetries = 0;
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE' && listenRetries < 5) {
    listenRetries++;
    console.log(`Port ${PORT} in use, retrying in 500ms… (${listenRetries}/5)`);
    setTimeout(() => httpServer.listen(PORT), 500);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

async function start() {
  await sessionManager.restoreSessions();
  updateService.start();
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);

const shutdown = async () => {
  updateService.stop();
  await sessionManager.shutdown();
  await ngrokService.stop();
  process.exit(0);
};
process.on('SIGINT', () => { shutdown().catch(console.error); });
process.on('SIGTERM', () => { shutdown().catch(console.error); });
