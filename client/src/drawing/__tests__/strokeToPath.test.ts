import { describe, it, expect } from 'vitest';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import { strokeToOutline, strokeToRings, projectToScreen } from '../strokeToPath';

const BASE_SIZE = 8;

// a short wiggly screen gesture — short strokes are the ones that broke first at high zoom
const SCREEN_GESTURE: Array<[number, number]> = Array.from({ length: 41 }, (_, i) => {
  const t = i / 40;
  return [200 + t * 120, 300 + Math.sin(t * Math.PI * 3) * 25];
});

// reproduces BrushTool + PixiApp: world = screen / zoom + camera, size = BASE_SIZE / zoom
function strokeAtZoom(zoom: number, camera: { x: number; y: number }): BrushStroke {
  return {
    id: `z${zoom}`,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: BASE_SIZE / zoom,
    points: SCREEN_GESTURE.map(([sx, sy]) => ({ x: sx / zoom + camera.x, y: sy / zoom + camera.y })),
    pressures: SCREEN_GESTURE.map(() => 0.5),
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function screenBox(zoom: number, camera: { x: number; y: number }): Box {
  const outline = strokeToOutline(strokeAtZoom(zoom, camera));
  const screen = projectToScreen(outline, camera, zoom);
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < screen.length; i += 2) {
    box.minX = Math.min(box.minX, screen[i]!);
    box.maxX = Math.max(box.maxX, screen[i]!);
    box.minY = Math.min(box.minY, screen[i + 1]!);
    box.maxY = Math.max(box.maxY, screen[i + 1]!);
  }
  return box;
}

describe('strokeToOutline scale invariance', () => {
  // pivot stays near a fixed world point as zoom grows, mirroring zoomAt()
  const cameraAt = (zoom: number): { x: number; y: number } => ({ x: -260 / zoom, y: -300 / zoom });
  const reference = screenBox(1, cameraAt(1));

  // regression guard for the perfect-freehand absolute-threshold bug (broke past ~×10)
  for (const zoom of [10, 50, 100, 1000, 1_000_000]) {
    it(`matches the ×1 outline on screen at zoom ×${zoom}`, () => {
      const box = screenBox(zoom, cameraAt(zoom));
      expect(box.minX).toBeCloseTo(reference.minX, 0);
      expect(box.minY).toBeCloseTo(reference.minY, 0);
      expect(box.maxX).toBeCloseTo(reference.maxX, 0);
      expect(box.maxY).toBeCloseTo(reference.maxY, 0);
    });
  }

  it('returns empty for degenerate sizes', () => {
    expect(strokeToOutline({ ...strokeAtZoom(1, cameraAt(1)), size: 0 })).toEqual([]);
  });
});

describe('strokeToRings for filled strokes', () => {
  it('fills the raw polygon directly instead of the perfect-freehand outline', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const filled: BrushStroke = {
      id: 'f',
      type: StrokeType.RECTANGLE,
      color: { r: 0, g: 0, b: 0, a: 255 },
      size: 8,
      points: square,
      pressures: square.map(() => 1),
      layerId: 'default',
      createdAt: 0,
      anchor: originAnchor(),
      zIndex: 0,
      cellBbox: originBbox(),
      filled: true,
    };
    expect(strokeToRings(filled)).toEqual([[0, 0, 10, 0, 10, 10, 0, 10]]);
  });
});
