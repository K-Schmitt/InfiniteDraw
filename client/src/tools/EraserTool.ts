import { Graphics } from 'pixi.js';
import type { Point } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import { frameScaleOf } from '../coords/viewScale';
import { eraserStamp } from '../drawing/eraseGeometry';
import { fillRings } from '../drawing/fillRings';
import { EraserSession } from './EraserSession';
import type { Tool, ToolContext, ToolSettings, CanvasApi, FrameBox } from './Tool';
import { log } from '../debug/logger';

const CURSOR_COLOR = 0x999999;

/**
 * Vector eraser. Subtracts a swept capsule from each stroke's area entirely in the camera frame,
 * so precision holds at any zoom depth. The whole gesture is buffered in an `EraserSession` and
 * committed once on pointer-up — the per-step commit-and-broadcast it used to do is what stalled
 * receiving peers for 15 s and bloated the journal.
 */
export class EraserTool implements Tool {
  readonly preview = new Graphics();
  readonly tentativeStrokeId = null;
  private session: EraserSession | null = null;
  private last: Point | null = null;
  private cursor: Point | null = null;
  private camera: ProjCamera | null = null;
  /** The camera the live session was anchored to; compared against `camera` to detect drift. */
  private sessionCamera: ProjCamera | null = null;
  private cameraScale = 1;
  private frameRadius = 1;

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.syncCursor(ctx);
    this.session = new EraserSession({ camera: ctx.projCamera, cameraScale: ctx.cameraScale });
    this.sessionCamera = ctx.projCamera;
    log('tool', 'eraser gesture start', {
      frame: ctx.frame, size: this.settings.size, frameRadius: this.frameRadius,
      level: ctx.projCamera.level,
    });
    this.step([ctx.frame]);
    this.last = { ...ctx.frame };
  }

  onMove(ctx: ToolContext): void {
    this.syncCursor(ctx);
    if (!this.session) return;
    if (!this.last) {
      // A previous step threw before assigning `last` — without this log the gesture silently
      // no-ops for the rest of the drag (this is what "gesture wedged" caught before the rewrite).
      log('error', 'eraser onMove with no `last` — gesture wedged', ctx.frame);
      return;
    }
    // Coalesce sub-radius moves: each step runs polygon-clipping, so processing every coalesced
    // pointer sample is what pegged the eraser to multi-second INP.
    const minStep = Math.max(this.frameRadius * 0.5, 1e-6);
    if (dist(this.last, ctx.frame) < minStep) return;
    this.step([this.last, ctx.frame]);
    this.last = { ...ctx.frame };
  }

  onUp(): void {
    this.finish();
  }

  cancel(): void {
    this.finish();
    this.cursor = null;
    this.preview.clear();
  }

  /**
   * Draws the eraser cursor plus the gesture's surviving geometry (nothing is committed yet).
   *
   * Goes through `fillRings`, not `poly()` + `fill()`: a carved piece is `[outer, ...holes]`, and
   * only `fillRings`' `new GraphicsPath(undefined, true)` runs pixi's hole pass. Filled on the
   * Graphics' own implicit path (signed = false) every hole rendered solid, so a closed shape's
   * interior went opaque the instant the eraser touched it and hollow again on release. Same trap
   * `renderWallMask.ts:62-69` documents for the fill mask.
   */
  refreshPreview(camera: HierCamera): void {
    this.preview.clear();
    for (const shape of this.session?.workingRings() ?? []) {
      fillRings(this.preview, shape.rings, {
        originX: 0,
        originY: 0,
        scale: camera.frameScale, // frame units → screen px, same factor as frameToScreen
        color: rgb(shape.color),
        alpha: shape.color.a / 255,
      });
    }
    if (!this.cursor) return;
    const s = camera.frameToScreen(this.cursor.x, this.cursor.y);
    this.preview.circle(s.x, s.y, this.settings.size / 2).stroke({ color: CURSOR_COLOR, width: 1 });
  }

  private finish(): void {
    if (!this.session) return;
    const sealed = this.session.seal();
    log('tool', 'eraser gesture end', {
      removed: sealed.removed.length, added: sealed.added.length,
    });
    this.api.eraseCommit(sealed);
    this.session = null;
    this.sessionCamera = null;
    this.last = null;
  }

  private syncCursor(ctx: ToolContext): void {
    this.cursor = { ...ctx.frame };
    this.camera = ctx.projCamera;
    this.cameraScale = ctx.cameraScale;
    this.frameRadius =
      this.settings.size / 2 / frameScaleOf(ctx.cameraScale, ctx.projCamera.level);
  }

  private step(path: Point[]): void {
    if (!this.session || !this.camera) return;
    this.resealOnDrift();
    const stamp = eraserStamp(path, this.frameRadius);
    const box = expand(pathBox(path), this.frameRadius);
    const taken = this.session!.take(this.api.strokesInFrame(box, this.camera), stamp);
    if (taken.length > 0) this.api.eraseTake(taken);
    // `take()` already carved what it adopted this step; skip those to avoid a second
    // polygon-clipping difference over the same geometry.
    this.session!.carve(stamp, new Set(taken));
  }

  /**
   * A wheel-zoom during a held erase drag changes the live camera's level or cell, but the
   * session's buffered pieces are still in the OLD frame — subtracting a new-frame stamp from
   * them mixes coordinate systems (the origin-straddle bug class). Seal what is carved so far as
   * its own batch and restart, rather than baking in a wrong offset on pre-existing shared strokes.
   */
  private resealOnDrift(): void {
    if (!this.session || !this.camera || !this.sessionCamera) return;
    if (!drifted(this.sessionCamera, this.camera)) return;
    log('tool', 'eraser gesture split: camera re-anchored mid-drag', {
      from: this.sessionCamera.level, to: this.camera.level,
    });
    this.finish();
    this.session = new EraserSession({ camera: this.camera, cameraScale: this.cameraScale });
    this.sessionCamera = this.camera;
  }
}

/** Level or cell change = a different frame origin. Sub-cell motion is not drift. */
function drifted(a: ProjCamera, b: ProjCamera): boolean {
  return a.level !== b.level || a.cell.x !== b.cell.x || a.cell.y !== b.cell.y;
}

function rgb(color: { r: number; g: number; b: number }): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathBox(path: readonly Point[]): FrameBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function expand(b: FrameBox, r: number): FrameBox {
  return { minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r };
}
