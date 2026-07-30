import { Container, Graphics, RenderTexture, type Renderer } from 'pixi.js';
import { fillRings } from '../fillRings';
import type { PixelBuffer } from './maskBuffer';

/** One bounding stroke, rings already projected into the camera frame. */
export interface WallShape {
  readonly frameRings: number[][];
}

export interface WallMaskView {
  readonly width: number;
  readonly height: number;
  /** Screen pixels per camera-frame unit (`frameScaleOf(cameraScale, level)`). */
  readonly frameScale: number;
  /** Extra wall thickness in pixels; closes hand-drawn gaps up to this width. */
  readonly gapPx: number;
}

export interface WallMaskRequest {
  readonly renderer: Renderer;
  readonly walls: readonly WallShape[];
  readonly view: WallMaskView;
}

/** Wall index 0 would encode as colour 0x000000 = transparent-looking; offset by one. */
const INDEX_OFFSET = 1;

/**
 * Paints every bounding stroke into a private RenderTexture, each in a colour that encodes its
 * index, and reads the pixels back.
 *
 * Rendered from `StrokeStore` geometry rather than grabbed from the live canvas on purpose: the
 * result must not depend on what happened to be composited this frame, or two peers whose remote
 * queues drained differently would compute different fills from identical documents. Antialiasing
 * is off so every pixel is either exactly one wall's index or exactly empty — which is what lets
 * the flood be a single alpha test with no colour-tolerance tuning.
 */
export function renderWallMask(request: WallMaskRequest): PixelBuffer {
  const { renderer, walls, view } = request;
  const texture = RenderTexture.create({
    width: view.width,
    height: view.height,
    resolution: 1,
    antialias: false,
  });
  const stage = new Container();
  for (let i = 0; i < walls.length; i++) stage.addChild(wallGraphics(walls[i]!, i, view));
  // clearColor is explicit: a RenderTexture target does not inherit the app background, and the
  // whole mask contract is "alpha 0 means empty".
  renderer.render({ container: stage, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
  const readback = renderer.extract.pixels(texture);
  stage.destroy({ children: true });
  texture.destroy(true);
  return { data: readback.pixels, width: readback.width, height: readback.height };
}

interface WallPen {
  readonly color: number;
  readonly width: number;
}

/**
 * One wall in its index colour. Goes through the renderer's own `fillRings`, not a bare
 * `gfx.poly().fill()`: `strokeOutlineRings` returns `[outer, inner]` for **every** closed shape
 * (rectangle, ellipse, closed loop), and only `fillRings`' `new GraphicsPath(undefined, true)`
 * treats the inner ring as a hole. Filling it solid would seal the very interior the bucket has
 * to flood — "draw a rectangle, click inside" would silently do nothing, at every zoom. This is
 * also locked invariant 4: one render path, not two.
 */
function wallGraphics(wall: WallShape, index: number, view: WallMaskView): Graphics {
  const gfx = new Graphics();
  const color = index + INDEX_OFFSET;
  const scaled = wall.frameRings.map((r) => scaleRing(r, view.frameScale));
  fillRings(gfx, scaled, { originX: 0, originY: 0, scale: 1, color, alpha: 1 });
  if (view.gapPx > 0) outlineRings(gfx, scaled, { color, width: view.gapPx });
  return gfx;
}

/** Thickens every ring so a hand-drawn "closed" shape's sub-pixel gaps seal. */
function outlineRings(gfx: Graphics, rings: readonly number[][], pen: WallPen): void {
  for (const points of rings) {
    if (points.length < 6) continue;
    gfx.poly(points, true);
  }
  gfx.stroke({ color: pen.color, alpha: 1, width: pen.width, join: 'round', cap: 'round' });
}

/** Camera-frame ring → screen pixels. Frame (0,0) is the top-left of the viewport. */
function scaleRing(ring: readonly number[], frameScale: number): number[] {
  const out = new Array<number>(ring.length);
  for (let i = 0; i < ring.length; i++) out[i] = ring[i]! * frameScale;
  return out;
}
