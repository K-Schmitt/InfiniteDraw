import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { CollabServer } from './CollabServer.js';
import { serveClient } from './staticSite.js';
import { log, logFilePath, installProcessHooks } from './debug/logger.js';

installProcessHooks();

const app = express();
const httpServer = createServer(app);

const PORT = process.env['PORT'] ?? 3000;

app.get('/health', (_req, res) => {
  log('net', 'GET /health');
  res.json({ status: 'ok' });
});

// Repo layout in the container: /app/client/dist and /app/server/dist/server/src/index.js.
// CLIENT_DIST overrides for other layouts.
const clientDist = process.env['CLIENT_DIST'] ?? resolve(process.cwd(), 'client/dist');
serveClient(app, clientDist);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error(`  Kill the process:  fuser -k ${PORT}/tcp`);
    console.error(`  Or use another port:  PORT=3001 npm run dev:server\n`);
    process.exit(1);
  }
  throw err;
});

new CollabServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`InfiniteDraw server listening on :${PORT}`);
  log('life', 'server listening', {
    port: PORT,
    pid: process.pid,
    node: process.version,
    logFile: logFilePath(),
  });
});
