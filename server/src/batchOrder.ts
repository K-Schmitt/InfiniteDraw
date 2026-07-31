import type { BrushStroke } from '@shared/stroke.js';

export interface BatchOrderContext {
  readonly nextZ: number;
  readonly ownerId: string;
  /**
   * Restore each stroke to the paint slot it already held instead of stamping a fresh block.
   * Set for undo/redo re-adds, never for the eraser: a redone stroke belongs where it was, while
   * an eraser gesture's remnants are genuinely new geometry that belongs on top.
   */
  readonly preserveOrder?: boolean;
}

export interface OrderedBatch {
  readonly strokes: BrushStroke[];
  readonly nextZ: number;
}

/**
 * Stamps a batch with authoritative paint order and ownership. The server owns `zIndex` so every
 * client agrees on the stacking of an eraser gesture's remnants; a batch gets one contiguous
 * block so the remnants of a single stroke can never be interleaved with another user's edit.
 */
export function applyBatchOrder(
  strokes: readonly BrushStroke[],
  context: BatchOrderContext,
): OrderedBatch {
  let z = context.nextZ;
  const out: BrushStroke[] = [];
  for (const stroke of strokes) {
    const restored = context.preserveOrder && isIssuedOrder(stroke.zIndex, context.nextZ);
    out.push({ ...stroke, zIndex: restored ? stroke.zIndex : z++, ownerId: context.ownerId });
  }
  return { strokes: out, nextZ: z };
}

/**
 * True when `zIndex` is one this server actually handed out. Every assigned slot sits below the
 * running counter, so a value at or above it was never issued here — stale, forged or corrupted —
 * and must not steer paint order. Ownership is never restored this way: `ownerId` stays
 * server-stamped, as `BrushStroke` documents.
 */
function isIssuedOrder(zIndex: number, nextZ: number): boolean {
  return Number.isInteger(zIndex) && zIndex >= 0 && zIndex < nextZ;
}
