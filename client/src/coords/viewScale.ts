import { ldexp } from './ldexp';

/**
 * Screen-scale factors derived from the camera. `cameraScale` = 2^(level+frac) is the
 * world→pixel scale; dividing out a level yields pixels per local unit at that level.
 */

/** Screen px per camera-level local unit (= 2^frac). */
export function frameScaleOf(cameraScale: number, cameraLevel: number): number {
  return ldexp(cameraScale, -cameraLevel);
}

/** Screen px per anchor-level local unit — the scale baked geometry renders at. */
export function anchorScaleOf(frameScale: number, cameraLevel: number, anchorLevel: number): number {
  return ldexp(frameScale, cameraLevel - anchorLevel);
}
