import type { BrushStroke } from '@shared/stroke';
import type { Viewport } from '@shared/camera';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes the world-space AABB for a stroke, including size padding.
 * stroke.size is in screen pixels; zoom converts it to world units.
 */
export function computeBoundingBox(stroke: BrushStroke, zoom = 1): BoundingBox {
  if (stroke.points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  const pad = stroke.size / (2 * zoom);
  let minX = stroke.points[0]!.x;
  let minY = stroke.points[0]!.y;
  let maxX = minX;
  let maxY = minY;

  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Returns true if the bounding box overlaps the given viewport. */
export function isVisible(bbox: BoundingBox, viewport: Viewport): boolean {
  return (
    bbox.maxX >= viewport.x &&
    bbox.minX <= viewport.x + viewport.width &&
    bbox.maxY >= viewport.y &&
    bbox.minY <= viewport.y + viewport.height
  );
}
