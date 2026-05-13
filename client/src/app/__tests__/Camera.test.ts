import { describe, it, expect, beforeEach } from 'vitest';
import { CameraController } from '../Camera';

describe('CameraController', () => {
  let camera: CameraController;

  beforeEach(() => {
    camera = new CameraController();
  });

  it('starts at origin with zoom 1', () => {
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.zoom).toBe(1);
  });

  it('toWorld is identity at default state', () => {
    expect(camera.toWorld(100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('toWorld and toScreen are inverses', () => {
    camera.pan(-300, -150);
    camera.zoomAt(2, 0, 0);

    const world = camera.toWorld(80, 60);
    const back = camera.toScreen(world.x, world.y);
    expect(back.x).toBeCloseTo(80);
    expect(back.y).toBeCloseTo(60);
  });

  it('pan shifts camera origin in world space', () => {
    camera.pan(100, 0); // drag right 100px at zoom 1
    expect(camera.x).toBeCloseTo(-100);
    expect(camera.y).toBe(0);
  });

  it('pan accounts for zoom', () => {
    camera.zoomAt(2, 0, 0); // zoom 2x at origin
    camera.pan(100, 0);     // 100 screen px = 50 world units
    expect(camera.x).toBeCloseTo(-50);
  });

  it('zoomAt preserves the world point under the cursor', () => {
    // World point (50, 50) is at screen (50, 50) before zoom.
    const worldBefore = camera.toWorld(50, 50);
    camera.zoomAt(2, 50, 50);
    const worldAfter = camera.toWorld(50, 50);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it('zoom is unbounded — grows and shrinks far beyond old limits', () => {
    for (let i = 0; i < 50; i++) camera.zoomAt(10, 0, 0);
    expect(camera.zoom).toBeGreaterThan(1e40); // no upper wall

    camera.restore({ x: 0, y: 0, zoom: 1 });
    for (let i = 0; i < 50; i++) camera.zoomAt(0.1, 0, 0);
    // Old MIN_ZOOM was 0.01. Zoom now reaches the anti-zero guard (1e-10).
    expect(camera.zoom).toBeLessThan(0.0001);
    expect(camera.zoom).toBeGreaterThan(0); // never reaches zero (div-by-zero guard)
  });

  it('getViewport matches world-space area', () => {
    const vp = camera.getViewport(800, 600);
    expect(vp.x).toBe(0);
    expect(vp.y).toBe(0);
    expect(vp.width).toBe(800);
    expect(vp.height).toBe(600);
  });

  it('getSnapshot / restore round-trips state', () => {
    camera.pan(40, 80);
    camera.zoomAt(1.5, 0, 0);
    const snap = camera.getSnapshot();
    camera.pan(999, 999);
    camera.restore(snap);
    expect(camera.x).toBeCloseTo(snap.x);
    expect(camera.y).toBeCloseTo(snap.y);
    expect(camera.zoom).toBeCloseTo(snap.zoom);
  });
});
