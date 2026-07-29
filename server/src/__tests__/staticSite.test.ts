import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
