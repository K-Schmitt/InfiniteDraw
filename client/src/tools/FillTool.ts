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

function ringToFramePoints(flat: readonly number[]): FramePoint[] {
  const points: FramePoint[] = [];
  for (let i = 0; i < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
  return points;
}
