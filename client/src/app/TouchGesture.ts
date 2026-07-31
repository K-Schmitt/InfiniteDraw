/** One step of a multi-finger camera gesture: screen-pixel pan plus a log2 zoom about a pivot. */
export interface GestureStep {
  readonly dx: number;
  readonly dy: number;
  readonly zoomLog2: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

interface TouchPoint {
  x: number;
  y: number;
}

/** Fingers needed to drive the camera. One finger stays reserved for the active tool. */
const GESTURE_FINGERS = 2;

/**
 * Tracks touch pointers and turns them into camera steps.
 *
 * Pan comes from the centroid's motion, zoom from the mean distance of the fingers to that
 * centroid — both defined for any finger count ≥ 2, so a third finger landing mid-gesture only
 * rebases the measurement instead of ending it.
 */
export class TouchGesture {
  private readonly points = new Map<number, TouchPoint>();
  private centroidBase: TouchPoint | null = null;
  private spreadBase = 0;
  private hasLatched = false;

  /** True while enough fingers are down to move the camera. */
  get isActive(): boolean {
    return this.points.size >= GESTURE_FINGERS;
  }

  /** True while a gesture owns the touch session — tools must ignore every pointer until liftoff. */
  get isBlockingTools(): boolean {
    return this.hasLatched;
  }

  /** Registers a finger. Returns true when this one promotes the session into a camera gesture. */
  start(pointerId: number, x: number, y: number): boolean {
    this.points.set(pointerId, { x, y });
    if (!this.isActive) return false;
    this.rebase();
    const isPromotion = !this.hasLatched;
    this.hasLatched = true;
    return isPromotion;
  }

  /** Feeds a finger move. Returns a camera step, or null when fewer than two fingers are down. */
  move(pointerId: number, x: number, y: number): GestureStep | null {
    const point = this.points.get(pointerId);
    if (!point) return null;
    point.x = x;
    point.y = y;
    if (!this.isActive || !this.centroidBase) return null;
    return this.stepFromBase();
  }

  /** Lifts a finger. The gesture keeps blocking tools until the last finger leaves. */
  end(pointerId: number): void {
    this.points.delete(pointerId);
    if (this.isActive) return this.rebase();
    this.centroidBase = null;
    this.spreadBase = 0;
    if (this.points.size === 0) this.hasLatched = false;
  }

  /** Drops every finger, e.g. on pointercancel or when the window loses the pointer. */
  clear(): void {
    this.points.clear();
    this.centroidBase = null;
    this.spreadBase = 0;
    this.hasLatched = false;
  }

  private stepFromBase(): GestureStep {
    const base = this.centroidBase as TouchPoint;
    const centroid = this.centroid();
    const spread = this.spread(centroid);
    const canZoom = spread > 0 && this.spreadBase > 0;
    const step: GestureStep = {
      dx: centroid.x - base.x,
      dy: centroid.y - base.y,
      zoomLog2: canZoom ? Math.log2(spread / this.spreadBase) : 0,
      pivotX: centroid.x,
      pivotY: centroid.y,
    };
    this.centroidBase = centroid;
    this.spreadBase = spread;
    return step;
  }

  /** Re-reads the reference centroid and spread so a finger count change produces no jump. */
  private rebase(): void {
    this.centroidBase = this.centroid();
    this.spreadBase = this.spread(this.centroidBase);
  }

  private centroid(): TouchPoint {
    let x = 0;
    let y = 0;
    for (const point of this.points.values()) {
      x += point.x;
      y += point.y;
    }
    return { x: x / this.points.size, y: y / this.points.size };
  }

  private spread(centroid: TouchPoint): number {
    let total = 0;
    for (const point of this.points.values()) {
      total += Math.hypot(point.x - centroid.x, point.y - centroid.y);
    }
    return total / this.points.size;
  }
}
