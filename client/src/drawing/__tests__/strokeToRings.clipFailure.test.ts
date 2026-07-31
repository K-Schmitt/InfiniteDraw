import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import { strokeToRings } from '../strokeToPath';
import { log } from '../../debug/logger';

// polygon-clipping throws "Unable to complete output ring" on near-degenerate input. The union in
// strokeToRings used to swallow it with a bare `catch {}`, so the only evidence of a stroke whose
// self-overlaps stopped resolving was the pixels. Forcing the throw is the only way to reach it.
vi.mock('polygon-clipping', () => ({
  default: {
    union: (): never => { throw new Error('Unable to complete output ring'); },
  },
}));

vi.mock('../../debug/logger', () => ({ log: vi.fn() }));

function brushStroke(): BrushStroke {
  const points = Array.from({ length: 12 }, (_, i) => ({ x: i * 3, y: Math.sin(i) * 4 }));
  return {
    id: 'brush-1',
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 6,
    points,
    pressures: points.map(() => 0.5),
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

describe('strokeToRings when polygon-clipping fails', () => {
  beforeEach(() => { vi.mocked(log).mockClear(); });

  it('still returns the raw outline so the stroke renders', () => {
    const rings = strokeToRings(brushStroke());
    expect(rings.length).toBe(1);
    expect(rings[0]!.length).toBeGreaterThanOrEqual(6);
  });

  it('logs the failure instead of swallowing it', () => {
    strokeToRings(brushStroke());
    expect(log).toHaveBeenCalledTimes(1);
    const [category, message, data] = vi.mocked(log).mock.calls[0]!;
    expect(category).toBe('error');
    expect(message).toContain('strokeToRings');
    expect(data).toMatchObject({ id: 'brush-1', message: 'Unable to complete output ring' });
  });
});
