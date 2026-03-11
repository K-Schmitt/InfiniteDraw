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

httpServer.listen(PORT, () => {
  console.log(`InfiniteDraw server listening on :${PORT}`);
});
