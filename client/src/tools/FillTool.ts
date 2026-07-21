import { Container } from 'pixi.js';
import type { BrushStroke, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { buildStroke } from './strokeFactory';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Paint-bucket: fills the empty region enclosed by surrounding strokes under the click. */
export class FillTool implements Tool {
  readonly preview = new Container(); // instant action — nothing to preview

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    const target = this.api.fillTarget(ctx.world, this.settings.primary);
    if (!target) return;
    if (target.kind === 'recolor') this.api.recolorMany(target.ids, this.settings.primary);
    else this.api.add(this.makeFill(target.rings, target.background));
  }

  onMove(): void {}
  onUp(): void {}
  cancel(): void {}
  refreshPreview(): void {}

  // rings = [outerRing, ...holeRings] (flat world coords)
  private makeFill(rings: number[][], background: boolean): BrushStroke {
    return buildStroke({
      type: StrokeType.BRUSH,
      color: this.settings.primary,
      size: 1,
      points: ringToPoints(rings[0]!),
      layerId: this.settings.layerId,
      filled: true,
      holes: rings.slice(1).map(ringToPoints),
      ...(background ? { background: true } : {}),
    });
  }
}

function ringToPoints(flat: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
  return points;
}
