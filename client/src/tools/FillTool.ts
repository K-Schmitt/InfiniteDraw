import { Container } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { anchoredStroke, type AnchoredSpec } from './strokeFactory';
import type { FramePoint } from '../drawing/anchorCommit';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Paint-bucket: fills the empty region enclosed by surrounding strokes under the click. */
export class FillTool implements Tool {
  readonly preview = new Container(); // instant action — nothing to preview
  readonly tentativeStrokeId = null;

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    const target = this.api.fillTarget(ctx.frame, ctx.projCamera, this.settings.primary);
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
  return points;
}
