/**
 * Entry point — Step 1 stub.
 * Full Socket.io server + room management implemented in Step 4.
 */

import express from 'express';
import { createServer } from 'node:http';

const app = express();
const httpServer = createServer(app);

const PORT = process.env['PORT'] ?? 3000;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error(`  Kill the process:  fuser -k ${PORT}/tcp`);
    console.error(`  Or use another port:  PORT=3001 npm run dev:server\n`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, () => {
  console.log(`InfiniteDraw server listening on :${PORT}`);
});
