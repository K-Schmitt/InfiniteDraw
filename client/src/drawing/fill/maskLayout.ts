import type { FrameBox } from '../clipFrameRings';

/** Screen-pixel position of the mask buffer's (0,0) pixel. Negative: the pad extends past the
 *  viewport's top-left. Frame (0,0) stays the viewport's top-left pixel throughout. */
export interface MaskOrigin {
  readonly x: number;
  readonly y: number;
}

export interface MaskLayout {
  readonly width: number;
  readonly height: number;
  readonly originPx: MaskOrigin;
}

export interface MaskSeedRequest {
  readonly frame: { readonly x: number; readonly y: number };
  /** Screen pixels per camera-frame unit. */
  readonly frameScale: number;
  readonly originPx: MaskOrigin;
}

/**
 * Wall-mask layout padded by half a viewport per side, matching `viewportFrameBox`'s wall
 * selection: a wall selected because it sits just off-screen must also land in the buffer, or
 * the flood escapes through the crop edge and a visibly closed shape refuses to fill (S1).
 * A flood reaching the PADDED buffer edge is still the open exterior and is still refused.
 */
export function paddedMaskLayout(screenW: number, screenH: number): MaskLayout {
  const padX = Math.ceil(screenW / 2);
  const padY = Math.ceil(screenH / 2);
  return {
    width: Math.ceil(screenW) + 2 * padX,
    height: Math.ceil(screenH) + 2 * padY,
    originPx: { x: -padX, y: -padY },
  };
}

/**
 * Buffer pixel owning a click. Floor, not round: with antialias off the GPU paints pixel i when
 * the polygon covers its centre, so pixel i owns screen [i, i+1) — rounding sent every click in
 * [i+0.5, i+1) to the neighbour pixel, which on a wall pixel killed the fill.
 */
export function maskSeedPx(request: MaskSeedRequest): { x: number; y: number } {
  return {
    x: Math.floor(request.frame.x * request.frameScale) - request.originPx.x,
    y: Math.floor(request.frame.y * request.frameScale) - request.originPx.y,
  };
}

/** The buffer's coverage in camera-frame units — the box oversized walls are clipped against. */
export function maskFrameBox(layout: MaskLayout, frameScale: number): FrameBox {
  return {
    minX: layout.originPx.x / frameScale,
    minY: layout.originPx.y / frameScale,
    maxX: (layout.originPx.x + layout.width) / frameScale,
    maxY: (layout.originPx.y + layout.height) / frameScale,
  };
}

/** Camera-frame ring → mask-buffer pixels. */
export function ringToMaskPx(
  ring: readonly number[],
  frameScale: number,
  originPx: MaskOrigin,
): number[] {
  const out = new Array<number>(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    out[i] = ring[i]! * frameScale - originPx.x;
    out[i + 1] = ring[i + 1]! * frameScale - originPx.y;
  }
  return out;
}

/** Mask-buffer pixels → camera-frame ring (inverse of `ringToMaskPx`). */
export function maskPxToFrame(
  ring: readonly number[],
  frameScale: number,
  originPx: MaskOrigin,
): number[] {
  const out = new Array<number>(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    out[i] = (ring[i]! + originPx.x) / frameScale;
    out[i + 1] = (ring[i + 1]! + originPx.y) / frameScale;
  }
  return out;
}
