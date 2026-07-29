import { describe, it, expect } from 'vitest';
import { StrokeType, BlendMode, MIN_ZOOM, MAX_ZOOM, DEFAULT_CAMERA } from '@shared/index.js';

describe('shared type barrel', () => {
  it('re-exports enums as values exactly once', () => {
    expect(StrokeType.BRUSH).toBeDefined();
    expect(BlendMode.NORMAL).toBeDefined();
  });

  it('re-exports the zoom guard rails used by the camera', () => {
    expect(MIN_ZOOM).toBeGreaterThan(0);
    expect(MAX_ZOOM).toBeGreaterThan(MIN_ZOOM);
    expect(DEFAULT_CAMERA.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});
