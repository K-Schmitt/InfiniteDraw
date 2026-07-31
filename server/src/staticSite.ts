import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { log } from './debug/logger.js';

/**
 * Serves the Vite-built client from `dir` on the same origin as Socket.io, so production needs
 * no CORS and no second domain. A no-op in dev, where Vite owns :5173 and this directory does
 * not exist. Socket.io attaches to the raw HTTP server and upgrades before Express routing, so
 * the SPA catch-all below never intercepts `/socket.io/`.
 *
 * `dir` is resolved to an absolute path before use: `res.sendFile` throws `TypeError: path must
 * be absolute` for a relative path with no `root` option, so an operator setting `CLIENT_DIST`
 * to a relative value would otherwise get a working `/` (served by `express.static`, which
 * resolves its own root internally) while every other SPA route 500s.
 */
export function serveClient(app: Express, dir: string): boolean {
  const root = resolve(dir);
  if (!existsSync(join(root, 'index.html'))) {
    log('life', 'client bundle absent — static serving disabled', { dir: root });
    return false;
  }
  // index: false — index.html must never be cached like a hashed asset (see below), so every
  // request for it, including the "/" case express.static would otherwise auto-serve, falls
  // through to the catch-all route instead.
  app.use(express.static(root, { maxAge: '1h', index: false }));
  // WARNING: '*' is a catch-all — any Express route registered AFTER serveClient() runs (e.g. a
  // future REST endpoint) is unreachable, because this matches first. Mount API routes before
  // calling serveClient, or give them a prefix this catch-all is taught to skip.
  app.get('*', (_req, res) => {
    // index.html references content-hashed asset filenames, so caching it would pin clients to
    // a stale bundle after every deploy until the cache expired — unlike the hashed assets
    // above, it must always be revalidated.
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(root, 'index.html'));
  });
  log('life', 'serving client bundle', { dir: root });
  return true;
}
