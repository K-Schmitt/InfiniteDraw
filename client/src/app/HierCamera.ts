import { LOCAL_SPAN } from '@shared/anchor';
import type { ProjCamera } from '../coords/viewProject';

const HYSTERESIS = 0.05; // dead-band at level boundaries to stop half-pixel jitter

/**
 * Hierarchical camera: integer `level` + BigInt `cell` + sub-cell float offset + fractional
 * zoom. Screen pixels per local unit = 2^frac; world→pixel scale = 2^(level+frac). Crossing a
 * level rescales cell/sub by 2 so the on-screen position stays invariant.
 */
export class HierCamera {
  private level = 0;
  private cellX = 0n;
  private cellY = 0n;
  private subX = 0;
  private subY = 0;
  private frac = 0;

  get projCamera(): ProjCamera {
    return {
      level: this.level,
      cell: { x: this.cellX, y: this.cellY },
      sub: { x: this.subX, y: this.subY },
    };
  }

  /** World-units → pixels at the current zoom. */
  get scale(): number {
    return 2 ** (this.level + this.frac);
  }

  /** A camera-frame local offset → screen pixels (pixels per local unit = 2^frac). */
  frameToScreen(fx: number, fy: number): { x: number; y: number } {
    const p = 2 ** this.frac;
    return { x: fx * p, y: fy * p };
  }

  setSub(x: number, y = 0): void {
    this.subX = x;
    this.subY = y;
  }

  panPixels(dxScreen: number, dyScreen: number): void {
    const localPerPixel = 2 ** -this.frac;
    this.subX -= dxScreen * localPerPixel;
    this.subY -= dyScreen * localPerPixel;
    this.carry();
  }

  // pivot-preserving zoom: keep the world point under (pivotFx,pivotFy) fixed on screen.
  zoomBy(deltaLog2: number, pivotFx: number, pivotFy: number): void {
    const k = 2 ** -deltaLog2; // = scaleBefore/scaleAfter in pixels-per-local-unit terms
    this.subX += pivotFx * (1 - k);
    this.subY += pivotFy * (1 - k);
    this.frac += deltaLog2;
    this.normaliseLevel();
    this.carry();
  }

  private normaliseLevel(): void {
    while (this.frac >= 1 + HYSTERESIS) { this.frac -= 1; this.level += 1; this.rescaleCell(1); }
    while (this.frac < -HYSTERESIS) { this.frac += 1; this.level -= 1; this.rescaleCell(-1); }
  }

  // moving a whole level rescales cell/sub by 2 (finer) or ½ (coarser), screen-invariant
  private rescaleCell(dir: 1 | -1): void {
    if (dir === 1) {
      this.cellX <<= 1n; this.cellY <<= 1n;
      this.subX *= 2; this.subY *= 2;
    } else {
      this.subX += Number(this.cellX & 1n) * LOCAL_SPAN; this.cellX >>= 1n;
      this.subY += Number(this.cellY & 1n) * LOCAL_SPAN; this.cellY >>= 1n;
      this.subX /= 2; this.subY /= 2;
    }
    this.carry();
  }

  carry(): void {
    while (this.subX >= LOCAL_SPAN) { this.subX -= LOCAL_SPAN; this.cellX += 1n; }
    while (this.subX < 0) { this.subX += LOCAL_SPAN; this.cellX -= 1n; }
    while (this.subY >= LOCAL_SPAN) { this.subY -= LOCAL_SPAN; this.cellY += 1n; }
    while (this.subY < 0) { this.subY += LOCAL_SPAN; this.cellY -= 1n; }
  }
}
