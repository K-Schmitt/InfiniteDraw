import { Graphics } from 'pixi.js';
import type { BrushStroke, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import { frameScaleOf } from '../coords/viewScale';
import { eraserStamp, subtractStamp } from '../drawing/eraseGeometry';
import { anchoredStroke } from './strokeFactory';
import type { FramePoint } from '../drawing/anchorCommit';
import type { Tool, ToolContext, ToolSettings, CanvasApi, FrameBox } from './Tool';

const CURSOR_COLOR = 0x999999;

type Pair = [number, number];

/**
 * Vector eraser. Subtracts a capsule-shaped stamp (swept under the cursor) from each stroke's
 * rendered area, working entirely in the camera frame so precision holds at any zoom depth.
 * Remnants are re-anchored and keep the source stroke's colour and paint order.
 */
export class EraserTool implements Tool {
  readonly preview = new Graphics();
  readonly tentativeStrokeId = null;
  private last: Point | null = null;
  private cursor: Point | null = null;
  private camera: ProjCamera | null = null;
  private cameraScale = 1;
  private frameRadius = 1;
  private erasing = false;

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.erasing = true;
    this.beginGesture(ctx);
    this.eraseStep([ctx.frame]);
    this.last = { ...ctx.frame };
  }

  onMove(ctx: ToolContext): void {
    this.beginGesture(ctx);
    if (!this.erasing || !this.last) return;
    this.eraseStep([this.last, ctx.frame]);
    this.last = { ...ctx.frame };
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

  refreshPreview(camera: HierCamera): void {
    this.preview.clear();
    if (!this.cursor) return;
    const s = camera.frameToScreen(this.cursor.x, this.cursor.y);
    this.preview.circle(s.x, s.y, this.settings.size / 2).stroke({ color: CURSOR_COLOR, width: 1 });
  }

  private beginGesture(ctx: ToolContext): void {
    this.cursor = { ...ctx.frame };
    this.camera = ctx.projCamera;
    this.cameraScale = ctx.cameraScale;
    const frameScale = frameScaleOf(ctx.cameraScale, ctx.projCamera.level);
    this.frameRadius = this.settings.size / 2 / frameScale;
  }

  private eraseStep(path: Point[]): void {
    if (!this.camera) return;
    const stamp = eraserStamp(path, this.frameRadius);
    const box = expand(pathBox(path), this.frameRadius);
    const removeIds: string[] = [];
    const additions: BrushStroke[] = [];
    for (const cand of this.api.strokesInFrame(box, this.camera)) {
      const result = subtractStamp(cand.frameRings, stamp);
      if (result === null) continue; // stamp didn't touch this stroke
      removeIds.push(cand.stroke.id);
      for (const poly of result) additions.push(this.remnant(poly, cand.stroke));
    }
    if (removeIds.length > 0) this.api.eraseLive(removeIds, additions);
  }

  // a leftover polygon (outer + holes, frame coords) → an anchored filled stroke, same colour/z
  private remnant(poly: Pair[][], source: BrushStroke): BrushStroke {
    return anchoredStroke({
      type: StrokeType.BRUSH,
      color: source.color,
      screenSize: 1,
      framePoints: toFramePoints(poly[0]!),
      frameHoles: poly.slice(1).map(toFramePoints),
      layerId: source.layerId,
      camera: this.camera!,
      cameraScale: this.cameraScale,
      zIndex: source.zIndex,
      filled: true,
      ...(source.background ? { background: true } : {}),
    });
  }
}

function toFramePoints(ring: Pair[]): FramePoint[] {
  return ring.map(([x, y]) => ({ x, y }));
}

function pathBox(path: Point[]): FrameBox {
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

function expand(b: FrameBox, r: number): FrameBox {
  return { minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r };
}
