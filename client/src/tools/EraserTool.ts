import { Graphics } from 'pixi.js';
import type { BrushStroke, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import type { BoundingBox } from '../drawing/Culling';
import { strokeToRings } from '../drawing/strokeToPath';
import { eraserStamp, subtractStamp } from '../drawing/eraseGeometry';
import { buildStroke } from './strokeFactory';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

const CURSOR_COLOR = 0x999999;

type Pair = [number, number];

/**
 * Vector eraser. Subtracts a capsule-shaped stamp (swept under the cursor) from each
 * stroke's rendered area — erasing exactly what's under the eraser, anywhere on a stroke
 * or fill, live, and recorded as a single undo step.
 */
export class EraserTool implements Tool {
  readonly preview = new Graphics();
  private last: Point | null = null;
  private cursor: Point | null = null;
  private worldRadius = 1;
  private erasing = false;

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.erasing = true;
    this.worldRadius = this.settings.size / 2 / ctx.zoom;
    this.cursor = { ...ctx.world };
    this.eraseStep([ctx.world]);
    this.last = { ...ctx.world };
  }

  onMove(ctx: ToolContext): void {
    this.cursor = { ...ctx.world };
    this.worldRadius = this.settings.size / 2 / ctx.zoom;
    if (!this.erasing || !this.last) return;
    this.eraseStep([this.last, ctx.world]);
    this.last = { ...ctx.world };
  }

  onUp(): void {
    if (this.erasing) this.api.eraseEnd();
    this.erasing = false;
    this.last = null;
  }

  cancel(): void {
    if (this.erasing) this.api.eraseEnd();
    this.erasing = false;
    this.last = null;
    this.cursor = null;
    this.preview.clear();
  }

  refreshPreview(camera: Camera): void {
    this.preview.clear();
    if (!this.cursor) return;
    const cx = (this.cursor.x - camera.x) * camera.zoom;
    const cy = (this.cursor.y - camera.y) * camera.zoom;
    this.preview.circle(cx, cy, this.worldRadius * camera.zoom).stroke({ color: CURSOR_COLOR, width: 1 });
  }

  private eraseStep(path: Point[]): void {
    const stamp = eraserStamp(path, this.worldRadius);
    const bbox = expand(pathBBox(path), this.worldRadius);
    const removeIds: string[] = [];
    const additions: BrushStroke[] = [];
    for (const stroke of this.api.strokesNear(bbox)) {
      const result = subtractStamp(strokeToRings(stroke), stamp);
      if (result === null) continue; // stamp didn't touch this stroke
      removeIds.push(stroke.id);
      for (const poly of result) additions.push(remnant(poly, stroke));
    }
    if (removeIds.length > 0) this.api.eraseLive(removeIds, additions);
  }
}

// a leftover polygon (outer ring + holes) becomes a filled stroke keeping the original color
function remnant(poly: Pair[][], source: BrushStroke): BrushStroke {
  return buildStroke({
    type: StrokeType.BRUSH,
    color: source.color,
    size: 1,
    points: toPoints(poly[0]!),
    layerId: source.layerId,
    filled: true,
    holes: poly.slice(1).map(toPoints),
    ...(source.background ? { background: true } : {}),
  });
}

function toPoints(ring: Pair[]): Point[] {
  return ring.map(([x, y]) => ({ x, y }));
}

function pathBBox(path: Point[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function expand(b: BoundingBox, r: number): BoundingBox {
  return { minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r };
}
