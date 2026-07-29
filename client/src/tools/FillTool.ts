import { Container } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { anchoredStroke, type AnchoredSpec } from './strokeFactory';
import type { FramePoint } from '../drawing/anchorCommit';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';
import { log } from '../debug/logger';

/** Paint-bucket: fills the empty region enclosed by surrounding strokes under the click. */
export class FillTool implements Tool {
  readonly preview = new Container(); // instant action — nothing to preview
  readonly tentativeStrokeId = null;

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    const t0 = performance.now();
    const target = this.api.fillTarget(ctx.frame, ctx.projCamera, this.settings.primary);
    log('tool', `fill -> ${target?.kind ?? 'NO TARGET'}`, {
      frame: ctx.frame, color: this.settings.primary, level: ctx.projCamera.level,
      recolorIds: target?.kind === 'recolor' ? target.ids.length : undefined,
      fillRings: target?.kind === 'fill' ? target.rings.length : undefined,
      ms: +(performance.now() - t0).toFixed(2),
    });
    if (!target) return;
    if (target.kind === 'recolor') this.api.recolorMany(target.ids, this.settings.primary);
    else this.api.add(this.makeFill(target.rings, target.background, ctx));
  }

  onMove(): void {}
  onUp(): void {}
  cancel(): void {}
  refreshPreview(): void {}

  // rings = [outerRing, ...holeRings] as flat camera-frame coords → anchored filled stroke
  private makeFill(rings: number[][], background: boolean, ctx: ToolContext): BrushStroke {
    const spec: AnchoredSpec = {
      type: StrokeType.BRUSH,
      color: this.settings.primary,
      screenSize: 1,
      framePoints: ringToFramePoints(rings[0]!),
      frameHoles: rings.slice(1).map(ringToFramePoints),
      layerId: this.settings.layerId,
      camera: ctx.projCamera,
      cameraScale: ctx.cameraScale,
      filled: true,
      ...(background ? { background: true } : {}),
    };
    return anchoredStroke(spec);
  }
}

function ringToFramePoints(flat: number[]): FramePoint[] {
  const points: FramePoint[] = [];
  for (let i = 0; i < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
  return simplify(points, 0.5); // Tolerance: 0.5px squared (sub-pixel removal)
}

function simplify(points: FramePoint[], tolerance: number): FramePoint[] {
  if (points.length <= 2) return points;
  let maxSqDist = 0;
  let maxIndex = 0;
  const last = points.length - 1;

  for (let i = 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i]!, points[0]!, points[last]!);
    if (sqDist > maxSqDist) {
      maxIndex = i;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > tolerance) {
    const left = simplify(points.slice(0, maxIndex + 1), tolerance);
    const right = simplify(points.slice(maxIndex), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [points[0]!, points[last]!];
  }
}

function getSqSegDist(p: FramePoint, p1: FramePoint, p2: FramePoint): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p.x - x;
  dy = p.y - y;

  return dx * dx + dy * dy;
}
