import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { serveClient } from '../staticSite.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ok</title>');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('serveClient', () => {
  it('mounts when the bundle exists', () => {
    expect(serveClient(express(), dir)).toBe(true);
  });

  it('is a no-op when the bundle is absent', () => {
    expect(serveClient(express(), join(dir, 'nope'))).toBe(false);
  });

  it('serves a deep SPA route even when the given dir is relative', async () => {
    const app = express();
    serveClient(app, relative(process.cwd(), dir));
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/some/deep/route`);
      expect(res.status).toBe(200);
    } finally {
      server.close();
    }
  });
});
