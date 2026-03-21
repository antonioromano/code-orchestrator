import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@remote-orchestrator/shared';
import { SessionManager } from './services/SessionManager.js';
import { OrderStore } from './persistence/OrderStore.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createFilesystemRoutes } from './routes/filesystem.js';
import { createGitRoutes } from './routes/git.js';
import { setupSocketHandler } from './socket/handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

// Session manager
const sessionManager = new SessionManager(dataDir);
sessionManager.setIo(io);

// Order store
const orderStore = new OrderStore(path.join(dataDir, 'order.json'));

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/sessions', createSessionRoutes(sessionManager, orderStore));
app.use('/api/fs', createFilesystemRoutes());
app.use('/api', createGitRoutes(sessionManager));

// Socket.io
setupSocketHandler(io, sessionManager);

// Start
const PORT = 5400;

async function start() {
  await sessionManager.restoreSessions();
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);
