import { LOCAL_SPAN } from '@shared/anchor';
import type { Camera } from '@shared/camera';
import type { ProjCamera } from '../coords/viewProject';
import { log } from '../debug/logger';

const HYSTERESIS = 0.05; // dead-band at level boundaries to stop half-pixel jitter

// Sub-cell offset is stored as BigInt fixed-point (Q64) so a level crossing's ×2/÷2 is an exact
// bit shift, not a float multiply. Float sub loses a low bit per crossing and rescaleCell's
// doublings amplify that residue by 2^(levels crossed) — a symmetric zoom-out/in round trip past
// ~40 levels drifted the camera by ~1 LOCAL_SPAN (F2 bug 2). Q64 keeps 64 fractional bits below
// the local unit: coarsening `>>1` erodes one per level, so the sub position survives a round
// trip through ~64 zoom levels — well past the depth at which a stroke is still above one pixel.
// Deeper than that the sub genuinely underflows (the point is sub-pixel and gone either way).
const SUB_FRAC_BITS = 64n;
const SUB_ONE = 2 ** 64; // 2^64 as a float, for BigInt fixed-point ↔ float conversion
const CELL_Q = BigInt(LOCAL_SPAN) << SUB_FRAC_BITS; // one whole cell in Q32 units

/** Float local units → Q64 BigInt fixed-point (rounds only here; downstream shifts stay exact). */
function toQ(localUnits: number): bigint {
  return BigInt(Math.round(localUnits * SUB_ONE));
}

