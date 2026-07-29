import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './debug/logger.js';

/**
 * Serves the Vite-built client from `dir` on the same origin as Socket.io, so production needs
 * no CORS and no second domain. A no-op in dev, where Vite owns :5173 and this directory does
 * not exist. Socket.io attaches to the raw HTTP server and upgrades before Express routing, so
 * the SPA catch-all below never intercepts `/socket.io/`.
 */
export function serveClient(app: Express, dir: string): boolean {
  if (!existsSync(join(dir, 'index.html'))) {
    log('life', 'client bundle absent — static serving disabled', { dir });
    return false;
  }
  app.use(express.static(dir, { maxAge: '1h', index: 'index.html' }));
  app.get('*', (_req, res) => res.sendFile(join(dir, 'index.html')));
  log('life', 'serving client bundle', { dir });
  return true;
}
