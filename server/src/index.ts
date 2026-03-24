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
import { createConfigRoutes, createAgentRoutes } from './routes/config.js';
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

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/sessions', createSessionRoutes(sessionManager, orderStore));
app.use('/api/fs', createFilesystemRoutes());
app.use('/api', createGitRoutes(sessionManager));
app.use('/api/ngrok', createNgrokRoutes(ngrokService, authService));
app.use('/api/auth', createAuthRoutes(authService));
app.use('/api/config', createConfigRoutes(configStore));
app.use('/api/agents', createAgentRoutes(agentRegistry));

// Socket.io
setupSocketHandler(io, sessionManager, authService);

// Start
const PORT = 5400;

async function start() {
  await sessionManager.restoreSessions();
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);

const shutdown = async () => {
  await sessionManager.shutdown();
  await ngrokService.stop();
  process.exit(0);
};
process.on('SIGINT', () => { shutdown().catch(console.error); });
process.on('SIGTERM', () => { shutdown().catch(console.error); });