function finiteOrZero(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Floor division for positive divisors: quotient rounds toward -Infinity, not toward zero. */
function floorDivBigInt(dividend: bigint, divisor: bigint): bigint {
  const q = dividend / divisor;
  const r = dividend % divisor;
  return r < 0n ? q - 1n : q;
}

// Clamp only the *rendered zoom scalar* so Math.exp never overflows to Infinity downstream
// (float32 PixiJS transforms die well before exp(700) anyway). This does NOT bound navigation:
// level/cell keep growing without limit, honouring the locked "no zoom bound" invariant.
// logZoom (HUD) stays unclamped.
const RENDER_LOG_LIMIT = 600;

/**
 * Hierarchical camera: integer `level` + BigInt `cell` + sub-cell float offset + fractional
 * zoom. Screen pixels per local unit = 2^frac; world→pixel scale = 2^(level+frac). Crossing a
 * level rescales cell/sub by 2 so the on-screen position stays invariant.
 */
export class HierCamera {
  private level = 0;
  private cellX = 0n;
  private cellY = 0n;
  // Sub-cell offset in Q32 fixed-point (local units × 2^32). See SUB_FRAC_BITS note above.
  private subQx = 0n;
  private subQy = 0n;
  private frac = 0;

  get projCamera(): ProjCamera {
    return {
      level: this.level,
      cell: { x: this.cellX, y: this.cellY },
      sub: { x: Number(this.subQx) / SUB_ONE, y: Number(this.subQy) / SUB_ONE },
    };
  }

  private get subX(): number { return Number(this.subQx) / SUB_ONE; }
  private get subY(): number { return Number(this.subQy) / SUB_ONE; }

  /** World-units → pixels at the current zoom. */
  get scale(): number {
    return 2 ** (this.level + this.frac);
  }

  /** Pixels per camera-level local unit (= 2^frac); always finite (frac ∈ [0,1)). */
  get frameScale(): number {
    return 2 ** this.frac;
  }

  /** A camera-frame local offset → screen pixels (pixels per local unit = 2^frac). */
  frameToScreen(fx: number, fy: number): { x: number; y: number } {
    const p = 2 ** this.frac;
    return { x: fx * p, y: fy * p };
  }

  setSub(x: number, y = 0): void {
    this.subQx = toQ(x);
    this.subQy = toQ(y);
  }

  panPixels(dxScreen: number, dyScreen: number): void {
    const localPerPixel = 2 ** -this.frac;
    this.addToSub(-dxScreen * localPerPixel, -dyScreen * localPerPixel);
    this.carry();
  }

  // pivot-preserving zoom: keep the world point under (pivotFx,pivotFy) fixed on screen.
  // No depth bound — level/cell grow without limit (locked "no zoom bound" invariant).
  zoomBy(deltaLog2: number, pivotFx: number, pivotFy: number): void {
    const k = 2 ** -deltaLog2; // = scaleBefore/scaleAfter in pixels-per-local-unit terms
    // A single huge-magnitude zoom overflows k to ±Infinity; 0·Infinity = NaN. Real input is
    // wheel notches where this never happens, but guard so the fixed-point conversion can't throw.
    const shift = 1 - k;
    this.addToSub(finiteOrZero(pivotFx * shift), finiteOrZero(pivotFy * shift));
    this.frac += deltaLog2;
    this.normaliseLevel();
    this.carry();
  }

  // Accumulate a float local-unit delta into the Q32 sub. Only the input is rounded (to 2^-32
  // local); once in BigInt it survives every later level crossing exactly, so pan/zoom deltas no
  // longer feed a residue that rescaleCell's doublings could amplify (the F2 bug-2 mechanism).
  private addToSub(dx: number, dy: number): void {
    this.subQx += toQ(dx);
    this.subQy += toQ(dy);
  }

  private normaliseLevel(): void {
    while (this.frac >= 1 + HYSTERESIS) {
      this.frac -= 1; this.level += 1; this.rescaleCell(1);
      log('camera', 'LEVEL UP', { level: this.level, cell: this.cellText(), frac: this.frac });
    }
    while (this.frac < -HYSTERESIS) {
      this.frac += 1; this.level -= 1; this.rescaleCell(-1);
      log('camera', 'LEVEL DOWN', { level: this.level, cell: this.cellText(), frac: this.frac });
    }
  }

  /** BigInt cell rendered as text so camera logs stay JSON-serializable. */
  private cellText(): string {
    return `${this.cellX},${this.cellY}`;
  }

  // Moving a whole level rescales cell/sub by 2 (finer) or ½ (coarser), screen-invariant. On
  // Q32 BigInt this is an exact shift: finer doubles the local offset (<<1); coarser folds the
  // dropped cell parity back into sub then halves (>>1). No float rounding, so no drift.
  private rescaleCell(dir: 1 | -1): void {
    if (dir === 1) {
      this.cellX <<= 1n; this.cellY <<= 1n;
      this.subQx <<= 1n; this.subQy <<= 1n;
    } else {
      this.subQx += (this.cellX & 1n) * CELL_Q; this.cellX >>= 1n;
      this.subQy += (this.cellY & 1n) * CELL_Q; this.cellY >>= 1n;
      this.subQx >>= 1n; this.subQy >>= 1n;
    }
    this.carry();
  }

  // Normalises sub into [0, CELL_Q) via floor-division instead of repeated subtraction: the old
  // while-loops cost one iteration per cell crossed, which is unbounded for a single large zoomBy
  // (measured: 4.06e33 iterations for a 120-level zoom, i.e. a hang). floorDivBigInt gives the
  // same quotient/remainder in O(1) regardless of magnitude or sign.
  carry(): void {
    const qx = floorDivBigInt(this.subQx, CELL_Q);
    this.subQx -= qx * CELL_Q;
    this.cellX += qx;
    const qy = floorDivBigInt(this.subQy, CELL_Q);
    this.subQy -= qy * CELL_Q;
    this.cellY += qy;
  }

  /** Legacy float64 view of this camera's reference point (top-left of viewport) and zoom.
   *  Recomputed fresh from the BigInt cell + float sub each call — never accumulates drift,
   *  but still loses precision once cell*LOCAL_SPAN exceeds float64's exact-integer range
   *  (same limit the old CameraController always had; unchanged consumers rely on this).
   *  The `2^-level` factor is required: (cell*LOCAL_SPAN+sub) alone is NOT level-invariant —
   *  rescaleCell doubles/halves it on every level crossing, purely from zooming with no pan. */
  toLegacyCamera(): Camera {
    const f = 2 ** -this.level;
    const clampedLog = Math.max(-RENDER_LOG_LIMIT, Math.min(RENDER_LOG_LIMIT, this.logZoom));
    return {
      x: (Number(this.cellX) * LOCAL_SPAN + this.subX) * f,
      y: (Number(this.cellY) * LOCAL_SPAN + this.subY) * f,
      zoom: Math.exp(clampedLog),
    };
  }

  /** ln(zoom), matching the old CameraController.logZoom contract (for the HUD's "10^n" format). */
  get logZoom(): number {
    return (this.level + this.frac) * Math.LN2;
  }

  /** Screen px → this camera's frame-local units (inverse of frameToScreen). */
  screenToFrame(sx: number, sy: number): { x: number; y: number } {
    const p = 2 ** -this.frac;
    return { x: sx * p, y: sy * p };
  }

  /** Screen px → legacy float64 world point (matches CameraController.toWorld exactly). */
  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    const legacy = this.toLegacyCamera();
    return { x: screenX / legacy.zoom + legacy.x, y: screenY / legacy.zoom + legacy.y };
  }
}
